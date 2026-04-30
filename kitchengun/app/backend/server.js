const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5001;
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../frontend/dist');
const INGRESS_ONLY = process.env.INGRESS_ONLY === 'true';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

app.use((req, res, next) => {
  if (!INGRESS_ONLY) return next();

  const remoteAddress = req.socket.remoteAddress || '';
  const forwardedHost = req.get('x-forwarded-host') || '';
  const forwardedProto = req.get('x-forwarded-proto') || '';

  if (remoteAddress.includes('172.30.32.2')) return next();
  if (forwardedHost && forwardedProto) return next();

  return res.status(403).json({ error: 'Forbidden' });
});

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const dbExec = (sql) =>
  new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function toNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value) {
  const date = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Datum muss im Format YYYY-MM-DD übergeben werden.');
    error.status = 400;
    throw error;
  }
  return date;
}

function normalizeIngredient(ingredient) {
  const name = normalizeText(ingredient?.name);
  if (!name) return null;

  return {
    name,
    amount: toNumber(ingredient.amount),
    unit: normalizeText(ingredient.unit)
  };
}

function normalizeRecipePayload(body) {
  const title = normalizeText(body.title);
  const instructions = normalizeText(body.instructions);
  const portions = Math.max(1, toNumber(body.portions, 2));

  if (!title) {
    const error = new Error('Der Rezeptname ist erforderlich.');
    error.status = 400;
    throw error;
  }

  if (!instructions) {
    const error = new Error('Die Zubereitungsschritte sind erforderlich.');
    error.status = 400;
    throw error;
  }

  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients.map(normalizeIngredient).filter(Boolean)
    : [];

  return {
    title,
    image: normalizeText(body.image) || null,
    prep_time: Math.max(0, toNumber(body.prep_time, 0)),
    cook_time: Math.max(0, toNumber(body.cook_time, 0)),
    portions,
    instructions,
    category: normalizeText(body.category) || 'Allgemein',
    source: normalizeText(body.source) || null,
    source_id: normalizeText(body.source_id) || null,
    ingredients
  };
}

async function saveIngredients(recipeId, ingredients) {
  await dbRun('DELETE FROM ingredients WHERE recipe_id = ?', [recipeId]);

  for (const ingredient of ingredients) {
    await dbRun(
      'INSERT INTO ingredients (recipe_id, name, amount, unit) VALUES (?, ?, ?, ?)',
      [recipeId, ingredient.name, ingredient.amount, ingredient.unit]
    );
  }
}

async function getRecipeWithIngredients(id) {
  const recipe = await dbGet('SELECT * FROM recipes WHERE id = ?', [id]);
  if (!recipe) return null;

  recipe.ingredients = await dbAll(
    'SELECT id, recipe_id, name, amount, unit FROM ingredients WHERE recipe_id = ? ORDER BY id ASC',
    [id]
  );
  return recipe;
}

async function addShoppingItem(item) {
  const name = normalizeText(item.name);
  if (!name) return null;

  const unit = normalizeText(item.unit);
  const amount = toNumber(item.amount);
  const searchName = name.toLowerCase();
  const searchUnit = unit.toLowerCase();

  const existing = await dbGet(
    'SELECT * FROM shopping_list WHERE LOWER(TRIM(name)) = ? AND LOWER(TRIM(COALESCE(unit, ""))) = ? AND checked = 0',
    [searchName, searchUnit]
  );

  if (existing && amount !== null && existing.amount !== null) {
    const newAmount = Number(existing.amount) + amount;
    await dbRun('UPDATE shopping_list SET amount = ? WHERE id = ?', [newAmount, existing.id]);
    return { ...existing, amount: newAmount };
  }

  const result = await dbRun(
    'INSERT INTO shopping_list (name, amount, unit, checked) VALUES (?, ?, ?, 0)',
    [name, amount, unit]
  );

  return { id: result.lastID, name, amount, unit, checked: 0 };
}

async function addRecipeIngredientsToShoppingList(recipeId, portions) {
  const recipe = await getRecipeWithIngredients(recipeId);
  if (!recipe) {
    const error = new Error('Rezept nicht gefunden.');
    error.status = 404;
    throw error;
  }

  const targetPortions = Math.max(1, toNumber(portions, recipe.portions || 1));
  const multiplier = targetPortions / (recipe.portions || 1);
  const added = [];

  for (const ingredient of recipe.ingredients) {
    const saved = await addShoppingItem({
      name: ingredient.name,
      amount: ingredient.amount ? ingredient.amount * multiplier : null,
      unit: ingredient.unit
    });
    if (saved) added.push(saved);
  }

  return { recipe, count: added.length };
}

function imageFromTemplate(template) {
  return template ? template.replace('<format>', 'crop-960x720') : null;
}

