const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5001;
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../frontend/dist');
const INGRESS_ONLY = process.env.INGRESS_ONLY === 'true';
const PUBLIC_CARD_PATHS = new Set(['/today-card', '/api/meal-plan/today']);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', true);

app.use((req, res, next) => {
  if (!INGRESS_ONLY) return next();
  const requestPath = req.path.replace(/\/+$/, '') || '/';
  if ((req.method === 'GET' || req.method === 'HEAD') && PUBLIC_CARD_PATHS.has(requestPath)) {
    return next();
  }

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

const UNIT_ALIASES = new Map([
  ['g', 'g'], ['gr', 'g'], ['gramm', 'g'], ['gram', 'g'],
  ['kg', 'kg'], ['kilogramm', 'kg'],
  ['mg', 'mg'], ['milligramm', 'mg'],
  ['ml', 'ml'], ['milliliter', 'ml'],
  ['cl', 'cl'], ['zentiliter', 'cl'],
  ['l', 'l'], ['liter', 'l'],
  ['tl', 'tl'], ['teelöffel', 'tl'], ['teeloeffel', 'tl'],
  ['el', 'el'], ['esslöffel', 'el'], ['essloeffel', 'el'],
  ['stück', 'Stück'], ['stueck', 'Stück'], ['stk', 'Stück'], ['st', 'Stück'],
  ['packung', 'Packung'], ['pkg', 'Packung'], ['paket', 'Packung'],
  ['dose', 'Dose'], ['dosen', 'Dose'],
  ['bund', 'Bund'], ['becher', 'Becher'], ['glas', 'Glas']
]);

const UNIT_DEFINITIONS = {
  mg: { group: 'mass', factor: 0.001 },
  g: { group: 'mass', factor: 1 },
  kg: { group: 'mass', factor: 1000 },
  ml: { group: 'volume', factor: 1 },
  cl: { group: 'volume', factor: 10 },
  l: { group: 'volume', factor: 1000 },
  tl: { group: 'volume', factor: 5 },
  el: { group: 'volume', factor: 15 },
  'Stück': { group: 'count', factor: 1 },
  Packung: { group: 'package', factor: 1 },
  Dose: { group: 'package', factor: 1 },
  Bund: { group: 'package', factor: 1 },
  Becher: { group: 'package', factor: 1 },
  Glas: { group: 'package', factor: 1 }
};

function normalizeUnit(value) {
  const unit = normalizeText(value);
  if (!unit) return '';
  return UNIT_ALIASES.get(unit.toLowerCase().replace(/[.]/g, '')) || unit;
}

function amountInBase(amount, unit) {
  const number = toNumber(amount);
  const normalizedUnit = normalizeUnit(unit);
  const definition = UNIT_DEFINITIONS[normalizedUnit];
  if (number === null || !definition) return null;
  return { value: number * definition.factor, group: definition.group, factor: definition.factor };
}

const INGREDIENT_STOP_WORDS = new Set([
  'und', 'oder', 'etwas', 'nach', 'geschmack', 'frisch', 'frische', 'frischer', 'frisches',
  'gehackt', 'gehackte', 'gerieben', 'geriebene', 'klein', 'gross', 'groß', 'fein',
  'optional', 'zum', 'zur', 'fuer', 'fur', 'für', 'die', 'der', 'das', 'ein', 'eine'
]);

function ingredientTokens(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !INGREDIENT_STOP_WORDS.has(token))
    .map((token) => {
      if (token.length > 6 && token.endsWith('en')) return token.slice(0, -2);
      if (token.length > 5 && token.endsWith('er')) return token.slice(0, -2);
      if (token.length > 4 && token.endsWith('e')) return token.slice(0, -1);
      if (token.length > 4 && token.endsWith('n')) return token.slice(0, -1);
      return token;
    });
}

function ingredientMatchScore(ingredientName, inventoryName) {
  const ingredient = ingredientTokens(ingredientName);
  const inventory = ingredientTokens(inventoryName);
  if (!ingredient.length || !inventory.length) return 0;

  const ingredientText = ingredient.join(' ');
  const inventoryText = inventory.join(' ');
  if (ingredientText === inventoryText) return 100;
  if (ingredientText.includes(inventoryText) || inventoryText.includes(ingredientText)) return 82;

  const matches = ingredient.filter((token) =>
    inventory.some((candidate) => candidate === token || (token.length > 4 && candidate.length > 4 && (token.startsWith(candidate) || candidate.startsWith(token))))
  ).length;
  const coverage = matches / Math.min(ingredient.length, inventory.length);
  return coverage >= 0.6 ? Math.round(coverage * 70) : 0;
}

function normalizeInventoryPayload(body) {
  const name = normalizeText(body.name);
  if (!name) {
    const error = new Error('Der Lebensmittelname ist erforderlich.');
    error.status = 400;
    throw error;
  }

  const quantity = Math.max(0, toNumber(body.quantity, 0));
  const minimumQuantity = Math.max(0, toNumber(body.minimum_quantity, 0));
  const expiresAt = normalizeText(body.expires_at);
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    const error = new Error('Das Mindesthaltbarkeitsdatum muss im Format YYYY-MM-DD vorliegen.');
    error.status = 400;
    throw error;
  }

  return {
    name,
    quantity,
    unit: normalizeUnit(body.unit),
    barcode: normalizeText(body.barcode) || null,
    image: normalizeText(body.image) || null,
    brand: normalizeText(body.brand) || null,
    category: normalizeText(body.category) || 'Sonstiges',
    minimum_quantity: minimumQuantity,
    expires_at: expiresAt || null,
    notes: normalizeText(body.notes) || null,
    source: normalizeText(body.source) || 'manual'
  };
}

