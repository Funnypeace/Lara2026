// =====================================================================
// Vertretungsplan Schulbegleitung – App-Logik (Prototyp)
//
// Karte: Leaflet (lokal) + OpenStreetMap-Kacheln
// Auto-Routen: OSRM (OpenStreetMap-basiert, kostenlos, kein API-Key) –
//   fällt der Dienst aus, rechnet die App OFFLINE mit Luftlinie weiter.
// ÖPNV: Offline-Schätzung + Deep-Link zur echten Verbindungsauskunft.
// Alle Änderungen (Status, Fälle, Protokoll) landen im localStorage –
// im späteren Produktivbetrieb ersetzt die IT das durch Server + Login.
// =====================================================================

const DEMO_CODE = "lara2026";
const STORAGE_KEY = "vertretungsplan-demo-v2";

// ---------- Zustand (Beispieldaten + lokale Änderungen) ----------
let state = ladeZustand();

function ladeZustand() {
  const basis = {
    mitarbeiterStatus: Object.fromEntries(MITARBEITER.map(m => [m.id, m.status])),
    vertretungBenoetigt: Object.fromEntries(KINDER.map(k => [k.id, k.vertretungBenoetigt])),
    gruende: Object.fromEntries(KINDER.map(k => [k.id, k.grund])),
    protokoll: [...BEISPIEL_PROTOKOLL]
  };
  try {
    const gespeichert = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (gespeichert) {
      return {
        mitarbeiterStatus: { ...basis.mitarbeiterStatus, ...gespeichert.mitarbeiterStatus },
        vertretungBenoetigt: { ...basis.vertretungBenoetigt, ...gespeichert.vertretungBenoetigt },
        gruende: { ...basis.gruende, ...gespeichert.gruende },
        protokoll: Array.isArray(gespeichert.protokoll) ? gespeichert.protokoll : basis.protokoll
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
const kinderVon = m => KINDER.filter(k => k.stammkraft === m.id);
const mitarbeiterMitId = id => MITARBEITER.find(m => m.id === id);
const kindMitId = id => KINDER.find(k => k.id === id);

// ---------- Protokoll ----------
function heuteISO() { return new Date().toISOString().slice(0, 10); }
function jetztZeit() { return new Date().toTimeString().slice(0, 5); }
function datumDE(iso) {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

function logEintrag(typ, text) {
  state.protokoll.push({ datum: heuteISO(), zeit: jetztZeit(), typ, text });
  speichereZustand();
}

// ---------- Login (nur Demo-Schutz – echter Login folgt durch die IT) ----------
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
    const betreut = kinderVon(m).map(k => k.name).join(", ") || "–";
    L.marker([m.wohnort.lat, m.wohnort.lng], { icon: mitarbeiterIcon(m) })
      .bindPopup(`<b>${m.name}</b><br>${modusText[m.verkehrsmittel]} · <span style="color:${statusFarben[statusVon(m)]}; font-weight:700;">${statusText[statusVon(m)]}</span><br>📍 ${m.wohnort.adresse}<br>🎒 Stammkind(er): ${betreut}<br>${m.qualifikation}`)
      .addTo(markerEbene);
  });
}

// ---------- Entfernungen (kostenlos: OSRM/OpenStreetMap + Offline-Fallback) ----------
function luftlinieKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Offline-Schätzungen (wenn kein Routendienst erreichbar ist):
// ÖPNV: Ø ~18 km/h Reisegeschwindigkeit + 12 Min. Fußweg/Wartezeit
function oepnvSchaetzungMin(km) { return Math.round(km / 18 * 60 + 12); }
// Auto: Ø ~45 km/h über Land + 4 Min. Losfahren/Parken
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
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(m.wohnort.adresse)}` +
         `&destination=${encodeURIComponent(kind.schule.adresse)}&travelmode=${modus}`;
}

function steckbriefText(k) {
  const zeilen = [
    `📋 *Steckbrief ${k.name}* (${k.alter} J., Klasse ${k.klasse})`,
    ``,
    `🏫 *Schule:* ${k.schule.name}`,
    `📍 ${k.schule.adresse}`,
    `🕐 *Betreuungszeit:* ${k.betreuungszeit}`,
    ``,
    `🩺 *Diagnose:* ${k.diagnose}`,
    ``,
    `⚠️ *Wichtig zu beachten:*`,
    k.hinweise
  ];
  if (anforderungsText(k)) zeilen.push(``, `👥 *Anforderung an die Vertretung:* ${anforderungsText(k)}`);
  zeilen.push(``, `📞 *Notfallkontakt:* ${k.notfallkontakt}`);
  return zeilen.join("\n");
}

function whatsappSteckbriefLink(k) {
  return `https://wa.me/?text=${encodeURIComponent(steckbriefText(k))}`;
}