function ingredientsFromChefkoch(data) {
  return Array.isArray(data.ingredientGroups)
    ? data.ingredientGroups.flatMap((group) =>
        Array.isArray(group.ingredients)
          ? group.ingredients.map((ingredient) => ({
              name: ingredient.name,
              amount: ingredient.amount,
              unit: ingredient.unit
            }))
          : []
      )
    : [];
}

function normalizeChefkochRecipe(data, id) {
  return {
    id,
    title: data.title,
    image: imageFromTemplate(data.previewImageUrlTemplate),
    prep_time: data.preparationTime || 0,
    cook_time: data.cookingTime || 0,
    portions: data.servings || 2,
    instructions: data.instructions,
    category: 'Importiert',
    source: 'chefkoch',
    source_id: id,
    ingredients: ingredientsFromChefkoch(data),
    rating: data.rating?.rating
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'KitchenGun',
    version: process.env.APP_VERSION || process.env.npm_package_version || '1.3.0'
  });
});

app.get(
  '/api/stats',
  asyncHandler(async (req, res) => {
    const [recipes, favorites, shopping, checked, planned] = await Promise.all([
      dbGet('SELECT COUNT(*) AS count FROM recipes'),
      dbGet('SELECT COUNT(*) AS count FROM recipes WHERE favorite = 1'),
      dbGet('SELECT COUNT(*) AS count FROM shopping_list'),
      dbGet('SELECT COUNT(*) AS count FROM shopping_list WHERE checked = 1'),
      dbGet('SELECT COUNT(*) AS count FROM meal_plan WHERE recipe_id IS NOT NULL')
    ]);

    const categories = await dbAll(
      'SELECT COALESCE(NULLIF(TRIM(category), ""), "Allgemein") AS category, COUNT(*) AS count FROM recipes GROUP BY category ORDER BY count DESC, category ASC'
    );

    res.json({
      recipes: recipes.count,
      favorites: favorites.count,
      shoppingItems: shopping.count,
      checkedItems: checked.count,
      plannedMeals: planned.count,
      categories
    });
  })
);

// --- RECIPES API ---

