import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  CalendarClock,
  Camera,
  Check,
  Edit3,
  Image as ImageIcon,
  Minus,
  Package,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X
} from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';

const emptyForm = {
  name: '',
  quantity: 1,
  unit: 'Stück',
  barcode: '',
  image: '',
  brand: '',
  category: 'Sonstiges',
  minimum_quantity: 0,
  expires_at: '',
  notes: '',
  source: 'manual'
};

const units = ['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Dose', 'Bund', 'Becher', 'Glas'];
const dateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

function formatNumber(value) {
  return Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function parseLocalDate(value) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function quantityStep(unit) {
  if (unit === 'kg' || unit === 'l') return 0.1;
  if (unit === 'g' || unit === 'ml') return 50;
  return 1;
}

function getCameraErrorMessage(error) {
  const policy = document.permissionsPolicy || document.featurePolicy;
  const isEmbedded = window.self !== window.top;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'Die Live-Kamera ist über eine unverschlüsselte HTTP-Verbindung gesperrt. Nutze „Foto aufnehmen“ oder öffne KitchenGun über HTTPS.';
  }
  if (policy?.allowsFeature && !policy.allowsFeature('camera')) {
    return 'Home Assistant gibt die Live-Kamera in diesem Add-on-Fenster nicht frei. „Foto aufnehmen“ funktioniert trotzdem.';
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return isEmbedded
      ? 'Home Assistant oder der Browser blockiert die Live-Kamera in diesem Fenster. Nutze „Foto aufnehmen“ oder öffne den Scanner in einem neuen Fenster.'
      : 'Der Kamerazugriff wurde nicht erlaubt. Erlaube die Kamera in den Browser-Einstellungen oder nutze „Foto aufnehmen“.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'Es wurde keine Kamera gefunden. Du kannst stattdessen ein vorhandenes Foto auswählen.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'Die Kamera wird bereits von einer anderen App verwendet. Schließe diese App oder nutze „Foto aufnehmen“.';
  }
  return 'Die Live-Kamera konnte nicht gestartet werden. Nutze „Foto aufnehmen“ – der Barcode wird direkt auf dem Gerät erkannt.';
}

