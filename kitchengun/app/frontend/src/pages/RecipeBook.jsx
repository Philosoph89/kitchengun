import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChefHat, Clock, Heart, Plus, Search, ShoppingCart, Users } from 'lucide-react';
import { api } from '../lib/api';

const fallbackImage =
  'https://images.unsplash.com/photo-1495195134817-a1a2807b9361?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

const compactDayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const shortWeekdayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const slotLabels = {
  breakfast: 'Frühstück',
  lunch: 'Mittag',
  dinner: 'Abend',
  snack: 'Snack'
};

function toIsoDate(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export default function RecipeBook() {
  const [recipes, setRecipes] = useState([]);
  const [stats, setStats] = useState(null);
  const [mealPlan, setMealPlan] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Alle');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRecipes() {
      setLoading(true);
      setError('');
      try {
        const [recipeData, statsData, planData] = await Promise.all([
          api.getRecipes({ search, category: category === 'Alle' ? '' : category, favorite: favoritesOnly ? '1' : '' }),
          api.getStats(),
          api.getMealPlan(toIsoDate(startOfWeek()), 7)
        ]);

        if (!cancelled) {
          setRecipes(recipeData);
          setStats(statsData);
          setMealPlan(planData);
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
  }, [search, category, favoritesOnly]);

  const categories = useMemo(() => {
    const fromStats = stats?.categories?.map((item) => item.category).filter(Boolean) || [];
    const fromRecipes = recipes.map((recipe) => recipe.category).filter(Boolean);
    return ['Alle', ...Array.from(new Set([...fromStats, ...fromRecipes]))];
  }, [recipes, stats]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(), index)), []);
  const todayIso = toIsoDate(new Date());
  const mealPlanByDay = useMemo(() => {
    const map = new Map();
    mealPlan
      .filter((entry) => entry.recipe_id)
      .forEach((entry) => {
        const current = map.get(entry.plan_date) || [];
        current.push(entry);
        map.set(entry.plan_date, current);
      });
    return map;
  }, [mealPlan]);
  const todayMeals = mealPlanByDay.get(todayIso) || [];

  const toggleFavorite = async (recipe, event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextFavorite = recipe.favorite ? 0 : 1;
    setRecipes((current) => current.map((item) => (item.id === recipe.id ? { ...item, favorite: nextFavorite } : item)));
    try {
      await api.toggleFavorite(recipe.id, nextFavorite);
      setStats((current) =>
        current
          ? {
              ...current,
              favorites: Math.max(0, (current.favorites || 0) + (nextFavorite ? 1 : -1))
            }
          : current
      );
    } catch (err) {
      setError(err.message);
      setRecipes((current) => current.map((item) => (item.id === recipe.id ? { ...item, favorite: recipe.favorite } : item)));
    }
  };

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
          <Heart size={20} />
          <div>
            <strong>{stats?.favorites ?? 0}</strong>
            <span>Favoriten</span>
          </div>
        </div>
        <div className="metric">
          <Users size={20} />
          <div>
            <strong>{stats?.categories?.length ?? 0}</strong>
            <span>Kategorien</span>
          </div>
        </div>
        <div className="metric">
          <CalendarDays size={20} />
          <div>
            <strong>{stats?.plannedMeals ?? 0}</strong>
            <span>geplant</span>
          </div>
        </div>
      </section>

      <section className="home-plan-panel">
        <div className="home-plan-header">
          <div>
            <p className="eyebrow">Diese Woche</p>
            <h2>Wochenplan</h2>
          </div>
          <Link to="/planner" className="btn btn-secondary compact">
            <CalendarDays size={16} />
            Planer öffnen
          </Link>
        </div>

        {todayMeals.length ? (
          <div className="today-menu">
            <div className="today-menu-label">
              <span>Heute gibt es</span>
              <strong>{compactDayFormatter.format(new Date(todayIso))}</strong>
            </div>
            <div className="today-menu-meals">
              {todayMeals.map((entry) => (
                <Link to={`/recipe/${entry.recipe_id}`} className="today-meal-card" key={entry.id}>
                  {entry.image && <img src={entry.image} alt="" />}
                  <span>
                    <small>{slotLabels[entry.meal_slot] || entry.meal_slot}</small>
                    <strong>{entry.title}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="today-menu empty">
            <div className="today-menu-label">
              <span>Heute gibt es</span>
              <strong>Noch offen</strong>
            </div>
            <Link to="/planner" className="btn btn-primary compact">
              <Plus size={16} />
              Heute planen
            </Link>
          </div>
        )}

        <div className="home-week-board" aria-label="Wochenplan">
          {weekDays.map((day) => {
            const dayIso = toIsoDate(day);
            const entries = mealPlanByDay.get(dayIso) || [];
            const isToday = dayIso === todayIso;
            return (
              <Link to="/planner" className={`home-week-day ${isToday ? 'today' : ''}`} key={dayIso}>
                <div className="home-week-day-head">
                  <strong>{shortWeekdayFormatter.format(day)}</strong>
                  <span>{day.getDate()}</span>
                </div>
                <div className="home-week-meals">
                  {entries.length ? (
                    entries.slice(0, 3).map((entry) => (
                      <span key={entry.id}>
                        <small>{slotLabels[entry.meal_slot] || entry.meal_slot}</small>
                        {entry.title}
                      </span>
                    ))
                  ) : (
                    <em>frei</em>
                  )}
                </div>
              </Link>
            );
          })}
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
          <button type="button" className={favoritesOnly ? 'active' : ''} onClick={() => setFavoritesOnly((value) => !value)}>
            Favoriten
          </button>
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
            <article key={recipe.id} className="recipe-card">
              <button
                className={`favorite-button ${recipe.favorite ? 'active' : ''}`}
                onClick={(event) => toggleFavorite(recipe, event)}
                title={recipe.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
              >
                <Heart size={18} fill={recipe.favorite ? 'currentColor' : 'none'} />
              </button>
              <Link to={`/recipe/${recipe.id}`} className="recipe-card-link">
                <img src={recipe.image || fallbackImage} alt={recipe.title} className="recipe-image" />
                <div className="recipe-content">
                  <div className="recipe-card-topline">
                    <div className="tag">{recipe.category || 'Allgemein'}</div>
                  </div>
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
