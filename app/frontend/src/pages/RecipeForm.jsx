import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

export default function RecipeForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '' });
  const [formData, setFormData] = useState({
    title: '',
    image: '',
    prep_time: 15,
    cook_time: 30,
    portions: 2,
    category: 'Hauptgericht',
    instructions: ''
  });
  
  const [ingredients, setIngredients] = useState([
    { id: 1, name: '', amount: '', unit: '' }
  ]);

  useEffect(() => {
    if (isEditMode) {
      api.getRecipe(id)
        .then(data => {
          setFormData({
            title: data.title || '',
            image: data.image || '',
            prep_time: data.prep_time || 0,
            cook_time: data.cook_time || 0,
            portions: data.portions || 2,
            category: data.category || 'Hauptgericht',
            instructions: data.instructions || ''
          });
          if (data.ingredients && data.ingredients.length > 0) {
            setIngredients(data.ingredients.map(ing => ({
              id: ing.id,
              name: ing.name,
              amount: ing.amount || '',
              unit: ing.unit || ''
            })));
          }
        })
        .catch(err => setModalState({ isOpen: true, title: 'Fehler', message: err.message }));
    }
  }, [id, isEditMode]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleIngredientChange = (id, field, value) => {
    setIngredients(ingredients.map(ing => 
      ing.id === id ? { ...ing, [field]: value } : ing
    ));
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { id: Date.now(), name: '', amount: '', unit: '' }]);
  };

  const removeIngredient = (id) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter(ing => ing.id !== id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Filter out empty ingredients
    const validIngredients = ingredients.filter(ing => ing.name.trim() !== '');

    const payload = {
      ...formData,
      ingredients: validIngredients
    };

    try {
      const result = isEditMode ? await api.updateRecipe(id, payload) : await api.createRecipe(payload);
      navigate(isEditMode ? `/recipe/${id}` : `/recipe/${result.id}`);
    } catch (err) {
      console.error(err);
      setModalState({ isOpen: true, title: 'Fehler', message: err.message });
      setLoading(false);
    }
  };

  return (
    <div className="form-page animate-fade-in">
      <button className="btn btn-secondary compact" onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem' }}>
        <ArrowLeft size={16} /> Zurück
      </button>

      <div className="form-surface">
        <h1 className="page-title" style={{ marginBottom: '2rem' }}>
          {isEditMode ? 'Rezept bearbeiten' : 'Neues Rezept erstellen'}
        </h1>
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Rezept Name</label>
            <input 
              type="text" 
              name="title" 
              className="input-field" 
              required 
              value={formData.title} 
              onChange={handleChange} 
              placeholder="z.B. Spaghetti Carbonara"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Bild URL (optional)</label>
            <input 
              type="url" 
              name="image" 
              className="input-field" 
              value={formData.image} 
              onChange={handleChange} 
              placeholder="https://..."
            />
          </div>

          <div className="form-grid-4">
            <div className="input-group">
              <label className="input-label">Kategorie</label>
              <select name="category" className="input-field" value={formData.category} onChange={handleChange}>
                <option>Frühstück</option>
                <option>Hauptgericht</option>
                <option>Dessert</option>
                <option>Snack</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Vorbereitung (Min)</label>
              <input type="number" name="prep_time" className="input-field" value={formData.prep_time} onChange={handleChange} required />
            </div>
            <div className="input-group">
              <label className="input-label">Kochen (Min)</label>
              <input type="number" name="cook_time" className="input-field" value={formData.cook_time} onChange={handleChange} required />
            </div>
            <div className="input-group">
              <label className="input-label">Portionen</label>
              <input type="number" name="portions" className="input-field" value={formData.portions} onChange={handleChange} required />
            </div>
          </div>

          <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h3>Zutaten</h3>
              <button type="button" className="btn btn-secondary" onClick={addIngredient} style={{ padding: '0.5rem 1rem' }}>
                <Plus size={16} /> Zutat hinzufügen
              </button>
            </div>
            
            {ingredients.map((ing, index) => (
              <div key={ing.id} className="ingredient-row">
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ flex: 2 }} 
                  placeholder="Zutat (z.B. Spaghetti)" 
                  value={ing.name} 
                  onChange={(e) => handleIngredientChange(ing.id, 'name', e.target.value)} 
                  required={index === 0}
                />
                <input 
                  type="number" 
                  step="0.1"
                  className="input-field" 
                  style={{ flex: 1 }} 
                  placeholder="Menge (z.B. 500)" 
                  value={ing.amount} 
                  onChange={(e) => handleIngredientChange(ing.id, 'amount', e.target.value)} 
                />
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ flex: 1 }} 
                  placeholder="Einheit (z.B. g)" 
                  value={ing.unit} 
                  onChange={(e) => handleIngredientChange(ing.id, 'unit', e.target.value)} 
                />
                <button type="button" className="btn" style={{ color: 'var(--accent-danger)' }} onClick={() => removeIngredient(ing.id)}>
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>

          <div className="input-group">
            <label className="input-label">Zubereitungsschritte</label>
            <textarea 
              name="instructions" 
              className="input-field" 
              style={{ minHeight: '200px', resize: 'vertical' }} 
              value={formData.instructions} 
              onChange={handleChange}
              placeholder="Schritt 1: ..."
              required
            ></textarea>
          </div>

          <button type="submit" className="btn btn-primary full-width" style={{ marginTop: '2rem' }} disabled={loading}>
            <Save size={20} /> {loading ? 'Speichert...' : 'Rezept speichern'}
          </button>
        </form>
      </div>

      <Modal 
        isOpen={modalState.isOpen} 
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        actions={
          <button className="btn btn-primary" onClick={() => setModalState({ ...modalState, isOpen: false })}>Okay</button>
        }
      >
        <p>{modalState.message}</p>
      </Modal>
    </div>
  );
}
