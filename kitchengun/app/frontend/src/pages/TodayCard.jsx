import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChefHat, Clock, Users } from 'lucide-react';
import { api } from '../lib/api';

const slotLabels = {
  breakfast: 'Frühstück',
  lunch: 'Mittag',
  dinner: 'Abend',
  snack: 'Snack'
};

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: 'long'
});

function toIsoDate(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

export default function TodayCard() {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadToday() {
      setLoading(true);
      setError('');
      try {
        const data = await api.getTodayMealPlan(todayIso);
        if (!cancelled) setMeals(data.meals || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadToday();
    return () => {
      cancelled = true;
    };
  }, [todayIso]);

  const plannedMeals = meals.filter((meal) => meal.recipe_id);
  const heroMeal = plannedMeals.find((meal) => meal.meal_slot === 'dinner') || plannedMeals[0];

  return (
    <section className="ha-today-card" aria-label="Heutiger Essensplan">
      <div className="ha-today-card-header">
        <div>
          <span>Heute</span>
          <strong>{dateFormatter.format(new Date(todayIso))}</strong>
        </div>
        <CalendarDays size={22} />
      </div>

      {loading && <div className="ha-today-empty">Essensplan wird geladen.</div>}
      {error && !loading && <div className="ha-today-empty error">{error}</div>}

      {!loading && !error && plannedMeals.length === 0 && (
        <div className="ha-today-empty">
          <ChefHat size={28} />
          <strong>Noch nichts geplant</strong>
          <span>Der heutige Essensplan ist leer.</span>
        </div>
      )}

      {!loading && !error && plannedMeals.length > 0 && (
        <>
          <div className="ha-today-hero">
            <div className="ha-today-hero-visual">
              {heroMeal?.image ? <img src={heroMeal.image} alt="" /> : <ChefHat size={30} />}
            </div>
            <div>
              <small>{slotLabels[heroMeal.meal_slot] || heroMeal.meal_slot}</small>
              <strong>{heroMeal.title}</strong>
              <span>
                {heroMeal.total_time ? (
                  <>
                    <Clock size={15} />
                    {heroMeal.total_time} Min
                  </>
                ) : (
                  <>
                    <Users size={15} />
                    {heroMeal.portions || 2} Portionen
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="ha-today-meals">
            {plannedMeals.map((meal) => (
              <div className="ha-today-meal" key={meal.id}>
                <span>{slotLabels[meal.meal_slot] || meal.meal_slot}</span>
                <strong>{meal.title}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
