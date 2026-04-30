import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

const slots = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittag' },
  { id: 'dinner', label: 'Abend' },
  { id: 'snack', label: 'Snack' }
];

const dayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

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
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const start = toIsoDate(weekStart);

  const entriesByKey = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => map.set(`${entry.plan_date}:${entry.meal_slot}`, entry));
    return map;
  }, [entries]);

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

  const updateDraft = (key, value) => {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  };

  const saveEntry = async (planDate, slotId) => {
    const key = `${planDate}:${slotId}`;
    const draft = drafts[key] || {};
    const recipeId = draft.recipe_id || entriesByKey.get(key)?.recipe_id || recipes[0]?.id;
    if (!recipeId) return;

    setSavingKey(key);
    setError('');
    setNotice('');
    try {
      const recipe = recipes.find((item) => String(item.id) === String(recipeId));
      const saved = await api.saveMealPlanEntry({
        plan_date: planDate,
        meal_slot: slotId,
        recipe_id: Number(recipeId),
        portions: draft.portions || entriesByKey.get(key)?.portions || recipe?.portions || 2,
        notes: draft.notes ?? entriesByKey.get(key)?.notes ?? ''
      });
      setEntries((current) => {
        const withoutOld = current.filter((entry) => entry.id !== saved.id && `${entry.plan_date}:${entry.meal_slot}` !== key);
        return [...withoutOld, saved];
      });
      setDrafts((current) => ({ ...current, [key]: {} }));
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
    const planned = entries.filter((entry) => entry.recipe_id);
    setError('');
    setNotice('');
    try {
      const results = await Promise.all(planned.map((entry) => api.addMealPlanToShoppingList(entry.id)));
      const count = results.reduce((sum, item) => sum + item.count, 0);
      setNotice(`${count} Zutaten aus dem Wochenplan zur Einkaufsliste hinzugefügt.`);
    } catch (err) {
      setError(err.message);
    }
  };

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

      <section className="planner-summary">
        <div>
          <CalendarDays size={20} />
          <strong>{dayFormatter.format(days[0])} bis {dayFormatter.format(days[6])}</strong>
        </div>
        <button className="btn btn-primary" onClick={addWeekToShoppingList} disabled={!entries.length}>
          <ShoppingCart size={18} />
          Woche einkaufen
        </button>
      </section>

      {loading ? (
        <div className="empty-state">Essensplan wird geladen.</div>
      ) : (
        <div className="meal-grid">
          {days.map((day) => {
            const planDate = toIsoDate(day);
            return (
              <section className="meal-day" key={planDate}>
                <h2>{dayFormatter.format(day)}</h2>
                {slots.map((slot) => {
                  const key = `${planDate}:${slot.id}`;
                  const entry = entriesByKey.get(key);
                  const draft = drafts[key] || {};
                  const selectedRecipe = draft.recipe_id || entry?.recipe_id || '';
                  return (
                    <div className="meal-slot" key={slot.id}>
                      <div className="meal-slot-header">
                        <strong>{slot.label}</strong>
                        {entry && (
                          <button className="icon-button" onClick={() => removeEntry(entry)} title="Planung entfernen">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      {entry?.title && (
                        <div className="planned-recipe">
                          {entry.image && <img src={entry.image} alt="" />}
                          <div>
                            <strong>{entry.title}</strong>
                            <span>{entry.portions || 2} Portionen</span>
                          </div>
                        </div>
                      )}

                      <select
                        className="input-field"
                        value={selectedRecipe}
                        onChange={(event) => updateDraft(key, { recipe_id: event.target.value })}
                      >
                        <option value="">Rezept auswählen</option>
                        {recipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.title}
                          </option>
                        ))}
                      </select>
                      <div className="meal-slot-controls">
                        <input
                          className="input-field"
                          type="number"
                          min="1"
                          value={draft.portions ?? entry?.portions ?? 2}
                          onChange={(event) => updateDraft(key, { portions: event.target.value })}
                          aria-label="Portionen"
                        />
                        <button
                          className="btn btn-secondary compact"
                          onClick={() => saveEntry(planDate, slot.id)}
                          disabled={savingKey === key || !selectedRecipe}
                        >
                          <Plus size={16} />
                          Planen
                        </button>
                      </div>
                      <input
                        className="input-field"
                        value={draft.notes ?? entry?.notes ?? ''}
                        onChange={(event) => updateDraft(key, { notes: event.target.value })}
                        placeholder="Notiz"
                      />
                      {entry && (
                        <button className="btn btn-secondary compact full-width" onClick={() => addEntryToShoppingList(entry)}>
                          <ShoppingCart size={16} />
                          Zutaten übernehmen
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
