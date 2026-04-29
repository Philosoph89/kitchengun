const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create Tables
    db.serialize(() => {
      // Recipes Table
      db.run(`CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        image TEXT,
        prep_time INTEGER,
        cook_time INTEGER,
        portions INTEGER,
        instructions TEXT,
        category TEXT,
        source TEXT,
        source_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      // Ingredients Table
      db.run(`CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER,
        name TEXT NOT NULL,
        amount REAL,
        unit TEXT,
        FOREIGN KEY (recipe_id) REFERENCES recipes (id)
      )`);

      // Shopping List Table
      db.run(`CREATE TABLE IF NOT EXISTS shopping_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount REAL,
        unit TEXT,
        checked INTEGER DEFAULT 0
      )`);

      const recipeColumns = [
        ['source', 'TEXT'],
        ['source_id', 'TEXT'],
        ['created_at', 'TEXT'],
        ['updated_at', 'TEXT']
      ];

      recipeColumns.forEach(([column, type]) => {
        db.run(`ALTER TABLE recipes ADD COLUMN ${column} ${type}`, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error(`Error adding recipes.${column}`, alterErr.message);
          }
        });
      });

      db.run(`UPDATE recipes
              SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                  updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`);
    });
  }
});

module.exports = db;
