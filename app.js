// =====================================================================
// Vertretungsplan Schulbegleitung – App-Logik
// Karte: Leaflet + OpenStreetMap · Auto-Routen: OSRM (öffentl. Demo-Server)
// ÖPNV: Schätzung + Deep-Link zu Google Maps (travelmode=transit)
// Statusänderungen werden in localStorage gespeichert (Demo).
// =====================================================================

const DEMO_CODE = "lara2026";
const STORAGE_KEY = "vertretungsplan-demo-v1";

// ---------- Zustand (Beispieldaten + lokale Änderungen) ----------
let state = ladeZustand();

function ladeZustand() {
  const basis = {
    mitarbeiterStatus: Object.fromEntries(MITARBEITER.map(m => [m.id, m.status])),
    vertretungBenoetigt: Object.fromEntries(KINDER.map(k => [k.id, k.vertretungBenoetigt])),
    gruende: Object.fromEntries(KINDER.map(k => [k.id, k.grund]))
  };
  try {
    const gespeichert = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (gespeichert) {
      return {
        mitarbeiterStatus: { ...basis.mitarbeiterStatus, ...gespeichert.mitarbeiterStatus },
        vertretungBenoetigt: { ...basis.vertretungBenoetigt, ...gespeichert.vertretungBenoetigt },
        gruende: { ...basis.gruende, ...gespeichert.gruende }
      };
    }
  } catch (e) { /* defekter Speicher → Basisdaten */ }
  return basis;
}

function speichereZustand() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const statusVon = m => state.mitarbeiterStatus[m.id];
const brauchtVertretung = k => state.vertretungBenoetigt[k.id];

// ---------- Login (nur Demo-Schutz, kein echter Zugriffsschutz!) ----------
const loginOverlay = document.getElementById("login-overlay");
const loginInput = document.getElementById("login-code");
const loginBtn = document.getElementById("login-btn");

function pruefeLogin() {
  if (loginInput.value.trim().toLowerCase() === DEMO_CODE) {
    sessionStorage.setItem("vp-login", "ok");
    loginOverlay.classList.add("hidden");
    setTimeout(() => map.invalidateSize(), 100);
  } else {
    loginInput.classList.add("login-error");
    setTimeout(() => loginInput.classList.remove("login-error"), 400);
  }
}
loginBtn.addEventListener("click", pruefeLogin);
loginInput.addEventListener("keydown", e => { if (e.key === "Enter") pruefeLogin(); });
if (sessionStorage.getItem("vp-login") === "ok") loginOverlay.classList.add("hidden");

// ---------- Karte ----------
const map = L.map("map").setView([53.80, 10.05], 10);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const statusFarben = { verfuegbar: "#2e8b57", krank: "#c0392b", im_einsatz: "#d97706" };
const statusText = { verfuegbar: "verfügbar", krank: "krank", im_einsatz: "im Einsatz" };
const modusText = { auto: "🚗 Auto", oepnv: "🚌 ÖPNV" };

let markerEbene = L.layerGroup().addTo(map);
let routenEbene = L.layerGroup().addTo(map);

function schulIcon(alarm) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:26px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.4));">${alarm ? "🚨" : "🏫"}</div>`,
    iconSize: [30, 30], iconAnchor: [15, 26]
  });
}