function findInventoryMatch(ingredient, inventoryItems) {
  const required = amountInBase(ingredient.amount, ingredient.unit);
  const candidates = inventoryItems
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => {
      const score = ingredientMatchScore(ingredient.name, item.name);
      const stock = amountInBase(item.quantity, item.unit);
      const compatible = Boolean(required && stock && required.group === stock.group);
      return { item, score: score + (compatible ? 8 : 0), stock, compatible };
    })
    .filter((candidate) => candidate.score >= 60)
    .sort((a, b) => b.score - a.score || Number(b.item.quantity) - Number(a.item.quantity));

  return candidates[0] || null;
}

function buildInventoryUsage(recipe, inventoryItems, portions) {
  const targetPortions = Math.max(1, toNumber(portions, recipe.portions || 1));
  const multiplier = targetPortions / (recipe.portions || 1);
  const ingredients = (recipe.ingredients || []).map((ingredient) => {
    const requiredAmount = ingredient.amount === null ? null : Number(ingredient.amount) * multiplier;
    const scaledIngredient = { ...ingredient, amount: requiredAmount };
    const match = findInventoryMatch(scaledIngredient, inventoryItems);
    const required = amountInBase(requiredAmount, ingredient.unit);
    const stock = match?.stock || null;
    const sufficient = Boolean(
      match && (!required || !match.compatible || stock.value + Number.EPSILON >= required.value)
    );
    const deduction = match && required && match.compatible
      ? required.value / stock.factor
      : null;

    return {
      ingredient_id: ingredient.id,
      name: ingredient.name,
      required_amount: requiredAmount,
      required_unit: normalizeUnit(ingredient.unit),
      status: !match ? 'missing' : sufficient ? 'available' : 'insufficient',
      inventory_item_id: match?.item.id || null,
      inventory_name: match?.item.name || null,
      inventory_quantity: match ? Number(match.item.quantity) : null,
      inventory_unit: match?.item.unit || '',
      deduction,
      can_deduct: deduction !== null && sufficient
    };
  });

  const availableCount = ingredients.filter((item) => item.status === 'available').length;
  return {
    recipe_id: recipe.id,
    recipe_title: recipe.title,
    portions: targetPortions,
    total: ingredients.length,
    available: availableCount,
    missing: ingredients.filter((item) => item.status === 'missing').length,
    insufficient: ingredients.filter((item) => item.status === 'insufficient').length,
    can_cook: ingredients.length > 0 && availableCount === ingredients.length,
    ingredients
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
    version: process.env.APP_VERSION || process.env.npm_package_version || '1.5.0'
  });
});

function todayCardHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KitchenGun Heute</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg-surface: #ffffff;
        --bg-subtle: #eef2ea;
        --text-primary: #172026;
        --text-secondary: #5b6770;
        --accent-primary: #178a55;
        --accent-warm: #c27803;
        --accent-danger: #dc2626;
        --border-color: #d9dfd4;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg-surface: #181f24;
          --bg-subtle: #222b31;
          --text-primary: #f3f6f8;
          --text-secondary: #bdc6cc;
          --border-color: #2f3a42;
        }
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        background: transparent;
        color: var(--text-primary);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.45;
      }
      .card {
        min-height: 100vh;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-surface);
        padding: 16px;
      }
      .head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }
      .head span {
        display: block;
        color: var(--accent-warm);
        font-size: 0.74rem;
        font-weight: 850;
        text-transform: uppercase;
      }
      .head strong {
        display: block;
        font-size: 1.15rem;
        line-height: 1.15;
      }
      .hero {
        display: grid;
        grid-template-columns: 82px 1fr;
        gap: 12px;
        align-items: center;
        border: 1px solid color-mix(in srgb, var(--accent-primary) 24%, var(--border-color));
        border-radius: 8px;
        background: color-mix(in srgb, var(--accent-primary) 9%, var(--bg-surface));
        padding: 10px;
      }
      .visual {
        width: 82px;
        aspect-ratio: 1;
        border-radius: 6px;
        display: grid;
        place-items: center;
        background: var(--bg-subtle);
        color: var(--accent-primary);
        overflow: hidden;
        font-size: 1.7rem;
      }
      .visual img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      small, .meta {
        display: block;
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 750;
      }
      h1 {
        margin: 2px 0 6px;
        font-size: 1.18rem;
        line-height: 1.15;
      }
      .meals {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      .meal {
        display: grid;
        grid-template-columns: 76px 1fr;
        gap: 8px;
        align-items: center;
        min-height: 42px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-subtle);
        padding: 8px 10px;
      }
      .meal span {
        color: var(--text-secondary);
        font-size: 0.78rem;
        font-weight: 800;
      }
      .meal strong {
        font-size: 0.95rem;
        line-height: 1.2;
      }
      .empty {
        display: grid;
        place-items: center;
        gap: 6px;
        min-height: 160px;
        border: 1px dashed var(--border-color);
        border-radius: 8px;
        background: var(--bg-subtle);
        color: var(--text-secondary);
        text-align: center;
        padding: 20px;
      }
      .error { color: var(--accent-danger); }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="head">
        <div>
          <span>Heute</span>
          <strong id="date">Essensplan</strong>
        </div>
        <div aria-hidden="true">KG</div>
      </div>
      <section id="content" class="empty">Essensplan wird geladen.</section>
    </main>
    <script>
      const labels = { breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abend', snack: 'Snack' };
      const today = new Date();
      const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      document.getElementById('date').textContent = new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      }).format(today);

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char]));
      }

      async function load() {
        const content = document.getElementById('content');
        try {
          const response = await fetch(new URL('./api/meal-plan/today?date=' + localToday, window.location.href));
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Essensplan konnte nicht geladen werden.');

          const meals = (data.meals || []).filter((meal) => meal.recipe_id);
          if (!meals.length) {
            content.className = 'empty';
            content.innerHTML = '<strong>Noch nichts geplant</strong><span>Der heutige Essensplan ist leer.</span>';
            return;
          }

          const hero = meals.find((meal) => meal.meal_slot === 'dinner') || meals[0];
          content.className = '';
          content.innerHTML = \`
            <section class="hero">
              <div class="visual">\${hero.image ? '<img src="' + escapeHtml(hero.image) + '" alt="">' : 'KG'}</div>
              <div>
                <small>\${escapeHtml(labels[hero.meal_slot] || hero.meal_slot)}</small>
                <h1>\${escapeHtml(hero.title)}</h1>
                <span class="meta">\${hero.total_time ? escapeHtml(hero.total_time) + ' Min' : escapeHtml(hero.portions || 2) + ' Portionen'}</span>
              </div>
            </section>
            <section class="meals">
              \${meals.map((meal) => \`
                <div class="meal">
                  <span>\${escapeHtml(labels[meal.meal_slot] || meal.meal_slot)}</span>
                  <strong>\${escapeHtml(meal.title)}</strong>
                </div>
              \`).join('')}
            </section>
          \`;
        } catch (err) {
          content.className = 'empty error';
          content.textContent = err.message || 'Essensplan konnte nicht geladen werden.';
        }
      }

      load();
    </script>
  </body>
</html>`;
}

app.get(['/today-card', '/today-card/'], (req, res) => {
  res.type('html').send(todayCardHtml());
});

app.get(
  '/api/stats',
  asyncHandler(async (req, res) => {
    const [recipes, favorites, shopping, checked, planned, inventory, lowStock] = await Promise.all([
      dbGet('SELECT COUNT(*) AS count FROM recipes'),
      dbGet('SELECT COUNT(*) AS count FROM recipes WHERE favorite = 1'),
      dbGet('SELECT COUNT(*) AS count FROM shopping_list'),
      dbGet('SELECT COUNT(*) AS count FROM shopping_list WHERE checked = 1'),
      dbGet('SELECT COUNT(*) AS count FROM meal_plan WHERE recipe_id IS NOT NULL'),
      dbGet('SELECT COUNT(*) AS count FROM inventory_items WHERE quantity > 0'),
      dbGet('SELECT COUNT(*) AS count FROM inventory_items WHERE quantity <= minimum_quantity')
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
      inventoryItems: inventory.count,
      lowStockItems: lowStock.count,
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
    const inventoryMode = normalizeText(req.query.inventory);
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

    if (!inventoryMode) return res.json(rows);

    const [ingredientRows, inventoryItems] = await Promise.all([
      dbAll('SELECT id, recipe_id, name, amount, unit FROM ingredients ORDER BY id ASC'),
      dbAll('SELECT * FROM inventory_items WHERE quantity > 0 ORDER BY updated_at DESC')
    ]);
    const ingredientsByRecipe = new Map();
    ingredientRows.forEach((ingredient) => {
      const current = ingredientsByRecipe.get(ingredient.recipe_id) || [];
      current.push(ingredient);
      ingredientsByRecipe.set(ingredient.recipe_id, current);
    });

    const recipesWithAvailability = rows.map((recipe) => {
      const availability = buildInventoryUsage(
        { ...recipe, ingredients: ingredientsByRecipe.get(recipe.id) || [] },
        inventoryItems,
        recipe.portions
      );
      return { ...recipe, inventory_availability: availability };
    });

    res.json(
      inventoryMode === 'available'
        ? recipesWithAvailability.filter((recipe) => recipe.inventory_availability.can_cook)
        : recipesWithAvailability
    );
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

app.get(
  '/api/recipes/:id/inventory-usage',
  asyncHandler(async (req, res) => {
    const recipe = await getRecipeWithIngredients(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    const inventoryItems = await dbAll('SELECT * FROM inventory_items WHERE quantity > 0 ORDER BY updated_at DESC');
    res.json(buildInventoryUsage(recipe, inventoryItems, req.query.portions));
  })
);

app.post(
  '/api/recipes/:id/consume-inventory',
  asyncHandler(async (req, res) => {
    const recipe = await getRecipeWithIngredients(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    const inventoryItems = await dbAll('SELECT * FROM inventory_items WHERE quantity > 0 ORDER BY updated_at DESC');
    const usage = buildInventoryUsage(recipe, inventoryItems, req.body.portions);

    if (!req.body.deduct) {
      return res.json({ message: 'Rezept als verarbeitet bestätigt. Der Vorrat blieb unverändert.', usage, deducted: 0 });
    }

    const deductions = usage.ingredients.filter((ingredient) => ingredient.can_deduct);
    await dbExec('BEGIN TRANSACTION');
    try {
      for (const deduction of deductions) {
        await dbRun(
          `UPDATE inventory_items
           SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [deduction.deduction, deduction.inventory_item_id]
        );
        await dbRun(
          `INSERT INTO inventory_movements (inventory_item_id, recipe_id, change_amount, reason)
           VALUES (?, ?, ?, ?)`,
          [deduction.inventory_item_id, recipe.id, -deduction.deduction, `Verarbeitet: ${recipe.title}`]
        );
      }
      await dbExec('COMMIT');
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }

    res.json({
      message: deductions.length
        ? `${deductions.length} Bestände wurden aktualisiert.`
        : 'Keine eindeutig umrechenbaren Bestände wurden verändert.',
      usage,
      deducted: deductions.length,
      skipped: usage.ingredients.length - deductions.length
    });
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

app.get(
  '/api/meal-plan/today',
  asyncHandler(async (req, res) => {
    const planDate = normalizeDate(req.query.date || new Date().toISOString().slice(0, 10));

    const rows = await dbAll(
      `SELECT mp.id, mp.plan_date, mp.meal_slot, mp.recipe_id, mp.portions, mp.notes,
              r.title, r.image, r.category,
              COALESCE(r.prep_time, 0) + COALESCE(r.cook_time, 0) AS total_time
       FROM meal_plan mp
       LEFT JOIN recipes r ON r.id = mp.recipe_id
       WHERE mp.plan_date = ?
       ORDER BY CASE mp.meal_slot
                  WHEN 'breakfast' THEN 1
                  WHEN 'lunch' THEN 2
                  WHEN 'dinner' THEN 3
                  ELSE 4
                END ASC`,
      [planDate]
    );

    res.json({ date: planDate, meals: rows });
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

// --- INVENTORY API ---

app.get(
  '/api/inventory',
  asyncHandler(async (req, res) => {
    const search = normalizeText(req.query.search).toLowerCase();
    const status = normalizeText(req.query.status);
    const where = [];
    const params = [];

    if (search) {
      where.push('(LOWER(name) LIKE ? OR LOWER(COALESCE(brand, "")) LIKE ? OR barcode LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (status === 'low') where.push('quantity <= minimum_quantity');
    if (status === 'available') where.push('quantity > 0');
    if (status === 'expiring') where.push("expires_at IS NOT NULL AND date(expires_at) <= date('now', '+7 day')");

    const rows = await dbAll(
      `SELECT i.*,
              CASE WHEN i.quantity <= i.minimum_quantity THEN 1 ELSE 0 END AS is_low,
              CASE WHEN i.expires_at IS NOT NULL AND date(i.expires_at) <= date('now', '+7 day') THEN 1 ELSE 0 END AS is_expiring
       FROM inventory_items i
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY is_low DESC, is_expiring DESC, LOWER(COALESCE(category, '')) ASC, LOWER(name) ASC`,
      params
    );
    res.json(rows);
  })
);

app.get(
  '/api/inventory/summary',
  asyncHandler(async (req, res) => {
    const [total, available, low, expiring] = await Promise.all([
      dbGet('SELECT COUNT(*) AS count FROM inventory_items'),
      dbGet('SELECT COUNT(*) AS count FROM inventory_items WHERE quantity > 0'),
      dbGet('SELECT COUNT(*) AS count FROM inventory_items WHERE quantity <= minimum_quantity'),
      dbGet("SELECT COUNT(*) AS count FROM inventory_items WHERE expires_at IS NOT NULL AND date(expires_at) <= date('now', '+7 day')")
    ]);
    const categories = await dbAll(
      `SELECT COALESCE(NULLIF(TRIM(category), ''), 'Sonstiges') AS category, COUNT(*) AS count
       FROM inventory_items GROUP BY category ORDER BY count DESC, category ASC`
    );
    res.json({
      total: total.count,
      available: available.count,
      low: low.count,
      expiring: expiring.count,
      categories
    });
  })
);

app.get(
  '/api/products/:barcode',
  asyncHandler(async (req, res) => {
    const barcode = normalizeText(req.params.barcode).replace(/\D/g, '');
    if (!/^\d{6,18}$/.test(barcode)) {
      return res.status(400).json({ error: 'Bitte einen gültigen Barcode eingeben.' });
    }

    const fields = [
      'code', 'product_name', 'product_name_de', 'generic_name_de', 'brands', 'quantity',
      'product_quantity', 'product_quantity_unit', 'image_front_url', 'image_url',
      'categories', 'categories_tags'
    ].join(',');
    let response;
    try {
      response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
        { headers: { 'User-Agent': 'KitchenGun/1.5 (Home Assistant add-on; product lookup)' } }
      );
    } catch {
      return res.status(502).json({ error: 'Die Produktdatenbank ist aktuell nicht erreichbar.' });
    }
    if (!response.ok) return res.status(502).json({ error: 'Die Produktdatenbank ist aktuell nicht erreichbar.' });

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return res.status(404).json({
        error: 'Produkt noch nicht gefunden. Du kannst die Angaben trotzdem manuell ergänzen.',
        barcode
      });
    }

    const product = data.product;
    let quantity = toNumber(product.product_quantity);
    let unit = normalizeUnit(product.product_quantity_unit);
    if (quantity === null || !unit) {
      const quantityMatch = normalizeText(product.quantity).match(/([\d.,]+)\s*([a-zA-ZÄÖÜäöü]+)/);
      if (quantityMatch) {
        quantity = toNumber(quantityMatch[1].replace(',', '.'));
        unit = normalizeUnit(quantityMatch[2]);
      }
    }

    const category = normalizeText(product.categories).split(',')[0]
      || normalizeText(product.categories_tags?.[0]).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')
      || 'Sonstiges';
    res.json({
      barcode: product.code || barcode,
      name: product.product_name_de || product.product_name || product.generic_name_de || 'Unbenanntes Produkt',
      brand: normalizeText(product.brands).split(',')[0] || null,
      quantity: quantity ?? 1,
      unit: unit || 'Stück',
      image: product.image_front_url || product.image_url || null,
      category,
      source: 'openfoodfacts'
    });
  })
);

app.post(
  '/api/inventory',
  asyncHandler(async (req, res) => {
    const item = normalizeInventoryPayload(req.body);
    if (item.barcode) {
      const existing = await dbGet('SELECT * FROM inventory_items WHERE barcode = ?', [item.barcode]);
      if (existing) {
        const quantity = Number(existing.quantity) + item.quantity;
        await dbRun(
          `UPDATE inventory_items
           SET name = ?, quantity = ?, unit = ?, image = COALESCE(?, image), brand = COALESCE(?, brand),
               category = ?, minimum_quantity = ?, expires_at = COALESCE(?, expires_at),
               notes = COALESCE(?, notes), source = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [item.name, quantity, item.unit, item.image, item.brand, item.category, item.minimum_quantity,
            item.expires_at, item.notes, item.source, existing.id]
        );
        await dbRun(
          'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason) VALUES (?, ?, ?)',
          [existing.id, item.quantity, 'Barcode erneut erfasst']
        );
        return res.status(200).json({ ...(await dbGet('SELECT * FROM inventory_items WHERE id = ?', [existing.id])), merged: true });
      }
    }

    const result = await dbRun(
      `INSERT INTO inventory_items
        (name, quantity, unit, barcode, image, brand, category, minimum_quantity, expires_at, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.name, item.quantity, item.unit, item.barcode, item.image, item.brand, item.category,
        item.minimum_quantity, item.expires_at, item.notes, item.source]
    );
    await dbRun(
      'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason) VALUES (?, ?, ?)',
      [result.lastID, item.quantity, item.barcode ? 'Per Barcode erfasst' : 'Manuell erfasst']
    );
    res.status(201).json(await dbGet('SELECT * FROM inventory_items WHERE id = ?', [result.lastID]));
  })
);

app.put(
  '/api/inventory/:id',
  asyncHandler(async (req, res) => {
    const item = normalizeInventoryPayload(req.body);
    const existing = await dbGet('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Vorrat nicht gefunden.' });

    try {
      await dbRun(
        `UPDATE inventory_items
         SET name = ?, quantity = ?, unit = ?, barcode = ?, image = ?, brand = ?, category = ?,
             minimum_quantity = ?, expires_at = ?, notes = ?, source = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [item.name, item.quantity, item.unit, item.barcode, item.image, item.brand, item.category,
          item.minimum_quantity, item.expires_at, item.notes, item.source, req.params.id]
      );
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Dieser Barcode ist bereits einem anderen Vorrat zugeordnet.' });
      }
      throw err;
    }
    const difference = item.quantity - Number(existing.quantity);
    if (difference !== 0) {
      await dbRun(
        'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason) VALUES (?, ?, ?)',
        [req.params.id, difference, 'Bestand bearbeitet']
      );
    }
    res.json(await dbGet('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]));
  })
);

app.patch(
  '/api/inventory/:id/quantity',
  asyncHandler(async (req, res) => {
    const existing = await dbGet('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Vorrat nicht gefunden.' });
    const delta = toNumber(req.body.delta);
    const absolute = toNumber(req.body.quantity);
    if (delta === null && absolute === null) return res.status(400).json({ error: 'Mengenänderung fehlt.' });
    const nextQuantity = Math.max(0, absolute !== null ? absolute : Number(existing.quantity) + delta);
    const change = nextQuantity - Number(existing.quantity);
    await dbRun('UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextQuantity, req.params.id]);
    if (change !== 0) {
      await dbRun(
        'INSERT INTO inventory_movements (inventory_item_id, change_amount, reason) VALUES (?, ?, ?)',
        [req.params.id, change, normalizeText(req.body.reason) || 'Menge angepasst']
      );
    }
    res.json(await dbGet('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]));
  })
);

app.delete(
  '/api/inventory/:id',
  asyncHandler(async (req, res) => {
    await dbExec('BEGIN TRANSACTION');
    try {
      await dbRun('DELETE FROM inventory_movements WHERE inventory_item_id = ?', [req.params.id]);
      const result = await dbRun('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
      await dbExec('COMMIT');
      if (result.changes === 0) return res.status(404).json({ error: 'Vorrat nicht gefunden.' });
      res.json({ message: 'Vorrat gelöscht.' });
    } catch (err) {
      await dbExec('ROLLBACK');
      throw err;
    }
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
