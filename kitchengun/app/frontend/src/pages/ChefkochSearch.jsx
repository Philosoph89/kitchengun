import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Clock, Star } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

export default function ChefkochSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '' });

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    
    setLoading(true);
    try {
      setResults(await api.searchChefkoch(query));
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
                
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                  onClick={() => handleImport(recipe.id)}
                  disabled={importingId === recipe.id}
                >
                  <Download size={18} /> {importingId === recipe.id ? 'Importiert...' : 'Importieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
