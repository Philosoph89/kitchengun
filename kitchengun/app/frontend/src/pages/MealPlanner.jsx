import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Users
} from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

const slots = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittag' },
  { id: 'dinner', label: 'Abend' },
  { id: 'snack', label: 'Snack' }
];

const dayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const longDayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

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

export default function MealPlanner() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [recipes, setRecipes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [activeSlot, setActiveSlot] = useState(null);
  const [mealRecipe, setMealRecipe] = useState('');
  const [mealPortions, setMealPortions] = useState(2);
  const [mealNotes, setMealNotes] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const start = toIsoDate(weekStart);

  const entriesByKey = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => map.set(`${entry.plan_date}:${entry.meal_slot}`, entry));
    return map;
  }, [entries]);

  const sortedRecipes = useMemo(
    () =>
      [...recipes].sort((a, b) => {
        if (Number(b.favorite) !== Number(a.favorite)) return Number(b.favorite) - Number(a.favorite);
        return a.title.localeCompare(b.title);
      }),
    [recipes]
  );

  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    if (!query) return sortedRecipes;
    return sortedRecipes.filter((recipe) =>
      [recipe.title, recipe.category].filter(Boolean).some((value) => value.toLowerCase().includes(query))
    );
  }, [recipeSearch, sortedRecipes]);

  const plannedEntries = entries.filter((entry) => entry.recipe_id);
  const plannedPortions = plannedEntries.reduce((sum, entry) => sum + (Number(entry.portions) || 0), 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [recipeData, planData] = await Promise.all([api.getRecipes(), api.getMealPlan(start, 7)]);
        if (!cancelled) {
          setRecipes(recipeData);
          setEntries(planData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [start]);

  const openPlanner = (day, slot, entry) => {
    const recipe = entry?.recipe_id ? recipes.find((item) => Number(item.id) === Number(entry.recipe_id)) : null;
    setActiveSlot({ date: toIsoDate(day), day, slot, entry });
    setMealRecipe(entry?.recipe_id || '');
    setMealPortions(entry?.portions || recipe?.portions || 2);
    setMealNotes(entry?.notes || '');
    setRecipeSearch('');
    setNotice('');
    setError('');
  };

  const closePlanner = () => {
    setActiveSlot(null);
    setMealRecipe('');
    setMealPortions(2);
    setMealNotes('');
    setRecipeSearch('');
  };

  const saveActiveEntry = async () => {
    if (!activeSlot || !mealRecipe) return;

    const key = `${activeSlot.date}:${activeSlot.slot.id}`;
    setSavingKey(key);
    setError('');
    setNotice('');
    try {
      const saved = await api.saveMealPlanEntry({
        plan_date: activeSlot.date,
        meal_slot: activeSlot.slot.id,
        recipe_id: Number(mealRecipe),
        portions: mealPortions,
        notes: mealNotes
      });
      setEntries((current) => {
        const withoutOld = current.filter(
          (entry) => entry.id !== saved.id && `${entry.plan_date}:${entry.meal_slot}` !== key
        );
        return [...withoutOld, saved];
      });
      closePlanner();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey('');
    }
  };

  const removeEntry = async (entry) => {
    setError('');
    setNotice('');
    try {
      await api.deleteMealPlanEntry(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (activeSlot?.entry?.id === entry.id) closePlanner();
    } catch (err) {
      setError(err.message);
    }
  };

  const addEntryToShoppingList = async (entry) => {
    setError('');
    setNotice('');
    try {
      const result = await api.addMealPlanToShoppingList(entry.id);
      setNotice(`${result.recipe}: ${result.count} Zutaten zur Einkaufsliste hinzugefügt.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const addWeekToShoppingList = async () => {
    setError('');
    setNotice('');
    try {
      const results = await Promise.all(plannedEntries.map((entry) => api.addMealPlanToShoppingList(entry.id)));
      const count = results.reduce((sum, item) => sum + item.count, 0);
      setNotice(`${count} Zutaten aus dem Wochenplan zur Einkaufsliste hinzugefügt.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const activeRecipe = recipes.find((recipe) => String(recipe.id) === String(mealRecipe));

  return (
    <div className="stack-lg">
      <section className="page-header">
        <div>
          <p className="eyebrow">Woche planen</p>
          <h1 className="page-title">Essensplan</h1>
        </div>
        <div className="planner-actions">
          <button className="btn btn-secondary" onClick={() => setWeekStart((date) => addDays(date, -7))}>
            <ChevronLeft size={18} />
            Vorwoche
          </button>
          <button className="btn btn-secondary" onClick={() => setWeekStart(startOfWeek())}>
            Heute
          </button>
          <button className="btn btn-secondary" onClick={() => setWeekStart((date) => addDays(date, 7))}>
            Nächste
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {notice && <div className="notice notice-success">{notice}</div>}

      <section className="planner-summary planner-summary-rich">
        <div>
          <CalendarDays size={20} />
          <strong>
            {dayFormatter.format(days[0])} bis {dayFormatter.format(days[6])}
          </strong>
        </div>
        <div className="planner-metrics">
          <span>{plannedEntries.length} Mahlzeiten</span>
          <span>{plannedPortions || 0} Portionen</span>
        </div>
        <button className="btn btn-primary" onClick={addWeekToShoppingList} disabled={!plannedEntries.length}>
          <ShoppingCart size={18} />
          Woche einkaufen
        </button>
      </section>

      {loading ? (
        <div className="empty-state">Essensplan wird geladen.</div>
      ) : recipes.length === 0 ? (
        <div className="empty-state">Lege zuerst Rezepte an, um die Woche zu planen.</div>
      ) : (
        <section className="planner-board" aria-label="Wochenplan">
          <div className="planner-board-header">
            <span>Tag</span>
            {slots.map((slot) => (
              <span key={slot.id}>{slot.label}</span>
            ))}
          </div>

          {days.map((day) => {
            const planDate = toIsoDate(day);
            return (
              <div className="planner-row" key={planDate}>
                <div className="planner-day-label">
                  <strong>{dayFormatter.format(day)}</strong>
                  <span>{toIsoDate(day) === toIsoDate(new Date()) ? 'Heute' : longDayFormatter.format(day).split(',')[0]}</span>
                </div>

                {slots.map((slot) => {
                  const key = `${planDate}:${slot.id}`;
                  const entry = entriesByKey.get(key);
                  return (
                    <div className={`plan-card ${entry ? 'filled' : 'empty'}`} key={slot.id}>
                      {entry ? (
                        <>
                          <button className="plan-card-main" onClick={() => openPlanner(day, slot, entry)}>
                            {entry.image && <img src={entry.image} alt="" />}
                            <span>
                              <strong>{entry.title}</strong>
                              <small>
                                {entry.portions || 2} Portionen
                                {entry.total_time ? ` · ${entry.total_time} Min` : ''}
                              </small>
                            </span>
                          </button>
                          {entry.notes && <p>{entry.notes}</p>}
                          <div className="plan-card-actions">
                            <button className="icon-button" onClick={() => openPlanner(day, slot, entry)} title="Bearbeiten">
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => addEntryToShoppingList(entry)}
                              title="Zutaten übernehmen"
                            >
                              <ShoppingCart size={16} />
                            </button>
                            <button className="icon-button danger" onClick={() => removeEntry(entry)} title="Entfernen">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <button className="plan-empty-button" onClick={() => openPlanner(day, slot, null)}>
                          <Plus size={18} />
                          Planen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      <Modal
        isOpen={Boolean(activeSlot)}
        onClose={closePlanner}
        title={activeSlot ? `${activeSlot.slot.label} · ${longDayFormatter.format(activeSlot.day)}` : ''}
        actions={
          <>
            {activeSlot?.entry && (
              <button className="btn btn-secondary" onClick={() => removeEntry(activeSlot.entry)}>
                <Trash2 size={18} />
                Entfernen
              </button>
            )}
            <button className="btn btn-primary" onClick={saveActiveEntry} disabled={!mealRecipe || savingKey}>
              <CalendarDays size={18} />
              Speichern
            </button>
          </>
        }
      >
        <div className="meal-modal">
          <div className="search-control">
            <Search size={18} />
            <input
              type="search"
              value={recipeSearch}
              onChange={(event) => setRecipeSearch(event.target.value)}
              placeholder="Rezept suchen"
            />
          </div>

          <div className="recipe-picker">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                className={`recipe-picker-item ${String(mealRecipe) === String(recipe.id) ? 'active' : ''}`}
                onClick={() => {
                  setMealRecipe(recipe.id);
                  setMealPortions((current) => current || recipe.portions || 2);
                }}
              >
                {recipe.image && <img src={recipe.image} alt="" />}
                <span>
                  <strong>{recipe.title}</strong>
                  <small>
                    {recipe.favorite ? <Heart size={13} fill="currentColor" /> : null}
                    <Clock size={13} />
                    {recipe.total_time ?? (recipe.prep_time || 0) + (recipe.cook_time || 0)} Min
                    <Users size={13} />
                    {recipe.portions || 1}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="meal-modal-grid">
            <label className="input-group">
              <span className="input-label">Portionen</span>
              <input
                className="input-field"
                type="number"
                min="1"
                value={mealPortions}
                onChange={(event) => setMealPortions(event.target.value)}
              />
            </label>
            <label className="input-group">
              <span className="input-label">Notiz</span>
              <input
                className="input-field"
                value={mealNotes}
                onChange={(event) => setMealNotes(event.target.value)}
                placeholder="z.B. Reste einplanen"
              />
            </label>
          </div>

          {activeRecipe && (
            <div className="selected-meal-preview">
              <strong>{activeRecipe.title}</strong>
              <span>{mealPortions || activeRecipe.portions || 2} Portionen geplant</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
