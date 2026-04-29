import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, Clock, Plus, Search, ShoppingCart, Users } from 'lucide-react';
import { api } from '../lib/api';

const fallbackImage =
  'https://images.unsplash.com/photo-1495195134817-a1a2807b9361?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

export default function RecipeBook() {
  const [recipes, setRecipes] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Alle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRecipes() {
      setLoading(true);
      setError('');
      try {
        const [recipeData, statsData] = await Promise.all([
          api.getRecipes({ search, category: category === 'Alle' ? '' : category }),
          api.getStats()
        ]);

        if (!cancelled) {
          setRecipes(recipeData);
          setStats(statsData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timeout = window.setTimeout(loadRecipes, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, category]);

  const categories = useMemo(() => {
    const fromStats = stats?.categories?.map((item) => item.category).filter(Boolean) || [];
    const fromRecipes = recipes.map((recipe) => recipe.category).filter(Boolean);
    return ['Alle', ...Array.from(new Set([...fromStats, ...fromRecipes]))];
  }, [recipes, stats]);

  return (
    <div className="stack-lg">
      <section className="page-header">
        <div>
          <p className="eyebrow">KitchenGun</p>
          <h1 className="page-title">Rezepte</h1>
        </div>
        <Link to="/recipe/new" className="btn btn-primary">
          <Plus size={20} />
          Neues Rezept
        </Link>
      </section>

      <section className="stats-grid" aria-label="Übersicht">
        <div className="metric">
          <ChefHat size={20} />
          <div>
            <strong>{stats?.recipes ?? recipes.length}</strong>
            <span>Rezepte</span>
          </div>
        </div>
        <div className="metric">
          <ShoppingCart size={20} />
          <div>
            <strong>{stats?.shoppingItems ?? 0}</strong>
            <span>Artikel offen</span>
          </div>
        </div>
        <div className="metric">
          <Users size={20} />
          <div>
            <strong>{stats?.categories?.length ?? 0}</strong>
            <span>Kategorien</span>
          </div>
        </div>
      </section>

      <section className="toolbar" aria-label="Rezepte filtern">
        <div className="search-control">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rezepte, Kategorien oder Zubereitung suchen"
          />
        </div>
        <div className="segmented-control">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={category === item ? 'active' : ''}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Rezepte werden geladen.</div>
      ) : recipes.length === 0 ? (
        <div className="empty-state">
          <h2>Keine passenden Rezepte</h2>
          <p>Lege ein neues Rezept an oder importiere eins über Entdecken.</p>
          <div className="empty-actions">
            <Link to="/recipe/new" className="btn btn-primary">
              <Plus size={18} />
              Rezept anlegen
            </Link>
            <Link to="/discover" className="btn btn-secondary">
              <Search size={18} />
              Entdecken
            </Link>
          </div>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipes.map((recipe) => (
            <Link to={`/recipe/${recipe.id}`} key={recipe.id} className="recipe-card">
              <img src={recipe.image || fallbackImage} alt={recipe.title} className="recipe-image" />
              <div className="recipe-content">
                <div className="tag">{recipe.category || 'Allgemein'}</div>
                <h2>{recipe.title}</h2>
                <div className="recipe-meta">
                  <span>
                    <Clock size={16} />
                    {recipe.total_time ?? (recipe.prep_time || 0) + (recipe.cook_time || 0)} Min
                  </span>
                  <span>
                    <Users size={16} />
                    {recipe.portions || 1} Portionen
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
