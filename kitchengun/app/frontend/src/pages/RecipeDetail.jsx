import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChefHat, Clock, Edit3, Heart, Minus, PackageCheck, Plus, RotateCcw, ShoppingCart, Trash2, Users } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

function splitInstructions(text = '') {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return [];

  const numbered = normalized
    .split(/\n?\s*(?:\d+[).]\s+)/)
    .map((step) => step.trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered;

  const lines = normalized.split(/\n+/).map((step) => step.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  return normalized
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)
    .map((step) => step.trim())
    .filter(Boolean);
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [portions, setPortions] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingToList, setAddingToList] = useState(false);
  const [isCookMode, setIsCookMode] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [inventoryUsage, setInventoryUsage] = useState(null);
  const [deductInventory, setDeductInventory] = useState(true);
  const [consuming, setConsuming] = useState(false);
  const [consumptionNotice, setConsumptionNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRecipe() {
      setLoading(true);
      setError('');
      try {
        const data = await api.getRecipe(id);
        if (!cancelled) {
          setRecipe(data);
          setPortions(data.portions || 1);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecipe();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const multiplier = useMemo(() => portions / (recipe?.portions || 1), [portions, recipe]);
  const steps = useMemo(() => splitInstructions(recipe?.instructions), [recipe]);
  const completedSteps = checkedSteps.filter(Boolean).length;
  const stepProgress = steps.length ? Math.round((completedSteps / steps.length) * 100) : 0;

  useEffect(() => {
    if (!recipe?.id || !steps.length) return;
    const timeout = window.setTimeout(() => {
      const saved = window.localStorage.getItem(`kitchengun:cook:${recipe.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCheckedSteps(Array.from({ length: steps.length }, (_, index) => Boolean(parsed[index])));
          return;
        } catch {
          setCheckedSteps(Array.from({ length: steps.length }, () => false));
        }
      } else {
        setCheckedSteps(Array.from({ length: steps.length }, () => false));
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [recipe?.id, steps.length]);

  useEffect(() => {
    if (!recipe?.id || !steps.length) return;
    window.localStorage.setItem(`kitchengun:cook:${recipe.id}`, JSON.stringify(checkedSteps));
  }, [checkedSteps, recipe?.id, steps.length]);

  const confirmDelete = async () => {
    await api.deleteRecipe(id);
    setIsDeleteModalOpen(false);
    navigate('/');
  };

  const addIngredientsToList = async () => {
    setAddingToList(true);
    try {
      await api.addShoppingItems(
        recipe.ingredients.map((ingredient) => ({
          name: ingredient.name,
          amount: ingredient.amount ? ingredient.amount * multiplier : null,
          unit: ingredient.unit
        }))
      );
      setIsSuccessModalOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingToList(false);
    }
  };

  const toggleFavorite = async () => {
    const nextFavorite = recipe.favorite ? 0 : 1;
    setRecipe((current) => ({ ...current, favorite: nextFavorite }));
    try {
      await api.toggleFavorite(id, nextFavorite);
    } catch (err) {
      setError(err.message);
      setRecipe((current) => ({ ...current, favorite: recipe.favorite }));
    }
  };

  const toggleStep = (index) => {
    setCheckedSteps((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)));
  };

  const resetCookMode = () => {
    setCheckedSteps(Array.from({ length: steps.length }, () => false));
  };

  const openConsumeDialog = async () => {
    setConsuming(true);
    setError('');
    try {
      setInventoryUsage(await api.getRecipeInventoryUsage(id, portions));
      setDeductInventory(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setConsuming(false);
    }
  };

  const confirmConsumption = async () => {
    setConsuming(true);
    setError('');
    try {
      const result = await api.consumeRecipeInventory(id, portions, deductInventory);
      setInventoryUsage(null);
      setConsumptionNotice(result.message);
      setCheckedSteps(Array.from({ length: steps.length }, () => false));
    } catch (err) {
      setError(err.message);
    } finally {
      setConsuming(false);
    }
  };

  if (loading) return <div className="empty-state">Rezept wird geladen.</div>;
  if (error && !recipe) return <div className="notice notice-error">{error}</div>;

  return (
    <div className="stack-lg">
      <button className="btn btn-secondary compact" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} />
        Zurück
      </button>

      {error && <div className="notice notice-error">{error}</div>}
      {consumptionNotice && <div className="notice notice-success"><Check size={18} /> {consumptionNotice}</div>}

      <article className="recipe-detail">
        {recipe.image && <img src={recipe.image} alt={recipe.title} className="recipe-hero-image" />}

        <div className="recipe-detail-body">
          <div className="detail-title-row">
            <div>
              <div className="tag">{recipe.category || 'Allgemein'}</div>
              <h1>{recipe.title}</h1>
            </div>
            <div className="icon-actions">
              <button
                className={`icon-button favorite-inline ${recipe.favorite ? 'active' : ''}`}
                onClick={toggleFavorite}
                title={recipe.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
              >
                <Heart size={20} fill={recipe.favorite ? 'currentColor' : 'none'} />
              </button>
              <button className={`icon-button ${isCookMode ? 'active' : ''}`} onClick={() => setIsCookMode((value) => !value)} title="Kochmodus">
                <ChefHat size={20} />
              </button>
              <button className="icon-button" onClick={() => navigate(`/recipe/edit/${id}`)} title="Bearbeiten">
                <Edit3 size={20} />
              </button>
              <button className="icon-button danger" onClick={() => setIsDeleteModalOpen(true)} title="Löschen">
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="detail-meta">
            <span>
              <Clock size={18} />
              {recipe.prep_time || 0} Min Vorbereitung
            </span>
            <span>
              <Clock size={18} />
              {recipe.cook_time || 0} Min Kochen
            </span>
            <span>
              <Users size={18} />
              Basis: {recipe.portions || 1} Portionen
            </span>
          </div>

          <div className="recipe-detail-grid">
            <aside className="ingredients-panel">
              <div className="panel-title-row">
                <h2>Zutaten</h2>
                <div className="stepper" aria-label="Portionen">
                  <button type="button" onClick={() => setPortions((value) => Math.max(1, value - 1))}>
                    <Minus size={16} />
                  </button>
                  <span>{portions}</span>
                  <button type="button" onClick={() => setPortions((value) => value + 1)}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <ul className="ingredient-list">
                {recipe.ingredients?.map((ingredient) => (
                  <li key={ingredient.id}>
                    <span>{ingredient.name}</span>
                    <strong>
                      {ingredient.amount ? (ingredient.amount * multiplier).toFixed(1).replace('.0', '') : ''}
                      {ingredient.unit ? ` ${ingredient.unit}` : ''}
                    </strong>
                  </li>
                ))}
              </ul>

              <button className="btn btn-primary full-width" onClick={addIngredientsToList} disabled={addingToList}>
                <ShoppingCart size={18} />
                {addingToList ? 'Wird hinzugefügt' : 'Auf die Einkaufsliste'}
              </button>
              <button className="btn btn-secondary full-width consume-button" onClick={openConsumeDialog} disabled={consuming}>
                <PackageCheck size={18} />
                {consuming ? 'Vorrat wird geprüft…' : 'Als gekocht markieren'}
              </button>
            </aside>

            <section className="instructions-panel">
              <div className="instructions-title-row">
                <h2>{isCookMode ? 'Kochmodus' : 'Zubereitung'}</h2>
                {isCookMode && (
                  <button className="btn btn-secondary compact" onClick={resetCookMode}>
                    <RotateCcw size={16} />
                    Zurücksetzen
                  </button>
                )}
              </div>

              {isCookMode ? (
                <div className="cook-mode">
                  <div className="cook-progress">
                    <span>{completedSteps} von {steps.length} Schritten</span>
                    <strong>{stepProgress}%</strong>
                    <div className="progress-track">
                      <span style={{ width: `${stepProgress}%` }} />
                    </div>
                  </div>
                  <ol className="cook-steps">
                    {steps.map((step, index) => (
                      <li key={`${step}-${index}`} className={checkedSteps[index] ? 'done' : ''}>
                        <button className={`checkbox-custom ${checkedSteps[index] ? 'checked' : ''}`} onClick={() => toggleStep(index)}>
                          {checkedSteps[index] && <Check size={16} />}
                        </button>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div>{recipe.instructions}</div>
              )}
            </section>
          </div>
        </div>
      </article>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Rezept löschen"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Abbrechen
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              Löschen
            </button>
          </>
        }
      >
        <p>Dieses Rezept wird dauerhaft entfernt.</p>
      </Modal>

      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title="Einkaufsliste aktualisiert"
        actions={
          <button className="btn btn-primary" onClick={() => setIsSuccessModalOpen(false)}>
            <Check size={18} />
            Fertig
          </button>
        }
      >
        <p>Die Zutaten wurden hinzugefügt und gleiche Artikel automatisch zusammengeführt.</p>
      </Modal>

      <Modal
        isOpen={Boolean(inventoryUsage)}
        onClose={() => setInventoryUsage(null)}
        title="Kochen abschließen"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setInventoryUsage(null)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={confirmConsumption} disabled={consuming}>
              <Check size={18} /> {consuming ? 'Wird verbucht…' : 'Bestätigen'}
            </button>
          </>
        }
      >
        {inventoryUsage && (
          <div className="consume-dialog">
            <div className={`consume-summary ${inventoryUsage.can_cook ? 'complete' : 'warning'}`}>
              {inventoryUsage.can_cook ? <PackageCheck size={22} /> : <AlertTriangle size={22} />}
              <div>
                <strong>{inventoryUsage.available} von {inventoryUsage.total} Zutaten im Vorrat</strong>
                <span>Berechnet für {inventoryUsage.portions} Portionen</span>
              </div>
            </div>
            <div className="consume-list">
              {inventoryUsage.ingredients.map((ingredient) => (
                <div className={`consume-item ${ingredient.status}`} key={ingredient.ingredient_id}>
                  <span className="consume-status">{ingredient.status === 'available' ? <Check size={15} /> : <AlertTriangle size={15} />}</span>
                  <span>
                    <strong>{ingredient.name}</strong>
                    <small>
                      {ingredient.inventory_name
                        ? `Vorrat: ${ingredient.inventory_name} · ${ingredient.inventory_quantity} ${ingredient.inventory_unit}`
                        : 'Nicht eindeutig im Vorrat gefunden'}
                    </small>
                  </span>
                  <b>{ingredient.required_amount ? `${Number(ingredient.required_amount).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${ingredient.required_unit}` : 'nach Bedarf'}</b>
                </div>
              ))}
            </div>
            <label className="consume-toggle">
              <input type="checkbox" checked={deductInventory} onChange={(event) => setDeductInventory(event.target.checked)} />
              <span>
                <strong>Bestand automatisch reduzieren</strong>
                <small>Nur eindeutig zugeordnete und umrechenbare Mengen werden abgezogen.</small>
              </span>
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