function BarcodeScanner({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const controlsRef = useRef(null);
  const handledRef = useRef(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    handledRef.current = false;
    let cancelled = false;

    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => {
        if (cancelled) return null;
        const policy = document.permissionsPolicy || document.featurePolicy;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          const error = new Error('Camera requires a secure context.');
          error.name = 'SecurityError';
          throw error;
        }
        if (policy?.allowsFeature && !policy.allowsFeature('camera')) {
          const error = new Error('Camera is blocked by Permissions Policy.');
          error.name = 'NotAllowedError';
          throw error;
        }
        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!cancelled && result && !handledRef.current) {
              handledRef.current = true;
              controlsRef.current?.stop();
              onDetected(result.getText());
            }
          }
        );
      })
      .then((controls) => {
        if (!controls) return;
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('KitchenGun camera unavailable:', error?.name, error?.message);
          setCameraError(getCameraErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onDetected]);

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoLoading(true);
    setPhotoError('');
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const result = await new BrowserMultiFormatReader().decodeFromImageElement(image);
      onDetected(result.getText());
    } catch {
      setPhotoError('Auf dem Foto wurde kein lesbarer Barcode gefunden. Fotografiere ihn gerade, scharf und mit etwas Abstand erneut.');
    } finally {
      URL.revokeObjectURL(imageUrl);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setPhotoLoading(false);
    }
  };

  const openStandaloneScanner = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal isOpen onClose={onClose} title="Barcode scannen">
      <div className="scanner-dialog">
        <div className="scanner-viewport">
          <video ref={videoRef} muted playsInline />
          <span className="scanner-frame" aria-hidden="true"><ScanLine size={30} /></span>
          <button type="button" className="scanner-close" onClick={onClose} aria-label="Scanner schließen">
            <X size={20} />
          </button>
        </div>
        <p>Kamera ruhig über den Strichcode halten – die Erkennung startet automatisch.</p>
        {cameraError && <div className="notice notice-error">{cameraError}</div>}
        <div className="scanner-fallback-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
          />
          <button className="btn btn-primary" type="button" onClick={() => fileInputRef.current?.click()} disabled={photoLoading}>
            <Camera size={18} />
            {photoLoading ? 'Barcode wird erkannt…' : 'Foto aufnehmen'}
          </button>
          {window.self !== window.top && window.isSecureContext && (
            <button className="btn btn-secondary" type="button" onClick={openStandaloneScanner}>
              <ScanLine size={18} />
              In neuem Fenster öffnen
            </button>
          )}
        </div>
        <p className="scanner-privacy-note">Das Foto bleibt auf deinem Gerät und wird nur lokal zur Barcode-Erkennung verarbeitet.</p>
        {photoError && <div className="notice notice-error">{photoError}</div>}
        <form
          className="barcode-manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (manualCode.trim()) onDetected(manualCode.trim());
          }}
        >
          <div className="input-group">
            <label className="input-label" htmlFor="manual-barcode">Barcode manuell eingeben</label>
            <input
              id="manual-barcode"
              className="input-field"
              inputMode="numeric"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.replace(/\D/g, ''))}
              placeholder="z. B. 3017620422003"
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={!manualCode.trim()}>
            <Search size={18} />
            Produkt abrufen
          </button>
        </form>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [itemData, summaryData] = await Promise.all([
        api.getInventory({ search, status }),
        api.getInventorySummary()
      ]);
      setItems(itemData);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timeout = window.setTimeout(loadInventory, 160);
    return () => window.clearTimeout(timeout);
  }, [loadInventory]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category || 'Sonstiges'))).sort((a, b) => a.localeCompare(b, 'de')),
    [items]
  );

  const groupedItems = useMemo(
    () => categories.map((category) => ({ category, items: items.filter((item) => (item.category || 'Sonstiges') === category) })),
    [categories, items]
  );

  const openNewItem = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError('');
    setIsFormOpen(true);
  };

  const openEditItem = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      quantity: item.quantity ?? 0,
      unit: item.unit || 'Stück',
      barcode: item.barcode || '',
      image: item.image || '',
      brand: item.brand || '',
      category: item.category || 'Sonstiges',
      minimum_quantity: item.minimum_quantity ?? 0,
      expires_at: item.expires_at || '',
      notes: item.notes || '',
      source: item.source || 'manual'
    });
    setError('');
    setIsFormOpen(true);
  };

  const handleDetected = useCallback(async (rawCode) => {
    const barcode = String(rawCode).replace(/\D/g, '');
    setIsScannerOpen(false);
    setLookupLoading(true);
    setError('');
    try {
      const product = await api.lookupProduct(barcode);
      setEditingId(null);
      setForm({ ...emptyForm, ...product, minimum_quantity: 0, expires_at: '', notes: '' });
      setIsFormOpen(true);
    } catch (err) {
      setEditingId(null);
      setForm({ ...emptyForm, barcode });
      setIsFormOpen(true);
      setError(err.message);
    } finally {
      setLookupLoading(false);
    }
  }, []);

  const saveItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        minimum_quantity: Number(form.minimum_quantity)
      };
      const saved = editingId
        ? await api.updateInventoryItem(editingId, payload)
        : await api.addInventoryItem(payload);
      setIsFormOpen(false);
      setNotice(saved.merged ? 'Vorhandenes Produkt erkannt und Menge addiert.' : editingId ? 'Vorrat aktualisiert.' : 'Lebensmittel eingelagert.');
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeQuantity = async (item, delta) => {
    const previous = items;
    setItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, quantity: Math.max(0, Number(entry.quantity) + delta) }
      : entry));
    try {
      const updated = await api.changeInventoryQuantity(item.id, { delta, reason: 'Schnellanpassung' });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
      setSummary(await api.getInventorySummary());
    } catch (err) {
      setItems(previous);
      setError(err.message);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.deleteInventoryItem(deleteItem.id);
      setDeleteItem(null);
      setNotice('Vorrat entfernt.');
      await loadInventory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack-lg inventory-page">
      <section className="inventory-hero">
        <div>
          <p className="eyebrow">Dein Haushalt</p>
          <h1 className="page-title">Vorrat</h1>
          <p>Alles im Blick – schneller erfassen, rechtzeitig verbrauchen und passend kochen.</p>
          <div className="inventory-hero-actions">
            <button className="btn btn-primary" type="button" onClick={() => setIsScannerOpen(true)}>
              <Camera size={19} />
              Barcode scannen
            </button>
            <button className="btn btn-secondary" type="button" onClick={openNewItem}>
              <Plus size={19} />
              Manuell hinzufügen
            </button>
          </div>
        </div>
        <div className="inventory-hero-visual" aria-hidden="true">
          <span><Package size={44} /></span>
          <ScanLine size={54} />
        </div>
      </section>

      <section className="inventory-summary" aria-label="Vorratsübersicht">
        <button type="button" className={!status ? 'active' : ''} onClick={() => setStatus('')}>
          <Package size={20} />
          <span><strong>{summary?.available ?? 0}</strong> auf Lager</span>
        </button>
        <button type="button" className={status === 'low' ? 'active warning' : 'warning'} onClick={() => setStatus(status === 'low' ? '' : 'low')}>
          <AlertTriangle size={20} />
          <span><strong>{summary?.low ?? 0}</strong> knapp / leer</span>
        </button>
        <button type="button" className={status === 'expiring' ? 'active warm' : 'warm'} onClick={() => setStatus(status === 'expiring' ? '' : 'expiring')}>
          <CalendarClock size={20} />
          <span><strong>{summary?.expiring ?? 0}</strong> bald fällig</span>
        </button>
      </section>

      <section className="toolbar inventory-toolbar">
        <div className="search-control">
          <Search size={18} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lebensmittel, Marke oder Barcode suchen" />
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => setIsScannerOpen(true)} disabled={lookupLoading}>
          <Barcode size={18} />
          {lookupLoading ? 'Produkt wird geladen…' : 'Scannen'}
        </button>
      </section>

      {notice && (
        <div className="notice notice-success inventory-notice">
          <Check size={18} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Hinweis schließen"><X size={17} /></button>
        </div>
      )}
      {error && !isFormOpen && <div className="notice notice-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Vorrat wird geladen.</div>
      ) : !items.length ? (
        <div className="empty-state inventory-empty">
          <Package size={38} />
          <h2>{search || status ? 'Keine passenden Vorräte' : 'Dein Vorrat ist noch leer'}</h2>
          <p>{search || status ? 'Passe Suche oder Filter an.' : 'Scanne dein erstes Produkt oder trage ein Lebensmittel manuell ein.'}</p>
          {!search && !status && (
            <button className="btn btn-primary" type="button" onClick={() => setIsScannerOpen(true)}>
              <Camera size={18} /> Jetzt scannen
            </button>
          )}
        </div>
      ) : (
        <div className="inventory-groups">
          {groupedItems.map((group) => (
            <section className="inventory-group" key={group.category}>
              <div className="inventory-group-title">
                <h2>{group.category}</h2>
                <span>{group.items.length}</span>
              </div>
              <div className="inventory-grid">
                {group.items.map((item) => {
                  const step = quantityStep(item.unit);
                  return (
                    <article className={`inventory-card ${item.is_low ? 'low' : ''}`} key={item.id}>
                      <div className="inventory-card-image">
                        {item.image ? <img src={item.image} alt="" /> : <ImageIcon size={30} />}
                        {item.barcode && <span title={item.barcode}><Barcode size={14} /> Produkt</span>}
                      </div>
                      <div className="inventory-card-body">
                        <div className="inventory-card-heading">
                          <div>
                            {item.brand && <small>{item.brand}</small>}
                            <h3>{item.name}</h3>
                          </div>
                          <button className="icon-button" type="button" onClick={() => openEditItem(item)} title="Bearbeiten">
                            <Edit3 size={17} />
                          </button>
                        </div>
                        <div className="inventory-quantity-row">
                          <button type="button" onClick={() => changeQuantity(item, -step)} disabled={Number(item.quantity) <= 0} aria-label="Menge reduzieren">
                            <Minus size={17} />
                          </button>
                          <strong>{formatNumber(item.quantity)} <span>{item.unit}</span></strong>
                          <button type="button" onClick={() => changeQuantity(item, step)} aria-label="Menge erhöhen">
                            <Plus size={17} />
                          </button>
                        </div>
                        <div className="inventory-card-meta">
                          {item.is_low ? <span className="stock-warning"><AlertTriangle size={15} /> Nachfüllen</span> : <span className="stock-ok"><Check size={15} /> Verfügbar</span>}
                          {item.expires_at && (
                            <span className={item.is_expiring ? 'expiry-warning' : ''}>
                              <CalendarClock size={15} /> {dateFormatter.format(parseLocalDate(item.expires_at))}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {isScannerOpen && <BarcodeScanner onClose={() => setIsScannerOpen(false)} onDetected={handleDetected} />}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Vorrat bearbeiten' : form.barcode ? 'Produkt einlagern' : 'Lebensmittel hinzufügen'}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setIsFormOpen(false)}>Abbrechen</button>
            <button className="btn btn-primary" type="submit" form="inventory-form" disabled={saving || !form.name.trim()}>
              <Check size={18} /> {saving ? 'Speichert…' : editingId ? 'Änderungen speichern' : 'Einlagern'}
            </button>
          </>
        }
      >
        <form id="inventory-form" className="inventory-form" onSubmit={saveItem}>
          {error && <div className="notice notice-error">{error}</div>}
          {form.image && <img className="inventory-form-image" src={form.image} alt="Produkt" />}
          {form.barcode && (
            <>
              <div className="barcode-chip"><Barcode size={16} /> {form.barcode}<span>Produktdaten automatisch ergänzt</span></div>
              {form.source === 'openfoodfacts' && (
                <p className="inventory-source-note">
                  Produktdaten von <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>. Bitte Angaben kurz prüfen.
                </p>
              )}
            </>
          )}
          <div className="input-group">
            <label className="input-label" htmlFor="inventory-name">Name *</label>
            <input id="inventory-name" className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
          </div>
          <div className="inventory-form-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-quantity">{editingId ? 'Aktueller Bestand' : 'Hinzugefügte Menge'}</label>
              <input id="inventory-quantity" className="input-field" type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-unit">Einheit</label>
              <select id="inventory-unit" className="input-field" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
                {units.map((unit) => <option key={unit}>{unit}</option>)}
              </select>
            </div>
          </div>
          <div className="inventory-form-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-minimum">Mindestbestand</label>
              <input id="inventory-minimum" className="input-field" type="number" min="0" step="any" value={form.minimum_quantity} onChange={(event) => setForm({ ...form, minimum_quantity: event.target.value })} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-expiry">Mindestens haltbar bis</label>
              <input id="inventory-expiry" className="input-field" type="date" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} />
            </div>
          </div>
          <div className="inventory-form-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-brand">Marke</label>
              <input id="inventory-brand" className="input-field" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="inventory-category">Kategorie</label>
              <input id="inventory-category" className="input-field" list="inventory-categories" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              <datalist id="inventory-categories">{(summary?.categories || []).map((entry) => <option value={entry.category} key={entry.category} />)}</datalist>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="inventory-notes">Notiz</label>
            <textarea id="inventory-notes" className="input-field" rows="2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="z. B. geöffnet, oberes Fach" />
          </div>
          {editingId && (
            <button className="inventory-delete-action" type="button" onClick={() => { setIsFormOpen(false); setDeleteItem(items.find((item) => item.id === editingId)); }}>
              <Trash2 size={17} /> Lebensmittel aus dem Vorrat entfernen
            </button>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        title="Vorrat entfernen"
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteItem(null)}>Abbrechen</button>
            <button className="btn btn-danger" onClick={confirmDelete}><Trash2 size={17} /> Entfernen</button>
          </>
        }
      >
        <p>„{deleteItem?.name}“ wird vollständig aus deinem Vorrat entfernt.</p>
      </Modal>
    </div>
  );
}