app.get(
  '/api/recipes',
  asyncHandler(async (req, res) => {
    const search = normalizeText(req.query.search);
    const category = normalizeText(req.query.category);
    const favoritesOnly = req.query.favorite === '1' || req.query.favorite === 'true';
    const where = [];
    const params = [];

    if (search) {
      where.push('(LOWER(title) LIKE ? OR LOWER(category) LIKE ? OR LOWER(instructions) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }

    if (category && category !== 'Alle') {
      where.push('category = ?');
      params.push(category);
    }

    if (favoritesOnly) {
      where.push('favorite = 1');
    }

    const rows = await dbAll(
      `SELECT r.*,
              COUNT(i.id) AS ingredient_count,
              COALESCE(r.prep_time, 0) + COALESCE(r.cook_time, 0) AS total_time
       FROM recipes r
       LEFT JOIN ingredients i ON i.recipe_id = r.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY r.id
       ORDER BY datetime(COALESCE(r.updated_at, r.created_at, '1970-01-01')) DESC, r.title ASC`,
      params
    );

    res.json(rows);
  })
);

app.get(
  '/api/recipes/:id',
  asyncHandler(async (req, res) => {
    const recipe = await getRecipeWithIngredients(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    res.json(recipe);
  })
);

app.patch(
  '/api/recipes/:id/favorite',
  asyncHandler(async (req, res) => {
    const favorite = req.body.favorite ? 1 : 0;
    const result = await dbRun(
      'UPDATE recipes SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [favorite, req.params.id]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    res.json({ id: Number(req.params.id), favorite });
  })
);

app.post(
  '/api/recipes',
  asyncHandler(async (req, res) => {
    const recipe = normalizeRecipePayload(req.body);

    await dbExec('BEGIN TRANSACTION');
    try {
      const result = await dbRun(
        `INSERT INTO recipes
          (title, image, prep_time, cook_time, portions, instructions, category, source, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          recipe.title,
          recipe.image,
          recipe.prep_time,
          recipe.cook_time,
          recipe.portions,
          recipe.instructions,
          recipe.category,
          recipe.source,
          recipe.source_id
        ]
      );
      await saveIngredients(result.lastID, recipe.ingredients);
      await dbExec('COMMIT');
      res.status(201).json({ id: result.lastID, message: 'Rezept erstellt.' });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
  })
);

app.put(
  '/api/recipes/:id',
  asyncHandler(async (req, res) => {
    const recipe = normalizeRecipePayload(req.body);
    const existing = await dbGet('SELECT id FROM recipes WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Rezept nicht gefunden.' });

    await dbExec('BEGIN TRANSACTION');
    try {
      await dbRun(
        `UPDATE recipes
         SET title = ?, image = ?, prep_time = ?, cook_time = ?, portions = ?,
             instructions = ?, category = ?, source = ?, source_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          recipe.title,
          recipe.image,
          recipe.prep_time,
          recipe.cook_time,
          recipe.portions,
          recipe.instructions,
          recipe.category,
          recipe.source,
          recipe.source_id,
          req.params.id
        ]
      );
      await saveIngredients(req.params.id, recipe.ingredients);
      await dbExec('COMMIT');
      res.json({ message: 'Rezept aktualisiert.' });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
  })
);

app.delete(
  '/api/recipes/:id',
  asyncHandler(async (req, res) => {
    await dbExec('BEGIN TRANSACTION');
    try {
      await dbRun('DELETE FROM ingredients WHERE recipe_id = ?', [req.params.id]);
      await dbRun('DELETE FROM meal_plan WHERE recipe_id = ?', [req.params.id]);
      const result = await dbRun('DELETE FROM recipes WHERE id = ?', [req.params.id]);
      await dbExec('COMMIT');

      if (result.changes === 0) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
      res.json({ message: 'Rezept gelöscht.' });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
  })
);

// --- MEAL PLAN API ---

app.get(
  '/api/meal-plan',
  asyncHandler(async (req, res) => {
    const start = normalizeDate(req.query.start || new Date().toISOString().slice(0, 10));
    const days = Math.min(31, Math.max(1, toNumber(req.query.days, 7)));

    const rows = await dbAll(
      `SELECT mp.id, mp.plan_date, mp.meal_slot, mp.recipe_id, mp.portions, mp.notes,
              r.title, r.image, r.category,
              COALESCE(r.prep_time, 0) + COALESCE(r.cook_time, 0) AS total_time
       FROM meal_plan mp
       LEFT JOIN recipes r ON r.id = mp.recipe_id
       WHERE date(mp.plan_date) >= date(?)
         AND date(mp.plan_date) < date(?, '+' || ? || ' day')
       ORDER BY mp.plan_date ASC,
                CASE mp.meal_slot
                  WHEN 'breakfast' THEN 1
                  WHEN 'lunch' THEN 2
                  WHEN 'dinner' THEN 3
                  ELSE 4
                END ASC`,
      [start, start, days]
    );

    res.json(rows);
  })
);

app.put(
  '/api/meal-plan',
  asyncHandler(async (req, res) => {
    const planDate = normalizeDate(req.body.plan_date);
    const mealSlot = normalizeText(req.body.meal_slot) || 'dinner';
    const allowedSlots = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
    if (!allowedSlots.has(mealSlot)) return res.status(400).json({ error: 'Ungültiger Mahlzeiten-Slot.' });

    const recipeId = toNumber(req.body.recipe_id);
    if (recipeId !== null) {
      const recipe = await dbGet('SELECT id FROM recipes WHERE id = ?', [recipeId]);
      if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    }

    const portions = Math.max(1, toNumber(req.body.portions, 2));
    const notes = normalizeText(req.body.notes) || null;
    const result = await dbRun(
      `INSERT INTO meal_plan (plan_date, meal_slot, recipe_id, portions, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(plan_date, meal_slot)
       DO UPDATE SET recipe_id = excluded.recipe_id,
                     portions = excluded.portions,
                     notes = excluded.notes,
                     updated_at = CURRENT_TIMESTAMP`,
      [planDate, mealSlot, recipeId, portions, notes]
    );

    const row = await dbGet(
      `SELECT mp.id, mp.plan_date, mp.meal_slot, mp.recipe_id, mp.portions, mp.notes,
              r.title, r.image, r.category
       FROM meal_plan mp
       LEFT JOIN recipes r ON r.id = mp.recipe_id
       WHERE mp.plan_date = ? AND mp.meal_slot = ?`,
      [planDate, mealSlot]
    );

    res.status(result.lastID ? 201 : 200).json(row);
  })
);

app.delete(
  '/api/meal-plan/:id',
  asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM meal_plan WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Planung nicht gefunden.' });
    res.json({ message: 'Planung entfernt.' });
  })
);

app.post(
  '/api/meal-plan/:id/shopping-list',
  asyncHandler(async (req, res) => {
    const plan = await dbGet('SELECT * FROM meal_plan WHERE id = ?', [req.params.id]);
    if (!plan || !plan.recipe_id) return res.status(404).json({ error: 'Geplantes Rezept nicht gefunden.' });

    const result = await addRecipeIngredientsToShoppingList(plan.recipe_id, plan.portions);
    res.status(201).json({
      message: 'Zutaten hinzugefügt.',
      count: result.count,
      recipe: result.recipe.title
    });
  })
);

// --- SHOPPING LIST API ---

app.get(
  '/api/shopping-list',
  asyncHandler(async (req, res) => {
    const rows = await dbAll(
      `SELECT id, name, amount, unit, checked
       FROM shopping_list
       ORDER BY checked ASC, LOWER(name) ASC`
    );
    res.json(rows);
  })
);

app.post(
  '/api/shopping-list',
  asyncHandler(async (req, res) => {
    const item = await addShoppingItem(req.body);
    if (!item) return res.status(400).json({ error: 'Der Artikelname ist erforderlich.' });
    res.status(201).json(item);
  })
);

app.post(
  '/api/shopping-list/bulk',
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Keine Artikel übergeben.' });

    const added = [];
    await dbExec('BEGIN TRANSACTION');
    try {
      for (const item of items) {
        const saved = await addShoppingItem(item);
        if (saved) added.push(saved);
      }
      await dbExec('COMMIT');
      res.status(201).json({ message: 'Artikel hinzugefügt.', count: added.length });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
  })
);

app.patch(
  '/api/shopping-list/:id',
  asyncHandler(async (req, res) => {
    const result = await dbRun('UPDATE shopping_list SET checked = ? WHERE id = ?', [
      req.body.checked ? 1 : 0,
      req.params.id
    ]);

    if (result.changes === 0) return res.status(404).json({ error: 'Artikel nicht gefunden.' });
    res.json({ message: 'Artikel aktualisiert.' });
  })
);

app.delete(
  '/api/shopping-list/:id',
  asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM shopping_list WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Artikel nicht gefunden.' });
    res.json({ message: 'Artikel gelöscht.' });
  })
);

