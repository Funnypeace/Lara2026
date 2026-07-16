// =====================================================================
// Service Worker – macht die App auf dem Handy (und überall sonst)
// installierbar und OHNE Internetverbindung startbar. Karte (OpenStreetMap-
// Kacheln) und Routenberechnung (OSRM) werden bewusst NICHT gecacht – die
// brauchen weiterhin eine Verbindung, wie besprochen.
//
// Strategie fürs App-Gerüst (HTML/CSS/JS/Icons): "Netzwerk zuerst, dann
// Cache" – wenn online, wird immer die aktuelle Version geladen (kein
// Veraltungsproblem); nur wenn KEIN Internet verfügbar ist, springt der
// zuletzt gecachte Stand ein. So bleibt die App offline nutzbar, ohne dass
// Nutzerinnen an einer alten Version hängen bleiben, sobald wieder online.
// =====================================================================

// Bei jeder inhaltlichen Änderung an den unten gelisteten Dateien diese
// Versionsnummer erhöhen – sonst behalten Handys ggf. eine alte Version.
const CACHE_VERSION = "v1";
const CACHE_NAME = `vertretungsplan-appschale-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.json",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
  "./vendor/jspdf/jspdf.umd.min.js",
  "./vendor/xlsx/xlsx.full.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nur eigene App-Dateien behandeln – externe Requests (OpenStreetMap-
  // Kacheln, OSRM-Routing, Google Maps/WhatsApp-Links) unangetastet lassen,
  // die laufen ganz normal übers Netzwerk wie ohne Service Worker.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(event.request).then((gecacht) => gecacht || caches.match("./index.html")))
  );
});
