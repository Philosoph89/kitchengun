# KitchenGun

KitchenGun ist ein Rezeptbuch mit Chefkoch-Import, Favoriten, Kochmodus, Wochenplan, skalierbaren Portionen und Einkaufsliste. Die App läuft lokal als Vite/Express-Projekt und ist zusätzlich als Home-Assistant-Add-on installierbar.

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

## Features

- Rezepte anlegen, bearbeiten, importieren und als Favorit markieren
- Zutaten automatisch auf Portionen skalieren
- Kochmodus mit Schritt-Checkliste und lokal gespeichertem Fortschritt
- Wochenplan mit Frühstück, Mittag, Abendessen und Snack
- Zutaten einzelner geplanter Mahlzeiten oder einer ganzen Woche auf die Einkaufsliste übernehmen
- Einkaufsliste mit Mengenaggregation und Fortschrittsanzeige