app.delete(
  '/api/shopping-list-clear',
  asyncHandler(async (req, res) => {
    const result = await dbRun('DELETE FROM shopping_list WHERE checked = 1');
    res.json({ message: 'Erledigte Artikel gelöscht.', count: result.changes });
  })
);

// --- CHEFKOCH API ---

app.get(
  '/api/chefkoch/search',
  asyncHandler(async (req, res) => {
    const q = normalizeText(req.query.q);
    if (!q) return res.status(400).json({ error: 'Suchbegriff fehlt.' });

    const response = await fetch(`https://api.chefkoch.de/v2/recipes?query=${encodeURIComponent(q)}&limit=30`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Chefkoch ist aktuell nicht erreichbar.' });
    }

    const data = await response.json();
    const results = Array.isArray(data.results)
      ? data.results.map((r) => ({
          id: r.recipe.id,
          title: r.recipe.title,
          image: imageFromTemplate(r.recipe.previewImageUrlTemplate),
          prepTime: r.recipe.preparationTime,
          rating: r.recipe.rating?.rating
        }))
      : [];

    res.json(results);
  })
);

app.get(
  '/api/chefkoch/recipes/:id',
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id);
    if (!id) return res.status(400).json({ error: 'Rezept-ID fehlt.' });

    const response = await fetch(`https://api.chefkoch.de/v2/recipes/${encodeURIComponent(id)}`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Das Rezept konnte bei Chefkoch nicht geladen werden.' });
    }

    const data = await response.json();
    const existing = await dbGet('SELECT id FROM recipes WHERE source = ? AND source_id = ?', ['chefkoch', id]);
    res.json({
      ...normalizeChefkochRecipe(data, id),
      alreadyImportedId: existing?.id || null
    });
  })
);

app.post(
  '/api/chefkoch/import',
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.body.id);
    if (!id) return res.status(400).json({ error: 'Rezept-ID fehlt.' });

    const response = await fetch(`https://api.chefkoch.de/v2/recipes/${encodeURIComponent(id)}`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Das Rezept konnte bei Chefkoch nicht geladen werden.' });
    }

    const data = await response.json();
    const recipe = normalizeRecipePayload(normalizeChefkochRecipe(data, id));

    const existing = await dbGet('SELECT id FROM recipes WHERE source = ? AND source_id = ?', ['chefkoch', id]);
    if (existing) {
      return res.status(409).json({ error: 'Dieses Rezept wurde bereits importiert.', id: existing.id });
    }

    await dbExec('BEGIN TRANSACTION');
    try {
      const result = await dbRun(
        `INSERT INTO recipes
          (title, image, prep_time, cook_time, portions, instructions, category, source, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          recipe.title,
          recipe.image,
          recipe.prep_time,
          recipe.cook_time,
          recipe.portions,
          recipe.instructions,
          recipe.category,
          recipe.source,
          recipe.source_id
        ]
      );
      await saveIngredients(result.lastID, recipe.ingredients);
      await dbExec('COMMIT');
      res.status(201).json({ id: result.lastID, message: 'Rezept importiert.' });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
  })
);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' });
});

if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Interner Serverfehler.' });
});

app.listen(PORT, (err) => {
  if (err) {
    console.error(`KitchenGun failed to listen on port ${PORT}`, err);
    process.exit(1);
  }

  console.log(`KitchenGun server running on port ${PORT}`);
});
