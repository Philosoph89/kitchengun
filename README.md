# KitchenGun

KitchenGun ist ein Rezeptbuch mit Chefkoch-Import, Vorratsverwaltung, Barcode-Scanner, Favoriten, Kochmodus, Wochenplan, skalierbaren Portionen und Einkaufsliste. Die App läuft lokal als Vite/Express-Projekt und ist zusätzlich als Home-Assistant-Add-on installierbar.

## Lokal starten

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Das Frontend ruft `/api` relativ auf. Lokal proxyt Vite die API auf `http://localhost:5001`.

## Produktionsmodus

```bash
cd frontend
npm run build
cd ../backend
npm start
```

Der Express-Server liefert dann die Dateien aus `frontend/dist` aus und stellt die API unter derselben Origin bereit.

## Home Assistant

Der Ordner `kitchengun/` ist das Add-on. Wenn dieses Repository in Home Assistant als Add-on-Repository hinzugefügt wird, erscheint `KitchenGun` als installierbares Add-on mit Ingress-Seitenleisteneintrag.

Persistente Daten liegen im Add-on unter `/data/kitchengun.sqlite`.

### Dashboard-Kachel

Für Home-Assistant-Dashboards gibt es eine kompakte Tagesansicht unter `/today-card`.

Home-Assistant-Ingress initialisiert den statischen Add-on-Pfad erst, wenn die App einmal über die Seitenleiste geöffnet wurde. Für eine Dashboard-Karte, die sofort nach dem Laden der Übersicht funktioniert, aktiviere in der Add-on-Konfiguration unter Netzwerk optional den Port `8099/tcp` und verwende in der Webpage-Karte `http://<home-assistant-host>:8099/today-card`.

Der Direktzugang erlaubt nur die Lese-Endpunkte der Tageskarte (`/today-card` und `/api/meal-plan/today`). Die normale App und alle Schreib-APIs bleiben hinter Ingress.

## Features

- Rezepte anlegen, bearbeiten, importieren und als Favorit markieren
- Lebensmittel manuell oder per Kamera-Barcode-Scan inventarisieren
- Native Fotoaufnahme als Scanner-Fallback für Home-Assistant-Ingress und HTTP-Verbindungen
- Produktname, Packungsmenge, Marke und Bild über Open Food Facts ergänzen
- Mengen, Mindestbestand und Mindesthaltbarkeitsdatum komfortabel pflegen
- Rezeptbestand optional nach dem Kochen automatisch reduzieren
- Rezepte nach vollständig vorhandenen Zutaten filtern
- Zutaten automatisch auf Portionen skalieren
- Kochmodus mit Schritt-Checkliste und lokal gespeichertem Fortschritt
- Wochenplan mit Frühstück, Mittag, Abendessen und Snack
- Kompakte Home-Assistant-Dashboard-Kachel für den heutigen Essensplan
- Zutaten einzelner geplanter Mahlzeiten oder einer ganzen Woche auf die Einkaufsliste übernehmen
- Einkaufsliste mit Mengenaggregation und Fortschrittsanzeige
