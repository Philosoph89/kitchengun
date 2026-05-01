import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Clock, Star, Eye, Users } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

const SEARCH_CACHE_KEY = 'kitchengun:chefkoch-search';

function readCachedSearch() {
  if (typeof window === 'undefined') return { query: '', results: [] };

  try {
    const cached = window.sessionStorage.getItem(SEARCH_CACHE_KEY);
    if (!cached) return { query: '', results: [] };

    const parsed = JSON.parse(cached);
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      results: Array.isArray(parsed.results) ? parsed.results : []
    };
  } catch {
    return { query: '', results: [] };
  }
}

export default function ChefkochSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => readCachedSearch().query);
  const [results, setResults] = useState(() => readCachedSearch().results);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [previewRecipe, setPreviewRecipe] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify({ query, results }));
    } catch {
      // Session persistence is a comfort feature; searching must still work without it.
    }
  }, [query, results]);

  const handleSearch = async (e) => {
    e.preventDefault();
    const searchQuery = query.trim();
    if (!searchQuery) return;
    
    setLoading(true);
    try {
      setResults(await api.searchChefkoch(searchQuery));
    } catch (err) {
      console.error(err);
      setModalState({ isOpen: true, title: 'Fehler', message: err.message });
    }
    setLoading(false);
  };

  const handleImport = async (id) => {
    setImportingId(id);
    try {
      const data = await api.importChefkochRecipe(id);
      navigate(`/recipe/${data.id}`);
    } catch (err) {
      console.error(err);
      if (err.status === 409 && err.payload?.id) {
        navigate(`/recipe/${err.payload.id}`);
      } else {
        setModalState({ isOpen: true, title: 'Import fehlgeschlagen', message: err.message });
      }
    }
    setImportingId(null);
  };

  const handlePreview = async (id) => {
    setPreviewLoadingId(id);
    try {
      setPreviewRecipe(await api.getChefkochRecipe(id));
    } catch (err) {
      console.error(err);
      setModalState({ isOpen: true, title: 'Vorschau fehlgeschlagen', message: err.message });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  return (
    <div className="stack-lg animate-fade-in">
      <div className="page-header">
        <div>
          <p className="eyebrow">Import</p>
          <h1 className="page-title">Chefkoch entdecken</h1>
        </div>
      </div>

      <div className="panel">
        <form onSubmit={handleSearch} className="search-form">
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Wonach suchst du?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              required
              style={{ padding: '1rem', fontSize: '1.1rem' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0 2rem' }} disabled={loading}>
            <Search size={20} /> {loading ? 'Sucht...' : 'Suchen'}
          </button>
        </form>
      </div>

      {results.length > 0 && (
        <div className="grid-3">
          {results.map(recipe => (
            <div className="card" key={recipe.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <img 
                src={recipe.image || 'https://images.unsplash.com/photo-1495195134817-a1a2807b9361?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'}
                alt={recipe.title} 
                className="recipe-image"
              />
              <div className="recipe-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ marginBottom: '0.5rem', flex: 1 }}>{recipe.title}</h3>
                
                <div className="recipe-meta" style={{ marginBottom: '1.5rem' }}>
                  <div className="recipe-meta-item">
                    <Clock size={16} /> {recipe.prepTime} Min
                  </div>
                  {recipe.rating && (
                    <div className="recipe-meta-item" style={{ color: '#f59e0b' }}>
                      <Star size={16} fill="currentColor" /> {recipe.rating.toFixed(1)}
                    </div>
                  )}
                </div>
                
                <div className="discover-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => handlePreview(recipe.id)}
                    disabled={previewLoadingId === recipe.id}
                  >
                    <Eye size={18} /> {previewLoadingId === recipe.id ? 'Lädt...' : 'Ansehen'}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleImport(recipe.id)}
                    disabled={importingId === recipe.id}
                    title="Importieren"
                  >
                    <Download size={18} /> {importingId === recipe.id ? 'Importiert...' : 'Importieren'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(previewRecipe)}
        onClose={() => setPreviewRecipe(null)}
        title={previewRecipe?.title}
        actions={
          <>
            {previewRecipe?.alreadyImportedId && (
              <button className="btn btn-secondary" onClick={() => navigate(`/recipe/${previewRecipe.alreadyImportedId}`)}>
                Öffnen
              </button>
            )}
            {!previewRecipe?.alreadyImportedId && (
              <button className="btn btn-primary" onClick={() => handleImport(previewRecipe.id)} disabled={importingId === previewRecipe?.id}>
                <Download size={18} />
                Importieren
              </button>
            )}
          </>
        }
      >
        {previewRecipe && (
          <div className="chefkoch-preview">
            {previewRecipe.image && <img src={previewRecipe.image} alt={previewRecipe.title} />}
            <div className="preview-meta">
              <span>
                <Clock size={16} />
                {(previewRecipe.prep_time || 0) + (previewRecipe.cook_time || 0)} Min
              </span>
              <span>
                <Users size={16} />
                {previewRecipe.portions || 2} Portionen
              </span>
              {previewRecipe.rating && (
                <span>
                  <Star size={16} fill="currentColor" />
                  {previewRecipe.rating.toFixed(1)}
                </span>
              )}
            </div>

            <section>
              <h3>Zutaten</h3>
              <ul className="preview-ingredients">
                {previewRecipe.ingredients.map((ingredient, index) => (
                  <li key={`${ingredient.name}-${index}`}>
                    <span>{ingredient.name}</span>
                    <strong>
                      {ingredient.amount || ''}
                      {ingredient.unit ? ` ${ingredient.unit}` : ''}
                    </strong>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Zubereitung</h3>
              <p>{previewRecipe.instructions}</p>
            </section>
          </div>
        )}
      </Modal>

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
