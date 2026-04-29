import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', amount: '', unit: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchItems = async () => {
    setError('');
    try {
      setItems(await api.getShoppingList());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitialItems() {
      try {
        const data = await api.getShoppingList();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialItems();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddItem = async (event) => {
    event.preventDefault();
    if (!newItem.name.trim()) return;

    try {
      await api.addShoppingItem(newItem);
      setNewItem({ name: '', amount: '', unit: '' });
      await fetchItems();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCheck = async (id, currentStatus) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, checked: currentStatus ? 0 : 1 } : item)));
    try {
      await api.toggleShoppingItem(id, !currentStatus);
    } catch (err) {
      setError(err.message);
      fetchItems();
    }
  };

  const deleteItem = async (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await api.deleteShoppingItem(id);
    } catch (err) {
      setError(err.message);
      fetchItems();
    }
  };

  const clearChecked = async () => {
    try {
      await api.clearCheckedShoppingItems();
      await fetchItems();
    } catch (err) {
      setError(err.message);
    }
  };

  const progress = useMemo(() => {
    if (!items.length) return 0;
    return Math.round((items.filter((item) => item.checked).length / items.length) * 100);
  }, [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
    [items]
  );

  return (
    <div className="shopping-page stack-lg">
      <section className="page-header">
        <div>
          <p className="eyebrow">Planen und abhaken</p>
          <h1 className="page-title">Einkaufsliste</h1>
        </div>
        {items.some((item) => item.checked) && (
          <button className="btn btn-secondary" onClick={clearChecked}>
            <Trash2 size={18} />
            Erledigte löschen
          </button>
        )}
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="shopping-summary">
        <div>
          <strong>{items.filter((item) => !item.checked).length}</strong>
          <span>offen</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div>
          <strong>{progress}%</strong>
          <span>erledigt</span>
        </div>
      </section>

      <form onSubmit={handleAddItem} className="shopping-form panel">
        <div className="input-group">
          <label className="input-label">Artikel</label>
          <input
            type="text"
            className="input-field"
            placeholder="Milch"
            value={newItem.name}
            onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
            required
          />
        </div>
        <div className="input-group">
          <label className="input-label">Menge</label>
          <input
            type="number"
            step="0.1"
            className="input-field"
            placeholder="2"
            value={newItem.amount}
            onChange={(event) => setNewItem({ ...newItem, amount: event.target.value })}
          />
        </div>
        <div className="input-group">
          <label className="input-label">Einheit</label>
          <input
            type="text"
            className="input-field"
            placeholder="Liter"
            value={newItem.unit}
            onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary icon-submit" title="Hinzufügen">
          <Plus size={22} />
        </button>
      </form>

      <section className="panel shopping-list-panel">
        {loading ? (
          <div className="empty-state">Einkaufsliste wird geladen.</div>
        ) : sortedItems.length === 0 ? (
          <div className="empty-state">Die Einkaufsliste ist leer.</div>
        ) : (
          sortedItems.map((item) => (
            <div key={item.id} className={`shopping-list-item ${item.checked ? 'checked' : ''}`}>
              <button
                type="button"
                className={`checkbox-custom ${item.checked ? 'checked' : ''}`}
                onClick={() => toggleCheck(item.id, item.checked)}
                title={item.checked ? 'Als offen markieren' : 'Als erledigt markieren'}
              >
                {item.checked && <Check size={16} />}
              </button>
              <span className="item-name">{item.name}</span>
              <span className="item-amount">
                {item.amount || ''}
                {item.unit ? ` ${item.unit}` : ''}
              </span>
              <button className="icon-button" onClick={() => deleteItem(item.id)} title="Löschen">
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
