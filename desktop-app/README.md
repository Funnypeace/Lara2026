# 🧭 Vertretungsplan Schulbegleitung – Windows-Desktop-App

Dieselbe App wie die Online-Version, aber als eigenständiges Windows-Programm:
eigenes Fenster (kein Browser drumherum), Icon, Startmenü-Eintrag – und die
**Vertretungsplan-Daten werden in einer echten lokalen Datei** gespeichert statt
im Browser-Speicher. Karte und Routenberechnung laufen weiterhin über das
Internet (OpenStreetMap/OSRM), wie in der Online-Version.

## Wie es aufgebaut ist

Diese App lädt **dieselben Dateien** wie die Online-Version
(`../index.html`, `../app.js`, `../data.js`, `../styles.css`, `../vendor/`) –
es gibt keine doppelte Kopie des Codes. Änderungen an der Web-App (z. B. neue
Beispieldaten in `data.js`) wirken sich beim nächsten Bauen automatisch auch
auf die Desktop-App aus.

Die einzige echte Neuerung ist die Datenspeicherung: `main.js` stellt der App
über `preload.js` eine kleine Schnittstelle (`window.electronAPI`) bereit, mit
der `app.js` die Vertretungsplan-Daten in eine JSON-Datei schreibt/liest,
statt in den Browser-Speicher (`localStorage`) – siehe `ladeZustand()` /
`speichereZustand()` in `../app.js`. Die Online-Version (Vercel) merkt davon
nichts, da `window.electronAPI` dort nicht existiert.

Die Datendatei liegt unter:
`%APPDATA%\vertretungsplan-schulbegleitung\vertretungsplan-daten.json`
(über den Footer-Link „📁 Datenordner öffnen" in der App direkt erreichbar).
Über „💾 Datensicherung speichern unter …" lässt sich jederzeit eine Kopie an
einen beliebigen Ort exportieren (z. B. Netzlaufwerk, USB-Stick).

## ⚠️ Wichtiger Hinweis zum Bauen

Ich konnte das fertige `.exe` in dieser Cloud-Umgebung **nicht selbst
erzeugen** – der Download der Electron-Programmdatei (ca. 150 MB, von den
GitHub-Servern von Electron) wird hier vom Netzwerk blockiert
(„403 Forbidden"). Das ist eine Einschränkung dieser Sandbox, kein Fehler im
Code. Der Code selbst ist vollständig und auf Syntaxfehler geprüft.

**Zum Bauen wird ein normaler Rechner mit Internetzugang benötigt** (Windows,
Mac oder Linux – das Bauen für Windows funktioniert von jedem System aus).

## Bauanleitung (einmalig, für IT/technisch versierte Person)

Voraussetzung: [Node.js](https://nodejs.org) (Version 18 oder neuer) ist installiert.

```bash
cd desktop-app
npm install
npm run build:win
```

Das fertige Programm liegt danach in `desktop-app/dist/` als
**`VertretungsplanSchulbegleitung.exe`** – eine einzelne Datei ohne
Installation nötig ("portable"), kann direkt per Doppelklick gestartet oder
z. B. auf ein Netzlaufwerk/USB-Stick kopiert werden.

Für eine klassische Windows-Installer-Datei (mit Startmenü-Eintrag,
Deinstallation über die Systemsteuerung) stattdessen:

```bash
npm run build:win-installer
```

### Falls der Build mit „Cannot create symbolic link" abbricht

Bekanntes Windows-Problem: `electron-builder` versucht standardmäßig,
macOS-Signierwerkzeuge herunterzuladen (die für eine Windows-Version gar
nicht gebraucht werden) und scheitert beim Entpacken, weil normale
Windows-Konten keine symbolischen Links erstellen dürfen. Die Build-Skripte
oben setzen dafür bereits `CSC_IDENTITY_AUTO_DISCOVERY=false` (verhindert
den unnötigen Download). Tritt der Fehler trotzdem auf (z. B. bei einem
älteren Cache-Stand), einmalig den Cache löschen und erneut versuchen:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction SilentlyContinue
npm run build:win
```

## Zum Testen ohne Bauen (Entwicklungsmodus)

```bash
cd desktop-app
npm install
npm start
```

Startet die App direkt, ohne eine `.exe` zu erzeugen – gut zum schnellen
Ausprobieren auf dem eigenen Rechner.

## Updates

Ändert sich die Web-App (`../app.js`, `../data.js` etc.), einfach `npm run
build:win` erneut ausführen – es entsteht eine neue `.exe` mit dem
aktuellen Stand. Es gibt (noch) keinen automatischen Update-Mechanismus;
die neue `.exe` muss manuell verteilt werden.