function whatsappAnfrageLink(m, kind, dauerText) {
  const text = [
    `Hallo ${m.name.split(" ")[0]}, kannst du die Vertretung für *${kind.name}* übernehmen?`,
    ``,
    `🏫 ${kind.schule.name}, ${kind.schule.adresse}`,
    `🕐 ${kind.betreuungszeit}`,
    `${m.verkehrsmittel === "auto" ? "🚗" : "🚌"} Anfahrt von dir ca. ${dauerText}`,
    ``,
    `Den Steckbrief schicke ich dir bei Zusage. Gib mir bitte kurz Bescheid! 🙏`
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------- Anforderungen an die Vertretung ----------
function anforderungsText(k) {
  const a = k.anforderungen || {};
  const teile = [];
  if (a.keineVertretung) teile.push("Keine fremde Vertretung gewünscht!");
  if (a.geschlecht === "m") teile.push("Nur männliche Vertretung.");
  if (a.geschlecht === "w") teile.push("Nur weibliche Vertretung.");
  if (a.hinweis) teile.push(a.hinweis);
  return teile.join(" ");
}

function anforderungsBadges(k) {
  const a = k.anforderungen || {};
  let html = "";
  if (a.keineVertretung) html += `<span class="pill pill-krank">🚫 keine Vertretung gewünscht</span>`;
  if (a.geschlecht === "m") html += `<span class="pill pill-anforderung">👨 nur männlich</span>`;
  if (a.geschlecht === "w") html += `<span class="pill pill-anforderung">👩 nur weiblich</span>`;
  return html;
}

function erfuelltAnforderungen(m, k) {
  const a = k.anforderungen || {};
  if (a.geschlecht && m.geschlecht !== a.geschlecht) return false;
  return true;
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
      <div class="meta">Aktuell benötigt kein Kind eine Vertretung. Meldet sich ein Mitarbeiter krank (Tab „Mitarbeiter"), entsteht hier automatisch ein Fall für sein Stammkind.</div></div>`;
    return;
  }
  container.innerHTML = faelle.map(k => {
    const stamm = mitarbeiterMitId(k.stammkraft);
    const keine = k.anforderungen?.keineVertretung;
    return `<div class="card fall-alarm">
      <h3>🚨 ${k.name} <span class="meta">· ${k.klasse}</span> ${anforderungsBadges(k)}</h3>
      <div class="meta">🏫 ${k.schule.name}<br>🕐 ${k.betreuungszeit}<br>👤 Stammkraft: ${stamm ? stamm.name : "–"}</div>
      <div class="grund">${state.gruende[k.id] || "Vertretung benötigt"}</div>
      ${keine ? `<div class="anforderung-warnung">🚫 ${k.anforderungen.hinweis || "Es wird keine fremde Vertretung gewünscht."}</div>` : ""}
      <div class="card-actions">
        ${keine
          ? `<button class="aktion aktion-sekundaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
             <button class="aktion aktion-sekundaer" onclick="fallSchliessen('${k.id}', true)">✅ Eltern informiert / erledigt</button>`
          : `<button class="aktion aktion-primaer" onclick="sucheVertretung('${k.id}')">🔍 Vertretung suchen</button>
             <button class="aktion aktion-sekundaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
             <button class="aktion aktion-sekundaer" onclick="fallSchliessen('${k.id}', false)">✅ erledigt</button>`}
      </div>
    </div>`;
  }).join("");
}

window.fallSchliessen = function (kindId, ohneVertretung) {
  const k = kindMitId(kindId);
  state.vertretungBenoetigt[kindId] = false;
  state.gruende[kindId] = "";
  logEintrag("info", ohneVertretung
    ? `ℹ️ Fall ${k.name} ohne Vertretung geschlossen (keine Vertretung gewünscht / anders gelöst)`
    : `ℹ️ Fall ${k.name} geschlossen`);
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Ranking ----------
window.sucheVertretung = async function (kindId) {
  const kind = kindMitId(kindId);
  document.getElementById("faelle-liste").classList.add("hidden");
  const panel = document.getElementById("ranking-panel");
  panel.classList.remove("hidden");
  const inhalt = document.getElementById("ranking-inhalt");

  map.setView([kind.schule.lat, kind.schule.lng], 12);

  const anfHinweis = anforderungsText(kind)
    ? `<div class="anforderung-warnung">👥 Anforderung: ${anforderungsText(kind)}</div>` : "";

  const alleVerfuegbaren = MITARBEITER.filter(m => statusVon(m) === "verfuegbar");
  const passende = alleVerfuegbaren.filter(m => erfuelltAnforderungen(m, kind));
  const aussortiert = alleVerfuegbaren.length - passende.length;

  if (!passende.length) {
    inhalt.innerHTML = `<div class="ranking-kopf">Vertretung für <b>${kind.name}</b><br>🏫 ${kind.schule.name}</div>
      ${anfHinweis}
      <div class="card"><h3>😕 Niemand passt</h3><div class="meta">
      ${alleVerfuegbaren.length ? `${alleVerfuegbaren.length} Mitarbeiter wären verfügbar, erfüllen aber die Anforderungen nicht.` : "Aktuell ist niemand verfügbar."}
      Status im Tab „Mitarbeiter" prüfen.</div></div>`;
    return;
  }

  inhalt.innerHTML = `
    <div class="ranking-kopf">Vertretung für <b>${kind.name}</b><br>🏫 ${kind.schule.name}<br>🕐 ${kind.betreuungszeit}</div>
    ${anfHinweis}
    <p class="laden">⏳ Berechne Fahrzeiten (${passende.length} passende Mitarbeiter)…</p>`;

  // Fahrzeiten ermitteln (OSRM = kostenlos/OpenStreetMap; sonst Offline-Schätzung)
  const autos = passende.filter(m => m.verkehrsmittel === "auto");
  let osrm = {};
  let osrmFehler = false;
  if (autos.length) {
    try { osrm = await osrmFahrzeiten(kind.schule, autos); }
    catch (e) { osrmFehler = true; }
  }

  const eintraege = passende.map(m => {
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
      ${aussortiert ? `<br><small>👥 ${aussortiert} verfügbare(r) Mitarbeiter erfüllt/erfüllen die Anforderungen nicht und werden nicht angezeigt.</small>` : ""}
      ${osrmFehler ? '<br><small>⚠️ Routendienst offline – Auto-Zeiten sind Offline-Schätzungen (Luftlinie).</small>' : ""}
    </div>
    ${anfHinweis}
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
             href="${whatsappAnfrageLink(e.m, kind, dauerText)}">💬 anfragen</a>
          <button class="aktion aktion-primaer" onclick="vertretungZuweisen('${e.m.id}','${kind.id}')">✅ zuweisen</button>
          <a class="aktion aktion-sekundaer" target="_blank" rel="noopener"
             href="${gmapsLink(e.m, kind)}">🗺️ ${e.m.verkehrsmittel === "auto" ? "Route" : "ÖPNV-Verbindung"}</a>
        </div>
      </div>`;
    }).join("")}
    <p class="tab-hint">Antippen zeigt die Anfahrt auf der Karte. „Zuweisen" schließt den Fall, setzt den Mitarbeiter auf „im Einsatz" und schreibt den Tagesbericht. ÖPNV-Zeiten sind Schätzwerte – der Verbindungs-Link öffnet die echte Fahrplanauskunft.</p>`;
};

window.vertretungZuweisen = function (mId, kId) {
  const m = mitarbeiterMitId(mId);
  const k = kindMitId(kId);
  if (!confirm(`${m.name} als Vertretung für ${k.name} (${k.schule.name}) eintragen?`)) return;
  state.mitarbeiterStatus[mId] = "im_einsatz";
  state.vertretungBenoetigt[kId] = false;
  state.gruende[kId] = "";
  logEintrag("vertretung", `✅ ${m.name} übernimmt die Vertretung für ${k.name} (${k.schule.name})`);
  rankingSchliessen();
  allesNeuZeichnen();
};

window.zeigeRouteKlick = function (mId, kId) {
  zeigeRoute(mitarbeiterMitId(mId), kindMitId(kId));
};

function rankingSchliessen() {
  document.getElementById("ranking-panel").classList.add("hidden");
  document.getElementById("faelle-liste").classList.remove("hidden");
  routenEbene.clearLayers();
}
document.getElementById("ranking-back").addEventListener("click", rankingSchliessen);

// ---------- UI: Mitarbeiter ----------
const statusReihenfolge = ["verfuegbar", "krank", "im_einsatz"];

function zeichneMitarbeiter() {
  const container = document.getElementById("mitarbeiter-liste");
  const sortiert = [...MITARBEITER].sort((a, b) =>
    statusReihenfolge.indexOf(statusVon(a)) - statusReihenfolge.indexOf(statusVon(b)) ||
    a.name.localeCompare(b.name));
  container.innerHTML = sortiert.map(m => {
    const betreut = kinderVon(m);
    return `<div class="card">
      <h3>${m.name}
        <span class="pill pill-${statusVon(m)} pill-klick" title="Status ändern"
              onclick="statusWechseln('${m.id}')">${statusText[statusVon(m)]}</span>
        <span class="pill pill-modus">${modusText[m.verkehrsmittel]}</span>
      </h3>
      <div class="meta">📍 ${m.wohnort.adresse} · 📞 ${m.telefon}<br>
        🎒 Stammkind(er): ${betreut.length ? betreut.map(k => `${k.name} (${k.schule.name})`).join(", ") : "– (Springer)"}<br>
        🎓 ${m.qualifikation}</div>
    </div>`;
  }).join("");
}

// Statuswechsel: Krankmeldung erzeugt AUTOMATISCH einen Vertretungsfall
// für die Stammkinder des Mitarbeiters und schreibt das Protokoll.
window.statusWechseln = function (mId) {
  const m = mitarbeiterMitId(mId);
  const alt = state.mitarbeiterStatus[mId];
  const neu = statusReihenfolge[(statusReihenfolge.indexOf(alt) + 1) % statusReihenfolge.length];
  state.mitarbeiterStatus[mId] = neu;

  if (neu === "krank") {
    const betroffene = kinderVon(m);
    betroffene.forEach(k => {
      if (!brauchtVertretung(k)) {
        state.vertretungBenoetigt[k.id] = true;
        state.gruende[k.id] = `Stammkraft ${m.name} krankgemeldet`;
      }
    });
    const zusatz = betroffene.length
      ? ` → ${betroffene.map(k => k.name).join(", ")} braucht Vertretung` +
        (betroffene.some(k => k.anforderungen?.keineVertretung) ? " (Achtung: keine Vertretung gewünscht!)" : "") +
        (betroffene.some(k => k.anforderungen?.geschlecht) ? " (Anforderung ans Geschlecht beachten!)" : "")
      : "";
    logEintrag("krankmeldung", `🤒 ${m.name} hat sich krankgemeldet${zusatz}`);
    if (betroffene.length) {
      allesNeuZeichnen();
      document.querySelector('.tab[data-tab="faelle"]').click();
      return;
    }
  } else if (alt === "krank" && neu === "verfuegbar") {
    logEintrag("info", `💪 ${m.name} wieder gesund/verfügbar`);
  } else if (alt === "im_einsatz" && neu === "verfuegbar") {
    logEintrag("info", `ℹ️ Einsatz beendet – ${m.name} wieder verfügbar`);
  }
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Kinder ----------
function zeichneKinder() {
  const container = document.getElementById("kinder-liste");
  container.innerHTML = KINDER.map(k => {
    const stamm = mitarbeiterMitId(k.stammkraft);
    const offen = brauchtVertretung(k);
    return `<div class="card ${offen ? "fall-alarm" : ""}">
      <h3>${k.name} <span class="meta">· ${k.alter} J. · ${k.klasse}</span>
        ${offen ? '<span class="pill pill-krank">Vertretung offen</span>' : ""}
        ${anforderungsBadges(k)}</h3>
      <div class="meta">🏫 ${k.schule.name}<br>👤 Stammkraft: ${stamm ? `${stamm.name} (${statusText[statusVon(stamm)]})` : "–"}</div>
      <div class="card-actions">
        <button class="aktion aktion-primaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
        ${offen
          ? `<button class="aktion aktion-sekundaer" onclick="fallSchliessen('${k.id}', false)">✅ Fall schließen</button>`
          : `<button class="aktion aktion-rot" onclick="bedarfMelden('${k.id}')">🚨 Vertretung melden</button>`}
      </div>
    </div>`;
  }).join("");
}

window.bedarfMelden = function (kindId) {
  const k = kindMitId(kindId);
  const grund = prompt("Grund für den Vertretungsbedarf (z. B. „Stammkraft krankgemeldet“):", "Stammkraft krankgemeldet");
  if (grund === null) return;
  state.vertretungBenoetigt[kindId] = true;
  state.gruende[kindId] = grund || "Vertretung benötigt";
  logEintrag("krankmeldung", `🚨 Vertretungsbedarf gemeldet für ${k.name}: ${grund || "ohne Angabe"}`);
  allesNeuZeichnen();
  document.querySelector('.tab[data-tab="faelle"]').click();
};

// ---------- UI: Tagesbericht ----------
function berichtText(datum, eintraege) {
  return [
    `📊 *Tagesbericht Vertretung ${datumDE(datum)}*`,
    ``,
    ...eintraege.map(e => `${e.zeit} Uhr – ${e.text}`)
  ].join("\n");
}

function zeichneBericht() {
  const container = document.getElementById("bericht-liste");
  const nachDatum = {};
  state.protokoll.forEach(e => (nachDatum[e.datum] = nachDatum[e.datum] || []).push(e));
  const daten = Object.keys(nachDatum).sort().reverse();

  if (!daten.length) {
    container.innerHTML = `<div class="card"><div class="meta">Noch keine Einträge. Krankmeldungen und Zuweisungen landen automatisch hier.</div></div>`;
    return;
  }

  container.innerHTML = daten.map(datum => {
    const eintraege = [...nachDatum[datum]].sort((a, b) => a.zeit.localeCompare(b.zeit));
    const krank = eintraege.filter(e => e.typ === "krankmeldung").length;
    const vertreten = eintraege.filter(e => e.typ === "vertretung").length;
    return `<div class="card">
      <h3>📅 ${datumDE(datum)} ${datum === heuteISO() ? '<span class="pill pill-modus">heute</span>' : ""}</h3>
      <div class="meta">🤒 ${krank} Krankmeldung(en) · ✅ ${vertreten} Vertretung(en) zugewiesen</div>
      <ul class="bericht-eintraege">
        ${eintraege.map(e => `<li><span class="bericht-zeit">${e.zeit}</span> ${e.text}</li>`).join("")}
      </ul>
      <div class="card-actions">
        <a class="aktion aktion-whatsapp" target="_blank" rel="noopener"
           href="https://wa.me/?text=${encodeURIComponent(berichtText(datum, eintraege))}">💬 Bericht per WhatsApp teilen</a>
      </div>
    </div>`;
  }).join("");
}

// ---------- UI: Steckbrief-Modal ----------
const modalOverlay = document.getElementById("modal-overlay");
const modal = document.getElementById("modal");

window.oeffneSteckbrief = function (kindId) {
  const k = kindMitId(kindId);
  const stamm = mitarbeiterMitId(k.stammkraft);
  const anf = anforderungsText(k);
  modal.innerHTML = `
    <h2>📋 Steckbrief: ${k.name}</h2>
    <div class="untertitel">${k.alter} Jahre · Klasse ${k.klasse}</div>
    <div class="steckbrief-feld"><label>Schule</label><div>${k.schule.name}<br>${k.schule.adresse}</div></div>
    <div class="steckbrief-feld"><label>Betreuungszeit</label><div>${k.betreuungszeit}</div></div>
    <div class="steckbrief-feld"><label>Diagnose</label><div>${k.diagnose}</div></div>
    <div class="steckbrief-feld"><label>Wichtig zu beachten</label>
      <div class="steckbrief-wichtig">⚠️ ${k.hinweise}</div></div>
    ${anf ? `<div class="steckbrief-feld"><label>Anforderungen an die Vertretung</label>
      <div class="steckbrief-wichtig">👥 ${anf}</div></div>` : ""}
    <div class="steckbrief-feld"><label>Notfallkontakt</label><div>${k.notfallkontakt}</div></div>
    <div class="steckbrief-feld"><label>Stammkraft</label><div>${stamm ? `${stamm.name} (${stamm.telefon}) – aktuell ${statusText[statusVon(stamm)]}` : "–"}</div></div>
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
  zeichneBericht();
  zeichneMarker();
}
allesNeuZeichnen();
