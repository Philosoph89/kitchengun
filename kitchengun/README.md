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

KitchenGun stellt unter `/today-card` eine reduzierte Ansicht für Home-Assistant-Dashboards bereit.

Home-Assistant-Ingress initialisiert den statischen Add-on-Pfad erst, wenn die App einmal über die Seitenleiste geöffnet wurde. Für eine Dashboard-Karte, die sofort nach dem Laden der Übersicht funktioniert, aktiviere in der Add-on-Konfiguration unter Netzwerk optional den Port `8099/tcp` und verwende in der Webpage-Karte `http://<home-assistant-host>:8099/today-card`.

Der Direktzugang erlaubt nur die Lese-Endpunkte der Tageskarte (`/today-card` und `/api/meal-plan/today`). Die normale App und alle Schreib-APIs bleiben hinter Ingress.

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