function mitarbeiterIcon(m) {
  const farbe = statusFarben[statusVon(m)];
  const symbol = m.verkehrsmittel === "auto" ? "🚗" : "🚌";
  return L.divIcon({
    className: "",
    html: `<div style="background:${farbe}; color:#fff; border:2px solid #fff; border-radius:50%;
             width:30px; height:30px; display:flex; align-items:center; justify-content:center;
             font-size:15px; box-shadow:0 1px 4px rgba(0,0,0,.4);">${symbol}</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15]
  });
}

function zeichneMarker() {
  markerEbene.clearLayers();

  KINDER.forEach(k => {
    const alarm = brauchtVertretung(k);
    L.marker([k.schule.lat, k.schule.lng], { icon: schulIcon(alarm) })
      .bindPopup(`<b>${k.name}</b> (${k.klasse})<br>🏫 ${k.schule.name}<br>${alarm ? "🚨 <b>Vertretung benötigt!</b><br>" : ""}
        <a href="#" onclick="oeffneSteckbrief('${k.id}');return false;">📋 Steckbrief öffnen</a>`)
      .addTo(markerEbene);
  });

  MITARBEITER.forEach(m => {
    L.marker([m.wohnort.lat, m.wohnort.lng], { icon: mitarbeiterIcon(m) })
      .bindPopup(`<b>${m.name}</b><br>${modusText[m.verkehrsmittel]} · <span style="color:${statusFarben[statusVon(m)]}; font-weight:700;">${statusText[statusVon(m)]}</span><br>📍 ${m.wohnort.adresse}<br>${m.qualifikation}`)
      .addTo(markerEbene);
  });
}

// ---------- Entfernungen ----------
function luftlinieKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ÖPNV-Schätzung: Ø ~18 km/h Reisegeschwindigkeit + 12 Min. Fußweg/Wartezeit
function oepnvSchaetzungMin(km) { return Math.round(km / 18 * 60 + 12); }
// Auto-Fallback (falls OSRM nicht erreichbar): Ø ~45 km/h über Land
function autoSchaetzungMin(km) { return Math.round(km / 45 * 60 + 4); }

// Fahrzeiten aller Auto-Mitarbeiter zur Schule in EINEM OSRM-Table-Request
async function osrmFahrzeiten(ziel, mitarbeiterListe) {
  const koords = [[ziel.lng, ziel.lat], ...mitarbeiterListe.map(m => [m.wohnort.lng, m.wohnort.lat])]
    .map(c => c.join(",")).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${koords}?destinations=0&annotations=duration,distance`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("OSRM " + resp.status);
  const daten = await resp.json();
  if (daten.code !== "Ok") throw new Error("OSRM: " + daten.code);
  const ergebnis = {};
  mitarbeiterListe.forEach((m, i) => {
    const sek = daten.durations[i + 1]?.[0];
    const meter = daten.distances?.[i + 1]?.[0];
    if (sek != null) ergebnis[m.id] = { minuten: Math.round(sek / 60), km: meter != null ? meter / 1000 : null };
  });
  return ergebnis;
}

// Auto-Route auf der Karte einzeichnen
async function zeigeRoute(m, kind) {
  routenEbene.clearLayers();
  const start = [kind.schule.lat, kind.schule.lng];
  const wohn = [m.wohnort.lat, m.wohnort.lng];
  if (m.verkehrsmittel === "auto") {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${m.wohnort.lng},${m.wohnort.lat};${kind.schule.lng},${kind.schule.lat}?overview=full&geometries=geojson`;
      const resp = await fetch(url);
      const daten = await resp.json();
      if (daten.code === "Ok") {
        const linie = daten.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        L.polyline(linie, { color: "#1d5fa8", weight: 5, opacity: .8 }).addTo(routenEbene);
        map.fitBounds(L.latLngBounds(linie).pad(0.15));
        return;
      }
    } catch (e) { /* Fallback unten */ }
  }
  // ÖPNV oder OSRM-Fehler: gestrichelte Luftlinie
  L.polyline([wohn, start], { color: "#d97706", weight: 4, dashArray: "8 8", opacity: .8 }).addTo(routenEbene);
  map.fitBounds(L.latLngBounds([wohn, start]).pad(0.2));
}

// ---------- Links (Google Maps & WhatsApp) ----------
function gmapsLink(m, kind) {
  const modus = m.verkehrsmittel === "auto" ? "driving" : "transit";
  return `https://www.google.com/maps/dir/?api=1&origin=${m.wohnort.lat},${m.wohnort.lng}` +
         `&destination=${encodeURIComponent(kind.schule.adresse)}&travelmode=${modus}`;
}

function steckbriefText(k) {
  return [
    `📋 *Steckbrief ${k.name}* (${k.alter} J., Klasse ${k.klasse})`,
    ``,
    `🏫 *Schule:* ${k.schule.name}`,
    `📍 ${k.schule.adresse}`,
    `🕐 *Betreuungszeit:* ${k.betreuungszeit}`,
    ``,
    `🩺 *Diagnose:* ${k.diagnose}`,
    ``,
    `⚠️ *Wichtig zu beachten:*`,
    k.hinweise,
    ``,
    `📞 *Notfallkontakt:* ${k.notfallkontakt}`
  ].join("\n");
}

function whatsappSteckbriefLink(k) {
  return `https://wa.me/?text=${encodeURIComponent(steckbriefText(k))}`;
}

function whatsappAnfrageLink(m, kind, dauerText) {
  const text = [
    `Hallo ${m.name.split(" ")[0]}, kannst du morgen die Vertretung für *${kind.name}* übernehmen?`,
    ``,
    `🏫 ${kind.schule.name}, ${kind.schule.adresse}`,
    `🕐 ${kind.betreuungszeit}`,
    `${m.verkehrsmittel === "auto" ? "🚗" : "🚌"} Anfahrt von dir ca. ${dauerText}`,
    ``,
    `Den Steckbrief schicke ich dir bei Zusage. Gib mir bitte kurz Bescheid! 🙏`
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- UI: Kopfzeile ----------
function zeichneStats() {
  const faelle = KINDER.filter(brauchtVertretung).length;
  const verf = MITARBEITER.filter(m => statusVon(m) === "verfuegbar").length;
  const krank = MITARBEITER.filter(m => statusVon(m) === "krank").length;
  document.getElementById("header-stats").innerHTML = `
    <div class="stat"><b>${faelle}</b>offene Fälle</div>
    <div class="stat"><b>${verf}</b>verfügbar</div>
    <div class="stat"><b>${krank}</b>krank</div>`;
}

// ---------- UI: Tabs ----------
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------- UI: Vertretungsfälle ----------
function zeichneFaelle() {
  const container = document.getElementById("faelle-liste");
  const faelle = KINDER.filter(brauchtVertretung);
  if (!faelle.length) {
    container.innerHTML = `<div class="card"><h3>✅ Keine offenen Fälle</h3>
      <div class="meta">Aktuell benötigt kein Kind eine Vertretung. Bedarf kann im Tab „Kinder" gemeldet werden.</div></div>`;
    return;
  }
  container.innerHTML = faelle.map(k => {
    const stamm = MITARBEITER.find(m => m.id === k.stammkraft);
    return `<div class="card fall-alarm">
      <h3>🚨 ${k.name} <span class="meta">· ${k.klasse}</span></h3>
      <div class="meta">🏫 ${k.schule.name}<br>🕐 ${k.betreuungszeit}<br>👤 Stammkraft: ${stamm ? stamm.name : "–"}</div>
      <div class="grund">${state.gruende[k.id] || "Vertretung benötigt"}</div>
      <div class="card-actions">
        <button class="aktion aktion-primaer" onclick="sucheVertretung('${k.id}')">🔍 Vertretung suchen</button>
        <button class="aktion aktion-sekundaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
        <button class="aktion aktion-sekundaer" onclick="fallSchliessen('${k.id}')">✅ erledigt</button>
      </div>
    </div>`;
  }).join("");
}

window.fallSchliessen = function (kindId) {
  state.vertretungBenoetigt[kindId] = false;
  state.gruende[kindId] = "";
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Ranking ----------
window.sucheVertretung = async function (kindId) {
  const kind = KINDER.find(k => k.id === kindId);
  document.getElementById("faelle-liste").classList.add("hidden");
  const panel = document.getElementById("ranking-panel");
  panel.classList.remove("hidden");
  const inhalt = document.getElementById("ranking-inhalt");

  map.setView([kind.schule.lat, kind.schule.lng], 12);

  const verfuegbare = MITARBEITER.filter(m => statusVon(m) === "verfuegbar");
  if (!verfuegbare.length) {
    inhalt.innerHTML = `<div class="ranking-kopf">Für <b>${kind.name}</b> (${kind.schule.name}) ist aktuell <b>niemand verfügbar</b>. Status im Tab „Mitarbeiter" prüfen.</div>`;
    return;
  }

  inhalt.innerHTML = `
    <div class="ranking-kopf">Vertretung für <b>${kind.name}</b><br>🏫 ${kind.schule.name}<br>🕐 ${kind.betreuungszeit}</div>
    <p class="laden">⏳ Berechne Fahrzeiten (${verfuegbare.length} verfügbare Mitarbeiter)…</p>`;

  // Fahrzeiten ermitteln
  const autos = verfuegbare.filter(m => m.verkehrsmittel === "auto");
  let osrm = {};
  let osrmFehler = false;
  if (autos.length) {
    try { osrm = await osrmFahrzeiten(kind.schule, autos); }
    catch (e) { osrmFehler = true; }
  }

  const eintraege = verfuegbare.map(m => {
    const km = luftlinieKm(m.wohnort, kind.schule);
    let minuten, kmAnzeige, echt;
    if (m.verkehrsmittel === "auto" && osrm[m.id]) {
      minuten = osrm[m.id].minuten;
      kmAnzeige = osrm[m.id].km != null ? osrm[m.id].km : km;
      echt = true;
    } else if (m.verkehrsmittel === "auto") {
      minuten = autoSchaetzungMin(km); kmAnzeige = km; echt = false;
    } else {
      minuten = oepnvSchaetzungMin(km); kmAnzeige = km; echt = false;
    }
    return { m, minuten, km: kmAnzeige, echt };
  }).sort((a, b) => a.minuten - b.minuten);

  inhalt.innerHTML = `
    <div class="ranking-kopf">Vertretung für <b>${kind.name}</b><br>🏫 ${kind.schule.name}<br>🕐 ${kind.betreuungszeit}
      ${osrmFehler ? '<br><small>⚠️ Routendienst nicht erreichbar – Auto-Zeiten sind geschätzt.</small>' : ""}
    </div>
    ${eintraege.map((e, i) => {
      const dauerText = `${e.minuten} Min.${e.echt ? "" : " (geschätzt)"}`;
      return `<div class="card klickbar" onclick="zeigeRouteKlick('${e.m.id}','${kind.id}')">
        <h3><span class="rang-nr">${i + 1}</span> ${e.m.name}
          <span class="pill pill-modus">${modusText[e.m.verkehrsmittel]}</span></h3>
        <div class="meta">📍 ${e.m.wohnort.adresse} · ${e.km.toFixed(1)} km<br>
          ⏱ <span class="dauer">${dauerText}</span> bis ${kind.schule.name}<br>
          🎓 ${e.m.qualifikation}</div>
        <div class="card-actions" onclick="event.stopPropagation()">
          <a class="aktion aktion-whatsapp" target="_blank" rel="noopener"
             href="${whatsappAnfrageLink(e.m, kind, dauerText)}">💬 per WhatsApp anfragen</a>
          <a class="aktion aktion-sekundaer" target="_blank" rel="noopener"
             href="${gmapsLink(e.m, kind)}">🗺️ ${e.m.verkehrsmittel === "auto" ? "Route" : "ÖPNV-Verbindung"} öffnen</a>
        </div>
      </div>`;
    }).join("")}
    <p class="tab-hint">Tipp: Karte zeigt die Anfahrt, wenn du einen Eintrag antippst. ÖPNV-Zeiten sind Schätzwerte – der Verbindungs-Link öffnet die echte Fahrplanauskunft.</p>`;
};

window.zeigeRouteKlick = function (mId, kId) {
  const m = MITARBEITER.find(x => x.id === mId);
  const k = KINDER.find(x => x.id === kId);
  zeigeRoute(m, k);
};

document.getElementById("ranking-back").addEventListener("click", () => {
  document.getElementById("ranking-panel").classList.add("hidden");
  document.getElementById("faelle-liste").classList.remove("hidden");
  routenEbene.clearLayers();
});

// ---------- UI: Mitarbeiter ----------
const statusReihenfolge = ["verfuegbar", "krank", "im_einsatz"];

function zeichneMitarbeiter() {
  const container = document.getElementById("mitarbeiter-liste");
  const sortiert = [...MITARBEITER].sort((a, b) =>
    statusReihenfolge.indexOf(statusVon(a)) - statusReihenfolge.indexOf(statusVon(b)) ||
    a.name.localeCompare(b.name));
  container.innerHTML = sortiert.map(m => `
    <div class="card">
      <h3>${m.name}
        <span class="pill pill-${statusVon(m)} pill-klick" title="Status ändern"
              onclick="statusWechseln('${m.id}')">${statusText[statusVon(m)]}</span>
        <span class="pill pill-modus">${modusText[m.verkehrsmittel]}</span>
      </h3>
      <div class="meta">📍 ${m.wohnort.adresse} · 📞 ${m.telefon}<br>🎓 ${m.qualifikation}</div>
    </div>`).join("");
}

window.statusWechseln = function (mId) {
  const aktuell = state.mitarbeiterStatus[mId];
  const naechster = statusReihenfolge[(statusReihenfolge.indexOf(aktuell) + 1) % statusReihenfolge.length];
  state.mitarbeiterStatus[mId] = naechster;
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Kinder ----------
function zeichneKinder() {
  const container = document.getElementById("kinder-liste");
  container.innerHTML = KINDER.map(k => {
    const stamm = MITARBEITER.find(m => m.id === k.stammkraft);
    const offen = brauchtVertretung(k);
    return `<div class="card ${offen ? "fall-alarm" : ""}">
      <h3>${k.name} <span class="meta">· ${k.alter} J. · ${k.klasse}</span>
        ${offen ? '<span class="pill pill-krank">Vertretung offen</span>' : ""}</h3>
      <div class="meta">🏫 ${k.schule.name}<br>👤 Stammkraft: ${stamm ? stamm.name : "–"}</div>
      <div class="card-actions">
        <button class="aktion aktion-primaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
        ${offen
          ? `<button class="aktion aktion-sekundaer" onclick="fallSchliessen('${k.id}')">✅ Fall schließen</button>`
          : `<button class="aktion aktion-rot" onclick="bedarfMelden('${k.id}')">🚨 Vertretung melden</button>`}
      </div>
    </div>`;
  }).join("");
}

window.bedarfMelden = function (kindId) {
  const grund = prompt("Grund für den Vertretungsbedarf (z. B. „Stammkraft krankgemeldet“):", "Stammkraft krankgemeldet");
  if (grund === null) return;
  state.vertretungBenoetigt[kindId] = true;
  state.gruende[kindId] = grund || "Vertretung benötigt";
  speichereZustand();
  allesNeuZeichnen();
  document.querySelector('.tab[data-tab="faelle"]').click();
};

// ---------- UI: Steckbrief-Modal ----------
const modalOverlay = document.getElementById("modal-overlay");
const modal = document.getElementById("modal");

window.oeffneSteckbrief = function (kindId) {
  const k = KINDER.find(x => x.id === kindId);
  const stamm = MITARBEITER.find(m => m.id === k.stammkraft);
  modal.innerHTML = `
    <h2>📋 Steckbrief: ${k.name}</h2>
    <div class="untertitel">${k.alter} Jahre · Klasse ${k.klasse}</div>
    <div class="steckbrief-feld"><label>Schule</label><div>${k.schule.name}<br>${k.schule.adresse}</div></div>
    <div class="steckbrief-feld"><label>Betreuungszeit</label><div>${k.betreuungszeit}</div></div>
    <div class="steckbrief-feld"><label>Diagnose</label><div>${k.diagnose}</div></div>
    <div class="steckbrief-feld"><label>Wichtig zu beachten</label>
      <div class="steckbrief-wichtig">⚠️ ${k.hinweise}</div></div>
    <div class="steckbrief-feld"><label>Notfallkontakt</label><div>${k.notfallkontakt}</div></div>
    <div class="steckbrief-feld"><label>Stammkraft</label><div>${stamm ? `${stamm.name} (${stamm.telefon})` : "–"}</div></div>
    <div class="modal-actions">
      <a class="aktion aktion-whatsapp" target="_blank" rel="noopener"
         href="${whatsappSteckbriefLink(k)}">💬 Steckbrief per WhatsApp senden</a>
      <button class="aktion aktion-sekundaer" onclick="schliesseModal()">Schließen</button>
    </div>`;
  modalOverlay.classList.remove("hidden");
};

window.schliesseModal = function () { modalOverlay.classList.add("hidden"); };
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) schliesseModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") schliesseModal(); });

// ---------- Start ----------
function allesNeuZeichnen() {
  zeichneStats();
  zeichneFaelle();
  zeichneMitarbeiter();
  zeichneKinder();
  zeichneMarker();
}
allesNeuZeichnen();
