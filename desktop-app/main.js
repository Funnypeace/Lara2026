// =====================================================================
// Vertretungsplan Schulbegleitung – Electron-Hauptprozess (Windows-App)
//
// Lädt dieselbe Web-App (index.html/app.js/data.js/styles.css/vendor)
// wie die Online-Version, in einem eigenen Fenster ohne Browser-Chrome.
// Karte/Routing laufen weiterhin übers Internet (OpenStreetMap/OSRM).
// Die eigentlichen Vertretungsplan-Daten werden aber NICHT im Browser-
// Speicher, sondern in einer echten lokalen JSON-Datei auf der Festplatte
// gespeichert (siehe daten-laden/daten-speichern unten) – überlebt also
// auch das Löschen des Browser-Caches und lässt sich einfach sichern.
// =====================================================================

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

// Im gepackten Zustand liegen die Web-Dateien unter resources/app/,
// im Entwicklungsmodus (npm start) direkt eine Ebene höher im Repo.
const webRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

const indexPath = path.join(webRoot, "index.html");
const datenDatei = path.join(app.getPath("userData"), "vertretungsplan-daten.json");

function erstelleFenster() {
  const fenster = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Vertretungsplan Schulbegleitung",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  fenster.loadFile(indexPath);
  fenster.setMenuBarVisibility(false); // schlichte App-Optik, kein Datei/Bearbeiten-Menü nötig

  return fenster;
}

// ---------- Lokale Datenspeicherung (statt Browser-localStorage) ----------
ipcMain.on("daten-laden", (event) => {
  try {
    event.returnValue = fs.readFileSync(datenDatei, "utf-8");
  } catch (e) {
    event.returnValue = null; // Datei existiert noch nicht (erster Start) → Beispieldaten
  }
});

ipcMain.on("daten-speichern", (event, jsonText) => {
  try {
    fs.mkdirSync(path.dirname(datenDatei), { recursive: true });
    fs.writeFileSync(datenDatei, jsonText, "utf-8");
  } catch (e) {
    console.error("Konnte Vertretungsplan-Daten nicht speichern:", e);
  }
});

ipcMain.on("datenordner-oeffnen", () => {
  fs.mkdirSync(path.dirname(datenDatei), { recursive: true });
  if (fs.existsSync(datenDatei)) shell.showItemInFolder(datenDatei);
  else shell.openPath(path.dirname(datenDatei));
});

// "Sichern unter…": Kopie der aktuellen Datendatei an einen frei wählbaren
// Ort speichern (z. B. auf einen USB-Stick oder ein Netzlaufwerk fürs Backup).
ipcMain.on("daten-sichern-unter", async (event) => {
  const fenster = BrowserWindow.getFocusedWindow();
  const ergebnis = await dialog.showSaveDialog(fenster, {
    title: "Vertretungsplan-Daten sichern",
    defaultPath: `Vertretungsplan_Datensicherung_${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON-Datei", extensions: ["json"] }]
  });
  if (ergebnis.canceled || !ergebnis.filePath) return;
  try {
    fs.copyFileSync(datenDatei, ergebnis.filePath);
    dialog.showMessageBox(fenster, { message: "Datensicherung erfolgreich gespeichert.", type: "info" });
  } catch (e) {
    dialog.showErrorBox("Fehler bei der Datensicherung", String(e));
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  erstelleFenster();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) erstelleFenster();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
