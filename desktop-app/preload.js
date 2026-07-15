// Stellt der Web-App (app.js) eine sichere, minimale Schnittstelle zum
// lokalen Dateisystem zur Verfügung. Läuft mit contextIsolation, d. h.
// die Web-Seite selbst hat KEINEN direkten Zugriff auf Node.js/fs –
// nur auf die hier bewusst freigegebenen Funktionen.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ladeDaten: () => ipcRenderer.sendSync("daten-laden"),
  speichereDaten: (jsonText) => ipcRenderer.send("daten-speichern", jsonText),
  oeffneDatenordner: () => ipcRenderer.send("datenordner-oeffnen"),
  sichereUnter: () => ipcRenderer.send("daten-sichern-unter")
});
