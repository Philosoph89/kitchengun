import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Edit3, Minus, Plus, ShoppingCart, Trash2, Users } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [portions, setPortions] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingToList, setAddingToList] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

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

  if (loading) return <div className="empty-state">Rezept wird geladen.</div>;
  if (error && !recipe) return <div className="notice notice-error">{error}</div>;

  return (
    <div className="stack-lg">
      <button className="btn btn-secondary compact" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} />
        Zurück
      </button>

      {error && <div className="notice notice-error">{error}</div>}

      <article className="recipe-detail">
        {recipe.image && <img src={recipe.image} alt={recipe.title} className="recipe-hero-image" />}

        <div className="recipe-detail-body">
          <div className="detail-title-row">
            <div>
              <div className="tag">{recipe.category || 'Allgemein'}</div>
              <h1>{recipe.title}</h1>
            </div>
            <div className="icon-actions">
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
            </aside>

            <section className="instructions-panel">
              <h2>Zubereitung</h2>
              <div>{recipe.instructions}</div>
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
    </div>
  );
}
