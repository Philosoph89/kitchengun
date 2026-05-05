# KitchenGun Home Assistant Add-on

KitchenGun läuft als Home-Assistant-Add-on über Ingress. Das Add-on baut das React-Frontend, startet die Express-API und speichert die SQLite-Datenbank persistent in `/data/kitchengun.sqlite`.

## Funktionen

- Rezeptbuch mit Chefkoch-Import und Favoriten
- Kochmodus mit Schritt-Checkliste
- Wochenplan mit Frühstück, Mittag, Abendessen und Snack
- Kompakte Dashboard-Kachel für den heutigen Essensplan
- Zutaten aus geplanten Mahlzeiten direkt auf die Einkaufsliste übernehmen
- Einkaufsliste mit Mengenaggregation

## Installation

1. Dieses Repository als Add-on-Repository in Home Assistant hinzufügen.
2. Add-on `KitchenGun` installieren.
3. Add-on starten.
4. KitchenGun über die Seitenleiste öffnen.

## Dashboard-Kachel

KitchenGun stellt über `?view=today-card` eine reduzierte Ansicht für Home-Assistant-Dashboards bereit. Öffne die KitchenGun-Weboberfläche über Home Assistant, kopiere die Ingress-URL aus dem Browser und hänge `?view=today-card` an. Diese URL kannst du in einer Webpage-Karte auf dem Dashboard anzeigen.

## Daten

Rezepte, Zutaten und Einkaufsliste liegen in der SQLite-Datei `/data/kitchengun.sqlite`. Home-Assistant-Backups sichern diese Datei zusammen mit dem Add-on.

## Entwicklung

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

Das Vite-Frontend proxyt `/api` lokal auf `http://localhost:5001`.
