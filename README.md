# identity-upgrade.com – Landingpages

Statische Landingpages für Identity Upgrade™ (Escape Self-Sabotage), Deutsch und Englisch.

## Aufbau

- `src/content/de.json`, `src/content/en.json` – alle Texte, je Sprache eine Datei. `*Sternchen*` = kursives rotes Akzentwort.
- `src/content/config.json` – Preise, Datum Einführungspreis, Kit-Formular-IDs, Digistore24-Links, Daten der LLP.
- `src/assets/` – CSS, JavaScript, Schriften, Bilder (nur Mockups, keine Buch-PDFs).
- `src/static/` – `_headers`, `robots.txt`.
- `build.mjs` – erzeugt die Seiten in `dist/` (ohne Abhängigkeiten).

## Cloudflare Pages

- Build-Befehl: `node build.mjs`
- Ausgabeordner: `dist`
- Live-Zweig: `main`

## Veröffentlichungsprozess

1. Änderungen nur auf Vorschau-Zweigen (`vorschau/...`), nie direkt auf `main`.
2. Cloudflare erstellt automatisch eine geschützte Vorschau.
3. Pull Request nach `main` mit Vorschau-Link.
4. Live geht eine Änderung nur, wenn Heike den Pull Request selbst mergt.

## Schriften

Instrument Serif, Inter und Liberation Mono (SIL OFL) liegen lokal in `src/assets/fonts`.
Platzhalter bis zum Austausch: Label (Outfit statt Clash Display), Handschrift (Nothing You Could Do statt Gochi Hand).
Zum Austausch die Dateien ersetzen; die Schriftnamen in `site.css` (`IU Label`, `IU Mono`, `IU Hand`) bleiben gleich.

## Herkunft der Anmeldungen

Links mit `?quelle=instagram&kampagne=november` werden ohne Cookies ausgelesen und als
versteckte Felder `fields[quelle]` und `fields[kampagne]` an Kit übergeben.
