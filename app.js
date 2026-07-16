// =====================================================================
// Vertretungsplan Schulbegleitung – App-Logik (Prototyp)
//
// Karte: Leaflet (lokal) + OpenStreetMap-Kacheln
// Auto-Routen: OSRM (OpenStreetMap-basiert, kostenlos, kein API-Key) –
//   fällt der Dienst aus, rechnet die App OFFLINE mit Luftlinie weiter.
// ÖPNV: Offline-Schätzung + Deep-Link zur echten Verbindungsauskunft.
//
// Status (Mitarbeiter) und Vertretungsbedarf (Kinder) sind ZEITRAUM-
// basiert (von–bis statt einem einfachen Ja/Nein-Schalter):
//  - Ein Mitarbeiter kann "krank von 09.07. bis 12.07." hinterlegt werden
//    und springt danach automatisch auf seinen Grundstatus zurück
//    (kein tägliches Nachpflegen nötig).
//  - Ein Vertretungsfall für ein Kind ist ein Zeitraum (Ausfallperiode).
//    Eine Zuweisung deckt nur die Tage ab, für die sie gilt – ist nur
//    EIN Tag zugewiesen, taucht der Fall am nächsten Tag automatisch
//    wieder als offen auf. Zuweisungen können auch für die Zukunft
//    im Voraus hinterlegt werden.
//
// Alle Änderungen landen im localStorage – im späteren Produktivbetrieb
// ersetzt die IT das durch Server + Login.
// =====================================================================

const DEMO_CODE = "lara2026";
const STORAGE_KEY = "vertretungsplan-demo-v5";

// ---------- Datumshilfen ----------
// WICHTIG: "heute" bewusst als LOKALES Kalenderdatum (nicht UTC) – sonst
// weicht "heute" je nach Zeitzone der Nutzerin vom tatsächlichen Tag ab.
function heuteISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function jetztZeit() { return new Date().toTimeString().slice(0, 5); }
// Rechnet ausschließlich mit Date.UTC/getUTCDate – das ist zeitzonen- und
// DST-sicher. Eine frühere Version mischte lokale Zeit (new Date(iso+"T00:00:00"))
// mit UTC-Ausgabe (toISOString()): in Zeitzonen mit positivem UTC-Versatz
// (z. B. Deutschland, UTC+1/+2) gab addTage(datum, 1) dadurch dasselbe Datum
// zurück statt des nächsten Tages – das ließ die Tage-Schleife in
// offeneTageInPeriode() endlos laufen und den Browser einfrieren.
function addTage(iso, n) {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function datumDE(iso) {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}
// prüft, ob "datum" im Zeitraum [von, bis] liegt – bis === null/"" bedeutet "bis auf Weiteres"
function imZeitraum(datum, von, bis) {
  return datum >= von && (!bis || datum <= bis);
}
function neueId() { return Math.random().toString(36).slice(2, 10); }

// Am Wochenende wird keine Schulbegleitung benötigt – Samstag/Sonntag zählen
// nirgends als "offener Tag" und erzeugen keine Vertretungsfälle.
function istWochenende(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  const tag = new Date(Date.UTC(j, m - 1, t)).getUTCDay(); // 0=So … 6=Sa
  return tag === 0 || tag === 6;
}
function naechsterWerktag(iso) {
  let d = iso;
  while (istWochenende(d)) d = addTage(d, 1);
  return d;
}
// Prüft, ob innerhalb [von, bis] mindestens ein Wochenendtag liegt – für
// Hinweistexte, damit sichtbar ist, dass Wochenenden bereits automatisch
// aus der Vertretungspflicht herausfallen (nicht nur "unsichtbar" im Code).
function enthaeltWochenende(von, bis) {
  const ende = bis || addTage(von, 6);
  for (let d = von; d <= ende; d = addTage(d, 1)) {
    if (istWochenende(d)) return true;
  }
  return false;
}
function montagDerWoche(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  const jsTag = new Date(Date.UTC(j, m - 1, t)).getUTCDay(); // 0=So … 6=Sa
  const abstandZuMontag = (jsTag + 6) % 7; // Mo=0, Di=1 … So=6
  return addTage(iso, -abstandZuMontag);
}

// ---------- Zustand (Beispieldaten + lokale Änderungen) ----------
let state = ladeZustand();

function ladeZustand() {
  const heute = heuteISO();
  const basis = {
    mitarbeiterTyp: Object.fromEntries(MITARBEITER.map(m => [m.id, m.typ])),
    statusPerioden: Object.fromEntries(MITARBEITER.map(m => [m.id, []])),
    ausfaelle: Object.fromEntries(KINDER.map(k => [k.id, []])),
    // Separat von "ausfaelle": hier ist das KIND selbst krank/abwesend
    // (keine Vertretung nötig, aber die Stammkraft wird frei – wichtig für
    // die Stundenabrechnung, die über die Kinder läuft).
    kindAbwesenheiten: Object.fromEntries(KINDER.map(k => [k.id, []])),
    protokoll: [...BEISPIEL_PROTOKOLL]
  };

  // Beispiel-Ausgangslage: 3 Mitarbeiter sind bereits krankgemeldet
  // (mit Enddatum – zeigt die automatische Rückkehr zum Grundstatus).
  basis.statusPerioden.m1 = [{ id: "seed-m1", status: "krank", von: heute, bis: addTage(heute, 2), grund: "Beispiel-Krankmeldung" }];
  basis.statusPerioden.m3 = [{ id: "seed-m3", status: "krank", von: heute, bis: addTage(heute, 4), grund: "Beispiel-Krankmeldung (bis Fr.)" }];
  basis.statusPerioden.m7 = [{ id: "seed-m7", status: "krank", von: heute, bis: heute, grund: "Beispiel-Krankmeldung" }];

  // Passende Ausfallperioden für deren Stammkinder
  basis.ausfaelle.k3 = [{ id: "seed-k3", von: heute, bis: addTage(heute, 2), grund: "Stammkraft Sabine Krüger krankgemeldet", zuweisungen: [] }];
  basis.ausfaelle.k1 = [{ id: "seed-k1", von: heute, bis: addTage(heute, 4), grund: "Stammkraft Melanie Voss krankgemeldet (bis Fr.)", zuweisungen: [] }];
  basis.ausfaelle.k4 = [{ id: "seed-k4", von: heute, bis: heute, grund: "Stammkraft Marco Lehmann krankgemeldet", zuweisungen: [] }];

  try {
    // In der Windows-Desktop-App (Electron) liegen die Daten in einer
    // echten lokalen Datei statt im Browser-Speicher – überlebt so auch
    // das Löschen des Browser-Caches. window.electronAPI existiert nur
    // dort (per preload.js bereitgestellt); die Online-Version läuft
    // unverändert über localStorage weiter.
    const gespeichertRoh = window.electronAPI ? window.electronAPI.ladeDaten() : localStorage.getItem(STORAGE_KEY);
    const gespeichert = JSON.parse(gespeichertRoh);
    if (gespeichert) {
      return {
        mitarbeiterTyp: { ...basis.mitarbeiterTyp, ...gespeichert.mitarbeiterTyp },
        statusPerioden: { ...basis.statusPerioden, ...gespeichert.statusPerioden },
        ausfaelle: { ...basis.ausfaelle, ...gespeichert.ausfaelle },
        kindAbwesenheiten: { ...basis.kindAbwesenheiten, ...gespeichert.kindAbwesenheiten },
        protokoll: Array.isArray(gespeichert.protokoll) ? gespeichert.protokoll : basis.protokoll
      };
    }
  } catch (e) { /* defekter Speicher → Basisdaten */ }
  return basis;
}

function speichereZustand() {
  // Ohne try/catch würde ein blockierter localStorage (privater Modus,
  // eingebettete Browser, strenge Datenschutz-Einstellungen) jede
  // Statusänderung/Zuweisung mit einem Fehler abbrechen. Im Fehlerfall
  // funktioniert die App weiter, nur bleiben Änderungen nicht über einen
  // Neuladen hinweg gespeichert.
  const json = JSON.stringify(state);
  try {
    if (window.electronAPI) window.electronAPI.speichereDaten(json);
    else localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn("Konnte Zustand nicht speichern:", e);
  }
}

const kinderVon = m => KINDER.filter(k => k.stammkraft === m.id);
const mitarbeiterMitId = id => MITARBEITER.find(m => m.id === id);
const kindMitId = id => KINDER.find(k => k.id === id);

// ---------- Status (zeitraumbasiert) ----------
function aktuelleStatusPeriode(m, datum = heuteISO()) {
  const perioden = state.statusPerioden[m.id] || [];
  for (let i = perioden.length - 1; i >= 0; i--) {
    if (imZeitraum(datum, perioden[i].von, perioden[i].bis)) return perioden[i];
  }
  return null;
}
function grundstatus(m) {
  return state.mitarbeiterTyp[m.id] === "springer" ? "verfuegbar" : "im_einsatz";
}
function statusVon(m, datum = heuteISO()) {
  const p = aktuelleStatusPeriode(m, datum);
  return p ? p.status : grundstatus(m);
}

// ---------- Vertretungsfälle (zeitraumbasiert) ----------
function periodeAbgedeckt(periode, datum) {
  return periode.zuweisungen.some(z => imZeitraum(datum, z.von, z.bis));
}
function offenePeriodeAm(kindId, datum = heuteISO()) {
  if (istWochenende(datum)) return undefined; // am Wochenende nie ein offener Fall
  return (state.ausfaelle[kindId] || []).find(p => imZeitraum(datum, p.von, p.bis) && !periodeAbgedeckt(p, datum));
}
// Liste noch offener (Werk-)Tage einer Periode (Horizont: 14 Tage bei offenem Ende)
function offeneTageInPeriode(periode) {
  const heute = heuteISO();
  const start = periode.von > heute ? periode.von : heute;
  const ende = periode.bis || addTage(heute, 13);
  const tage = [];
  for (let d = start; d <= ende; d = addTage(d, 1)) {
    if (istWochenende(d)) continue;
    if (!periodeAbgedeckt(periode, d)) tage.push(d);
  }
  return tage;
}

// ---------- Protokoll ----------
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
    // sessionStorage kann in privaten/eingebetteten Browsern (z. B. In-App-
    // Browser von WhatsApp/Instagram, strenge Datenschutz-Einstellungen)
    // einen Fehler werfen. Ohne try/catch würde das den Login blockieren,
    // obwohl der Code richtig war – daher hier bewusst robust.
    try { sessionStorage.setItem("vp-login", "ok"); } catch (e) { /* kein Speicherzugriff möglich, egal */ }
    loginOverlay.classList.add("hidden");
    setTimeout(() => map.invalidateSize(), 100);
  } else {
    loginInput.classList.add("login-error");
    setTimeout(() => loginInput.classList.remove("login-error"), 400);
  }
}
loginBtn.addEventListener("click", pruefeLogin);
loginInput.addEventListener("keydown", e => { if (e.key === "Enter") pruefeLogin(); });
try {
  if (sessionStorage.getItem("vp-login") === "ok") loginOverlay.classList.add("hidden");
} catch (e) { /* kein Speicherzugriff möglich – Login-Maske einfach anzeigen */ }

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
  const heute = heuteISO();

  KINDER.forEach(k => {
    const alarm = !!offenePeriodeAm(k.id, heute);
    L.marker([k.schule.lat, k.schule.lng], { icon: schulIcon(alarm) })
      .bindPopup(`<b>${k.name}</b> (${k.klasse})<br>🏫 ${k.schule.name}<br>${alarm ? "🚨 <b>Vertretung heute benötigt!</b><br>" : ""}
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

function whatsappAnfrageLink(m, kind, dauerText, von, bis) {
  const zeitraum = von === bis ? `am ${datumDE(von)}` : `von ${datumDE(von)} bis ${datumDE(bis)}`;
  const text = [
    `Hallo ${m.name.split(" ")[0]}, kannst du ${zeitraum} die Vertretung für *${kind.name}* übernehmen?`,
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

// ---------- Suche (Mitarbeiter- und Kinder-Tab) ----------
function entsprichtSuche(suchtext, ...felder) {
  const q = (suchtext || "").trim().toLowerCase();
  if (!q) return true;
  return felder.some(f => (f || "").toLowerCase().includes(q));
}

// ---------- Einsatz-Historie & Auswertungen ----------
// Wertet aus, wie viele Stunden pro Tag ein Kind betreut wird und an
// welchen Wochentagen (aus dem Freitext "Mo–Fr 07:45–13:30 Uhr" o. Ä.),
// damit Stunden/Ausfallquote nicht pauschal, sondern kindgenau berechnet werden.
const WOCHENTAGE_MO_SO = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]; // Index 0=Mo … 6=So
function jsTagZuMoIndex(jsTag) { return (jsTag + 6) % 7; } // JS: 0=So..6=Sa → 0=Mo..6=So

function parseBetreuungszeit(text) {
  const zeitMatch = text.match(/(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})/);
  let stundenProTag = 5;
  if (zeitMatch) {
    const [h1, m1, h2, m2] = zeitMatch.slice(1).map(Number);
    stundenProTag = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  }
  let moIndizes = new Set([0, 1, 2, 3, 4]); // Standard Mo–Fr
  const tageMatch = text.match(/(Mo|Di|Mi|Do|Fr|Sa|So)\s*[–-]\s*(Mo|Di|Mi|Do|Fr|Sa|So)/);
  if (tageMatch) {
    const start = WOCHENTAGE_MO_SO.indexOf(tageMatch[1]);
    const ende = WOCHENTAGE_MO_SO.indexOf(tageMatch[2]);
    moIndizes = new Set();
    for (let i = start; ; i = (i + 1) % 7) {
      moIndizes.add(i);
      if (i === ende) break;
    }
  }
  return { stundenProTag, moIndizes };
}
const BETREUUNG_INFO = Object.fromEntries(KINDER.map(k => [k.id, parseBetreuungszeit(k.betreuungszeit)]));

function tagPasstZuBetreuung(iso, info) {
  if (istWochenende(iso)) return false;
  const [j, m, t] = iso.split("-").map(Number);
  const jsTag = new Date(Date.UTC(j, m - 1, t)).getUTCDay();
  return info.moIndizes.has(jsTagZuMoIndex(jsTag));
}

// Beginn der Zeitrechnung für "seit jeher"-Auswertungen (weit genug in der
// Vergangenheit, da alle Beispieldaten deutlich später liegen).
const SEIT_JEHER = "2000-01-01";
const FERNE_ZUKUNFT = "9999-12-31";

// Vertretungsstunden je Mitarbeiter – zählt nur bereits erfolgte (echte)
// Zuweisungen bis einschließlich heute, keine nur geplanten Zukunftstage.
function berechneVertretungsstunden() {
  return berechneVertretungsstundenZeitraum(SEIT_JEHER, FERNE_ZUKUNFT);
}

// Ausfallquote: Anteil der (bereits vergangenen/heutigen) Betreuungstage mit
// Ausfallperiode, an denen KEINE echte Vertretung stattfand.
function berechneAusfallquote() {
  return berechneAusfallquoteZeitraum(SEIT_JEHER, FERNE_ZUKUNFT);
}

// Heatmap: Anzahl gleichzeitiger Ausfälle pro Werktag, letzte N Wochen.
function berechneHeatmap(wochenAnzahl = 8) {
  const heute = heuteISO();
  // Letzte Woche = die AKTUELLE Woche (enthält "heute"), davor (wochenAnzahl-1)
  // weitere volle Wochen – so ist "heute" garantiert in der Heatmap sichtbar.
  const start = addTage(montagDerWoche(heute), -(wochenAnzahl - 1) * 7);

  const zaehlerProTag = {};
  KINDER.forEach(k => {
    (state.ausfaelle[k.id] || []).forEach(periode => {
      const periodeEnde = periode.bis || heute;
      const von = periode.von > start ? periode.von : start;
      const bis = periodeEnde < heute ? periodeEnde : heute;
      if (von > bis) return;
      for (let d = von; d <= bis; d = addTage(d, 1)) {
        if (istWochenende(d)) continue;
        zaehlerProTag[d] = (zaehlerProTag[d] || 0) + 1;
      }
    });
  });

  const wochen = [];
  let d = start;
  for (let w = 0; w < wochenAnzahl; w++) {
    const tage = [];
    for (let i = 0; i < 5; i++) {
      tage.push({ datum: d, anzahl: zaehlerProTag[d] || 0 });
      d = addTage(d, 1);
    }
    d = addTage(d, 2); // Sa + So überspringen
    wochen.push(tage);
  }
  return wochen;
}

// Wie berechneVertretungsstunden(), aber auf einen Zeitraum begrenzt (z. B.
// einen Monat) – für die Monatsübersicht im Excel-Export.
function berechneVertretungsstundenZeitraum(zeitraumVon, zeitraumBis) {
  const heute = heuteISO();
  const stunden = {};
  KINDER.forEach(k => {
    const info = BETREUUNG_INFO[k.id];
    (state.ausfaelle[k.id] || []).forEach(periode => {
      periode.zuweisungen.forEach(z => {
        if (!z.mitarbeiterId) return;
        const von = z.von > zeitraumVon ? z.von : zeitraumVon;
        const bisRoh = z.bis && z.bis < zeitraumBis ? z.bis : zeitraumBis;
        const bis = bisRoh < heute ? bisRoh : heute;
        if (von > bis) return;
        for (let d = von; d <= bis; d = addTage(d, 1)) {
          if (tagPasstZuBetreuung(d, info)) {
            stunden[z.mitarbeiterId] = (stunden[z.mitarbeiterId] || 0) + info.stundenProTag;
          }
        }
      });
    });
  });
  return stunden;
}

// Wie berechneAusfallquote(), aber auf einen Zeitraum begrenzt.
function berechneAusfallquoteZeitraum(zeitraumVon, zeitraumBis) {
  const heute = heuteISO();
  const proKind = {};
  let gesamtTage = 0, gesamtOhne = 0;
  KINDER.forEach(k => {
    const info = BETREUUNG_INFO[k.id];
    let tage = 0, ohne = 0;
    (state.ausfaelle[k.id] || []).forEach(periode => {
      const von = periode.von > zeitraumVon ? periode.von : zeitraumVon;
      const periodeEnde = periode.bis || heute;
      const bisRoh = periodeEnde < zeitraumBis ? periodeEnde : zeitraumBis;
      const bis = bisRoh < heute ? bisRoh : heute;
      if (von > bis) return;
      for (let d = von; d <= bis; d = addTage(d, 1)) {
        if (!tagPasstZuBetreuung(d, info)) continue;
        tage++;
        const echtAbgedeckt = periode.zuweisungen.some(z => z.mitarbeiterId && imZeitraum(d, z.von, z.bis));
        if (!echtAbgedeckt) ohne++;
      }
    });
    proKind[k.id] = { tage, ohne };
    gesamtTage += tage; gesamtOhne += ohne;
  });
  return { proKind, gesamt: { tage: gesamtTage, ohne: gesamtOhne } };
}

// Kind-Abwesenheiten, die sich mit [zeitraumVon, zeitraumBis] überschneiden –
// inkl. betroffener Stunden der Stammkraft (für die Stundenkonto-Prüfung).
function kindAbwesenheitenImZeitraum(zeitraumVon, zeitraumBis) {
  const ergebnisse = [];
  KINDER.forEach(k => {
    const info = BETREUUNG_INFO[k.id];
    const stamm = mitarbeiterMitId(k.stammkraft);
    (state.kindAbwesenheiten[k.id] || []).forEach(a => {
      const aBis = a.bis || a.von;
      if (aBis < zeitraumVon || a.von > zeitraumBis) return;
      const ueberlappVon = a.von > zeitraumVon ? a.von : zeitraumVon;
      const ueberlappBis = aBis < zeitraumBis ? aBis : zeitraumBis;
      let stunden = 0;
      for (let d = ueberlappVon; d <= ueberlappBis; d = addTage(d, 1)) {
        if (tagPasstZuBetreuung(d, info)) stunden += info.stundenProTag;
      }
      ergebnisse.push({
        kindName: k.name, stammName: stamm ? stamm.name : "–",
        von: a.von, bis: aBis, grund: a.grund, stunden: Number(stunden.toFixed(1))
      });
    });
  });
  return ergebnisse;
}

// ---------- UI: Kopfzeile ----------
function zeichneStats() {
  const heute = heuteISO();
  const faelle = KINDER.filter(k => offenePeriodeAm(k.id, heute)).length;
  const verf = MITARBEITER.filter(m => statusVon(m) === "verfuegbar").length;
  const krank = MITARBEITER.filter(m => statusVon(m) === "krank").length;
  document.getElementById("header-stats").innerHTML = `
    <div class="stat"><b>${faelle}</b>offene Fälle heute</div>
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

// ---------- UI: Vertretungsfälle (heute offen) ----------
function zeichneFaelle() {
  const container = document.getElementById("faelle-liste");
  const heute = heuteISO();

  if (istWochenende(heute)) {
    container.innerHTML = `<div class="card"><h3>🗓️ Wochenende</h3>
      <div class="meta">Am Wochenende wird keine Schulbegleitung benötigt – hier entstehen keine Vertretungsfälle. Nächster Werktag: ${datumDE(naechsterWerktag(heute))}.</div></div>`;
    return;
  }

  const faelle = KINDER
    .map(k => ({ k, periode: offenePeriodeAm(k.id, heute) }))
    .filter(f => f.periode);

  if (!faelle.length) {
    container.innerHTML = `<div class="card"><h3>✅ Keine offenen Fälle heute</h3>
      <div class="meta">Meldet sich ein Mitarbeiter mit festem Kind krank (Tab „Mitarbeiter"), entsteht hier automatisch ein Fall für den betroffenen Zeitraum – ohne tägliches Nachpflegen. Wochenenden werden dabei automatisch übersprungen.</div></div>`;
    return;
  }

  container.innerHTML = faelle.map(({ k, periode }) => {
    const stamm = mitarbeiterMitId(k.stammkraft);
    const keine = k.anforderungen?.keineVertretung;
    const zeitraumText = periode.bis
      ? (periode.von === periode.bis ? `nur heute (${datumDE(periode.von)})` : `${datumDE(periode.von)} – ${datumDE(periode.bis)}`)
      : `ab ${datumDE(periode.von)} (bis auf Weiteres)`;
    const weBemerkung = enthaeltWochenende(periode.von, periode.bis) ? " (Wochenende ausgenommen)" : "";
    const weitereOffeneTage = offeneTageInPeriode(periode).filter(d => d !== heute);

    return `<div class="card fall-alarm">
      <h3>🚨 ${k.name} <span class="meta">· ${k.klasse}</span> ${anforderungsBadges(k)}</h3>
      <div class="meta">🏫 ${k.schule.name}<br>🕐 ${k.betreuungszeit}<br>👤 Stammkraft: ${stamm ? stamm.name : "–"}</div>
      <div class="grund">${periode.grund} · Zeitraum: ${zeitraumText}${weBemerkung}</div>
      ${weitereOffeneTage.length ? `<div class="meta">📅 Danach auch noch offen: ${weitereOffeneTage.slice(0, 5).map(datumDE).join(", ")}${weitereOffeneTage.length > 5 ? " …" : ""} – kann direkt mit vorgeplant werden.</div>` : ""}
      ${keine ? `<div class="anforderung-warnung">🚫 ${k.anforderungen.hinweis || "Es wird keine fremde Vertretung gewünscht."}</div>` : ""}
      <div class="card-actions">
        ${keine
          ? `<button class="aktion aktion-sekundaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
             <button class="aktion aktion-sekundaer" onclick="heuteOhneVertretung('${k.id}','${periode.id}')">✅ heute geklärt</button>`
          : `<button class="aktion aktion-primaer" onclick="sucheVertretung('${k.id}','${periode.id}')">🔍 Vertretung suchen</button>
             <button class="aktion aktion-sekundaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
             <button class="aktion aktion-sekundaer" onclick="heuteOhneVertretung('${k.id}','${periode.id}')">✅ heute ohne Vertretung geklärt</button>`}
      </div>
    </div>`;
  }).join("");
}

// Klärt NUR den heutigen Tag (z. B. Kind bleibt zu Hause / Eltern holen ab) –
// taucht am nächsten Tag automatisch wieder als offen auf, falls die
// Ausfallperiode weiterläuft. Genau das vom Träger gewünschte Verhalten.
window.heuteOhneVertretung = function (kindId, periodeId) {
  const periode = (state.ausfaelle[kindId] || []).find(p => p.id === periodeId);
  if (!periode) return;
  const heute = heuteISO();
  periode.zuweisungen.push({ id: neueId(), mitarbeiterId: null, von: heute, bis: heute });
  logEintrag("info", `ℹ️ ${kindMitId(kindId).name}: heute (${datumDE(heute)}) ohne Vertretung geklärt`);
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Ranking / Vertretung suchen (mit Zeitraum) ----------
window.sucheVertretung = async function (kindId, periodeId) {
  const kind = kindMitId(kindId);
  const periode = (state.ausfaelle[kindId] || []).find(p => p.id === periodeId);
  if (!periode) return;

  document.getElementById("faelle-liste").classList.add("hidden");
  document.getElementById("ranking-panel").classList.remove("hidden");
  map.setView([kind.schule.lat, kind.schule.lng], 12);

  const heute = heuteISO();
  const vonDefault = naechsterWerktag(periode.von > heute ? periode.von : heute);
  const bisDefault = periode.bis && periode.bis >= vonDefault ? periode.bis : vonDefault;
  const minAttr = ` min="${periode.von}"`;
  const maxAttr = periode.bis ? ` max="${periode.bis}"` : "";

  const kopfHtml = `
    <div class="ranking-kopf">Vertretung für <b>${kind.name}</b><br>🏫 ${kind.schule.name}<br>🕐 ${kind.betreuungszeit}<br>
      <small>Ausfallzeitraum: ${datumDE(periode.von)}${periode.bis ? " – " + datumDE(periode.bis) : " (bis auf Weiteres)"}</small></div>
    <div class="zeitraum-waehler">
      📅 Vertretung von <input type="date" id="zuw-von" value="${vonDefault}"${minAttr}${maxAttr}>
      bis <input type="date" id="zuw-bis" value="${bisDefault}"${minAttr}${maxAttr}>
    </div>`;
  const anfHinweis = anforderungsText(kind) ? `<div class="anforderung-warnung">👥 Anforderung: ${anforderungsText(kind)}</div>` : "";

  const inhalt = document.getElementById("ranking-inhalt");
  inhalt.innerHTML = kopfHtml + anfHinweis + `<p class="laden">⏳ Berechne Fahrzeiten…</p>`;

  const alleVerfuegbaren = MITARBEITER.filter(m => statusVon(m, vonDefault) === "verfuegbar");
  const passende = alleVerfuegbaren.filter(m => erfuelltAnforderungen(m, kind));
  const aussortiert = alleVerfuegbaren.length - passende.length;

  if (!passende.length) {
    inhalt.innerHTML = kopfHtml + anfHinweis + `<div class="card"><h3>😕 Niemand passt</h3><div class="meta">
      ${alleVerfuegbaren.length ? `${alleVerfuegbaren.length} Mitarbeiter wären am ${datumDE(vonDefault)} verfügbar, erfüllen aber die Anforderungen nicht.` : `Am ${datumDE(vonDefault)} ist niemand verfügbar.`}
      Status im Tab „Mitarbeiter" prüfen oder Zeitraum oben anpassen.</div></div>`;
    return;
  }

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

  inhalt.innerHTML = kopfHtml + `
    ${aussortiert ? `<p class="tab-hint">👥 ${aussortiert} verfügbare(r) Mitarbeiter erfüllt/erfüllen die Anforderungen nicht und werden nicht angezeigt.</p>` : ""}
    ${osrmFehler ? '<p class="tab-hint">⚠️ Routendienst offline – Auto-Zeiten sind Offline-Schätzungen (Luftlinie).</p>' : ""}
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
             href="${whatsappAnfrageLink(e.m, kind, dauerText, vonDefault, bisDefault)}">💬 anfragen</a>
          <button class="aktion aktion-primaer" onclick="vertretungZuweisen('${e.m.id}','${kind.id}','${periode.id}')">✅ zuweisen</button>
          <a class="aktion aktion-sekundaer" target="_blank" rel="noopener"
             href="${gmapsLink(e.m, kind)}">🗺️ ${e.m.verkehrsmittel === "auto" ? "Route" : "ÖPNV-Verbindung"}</a>
        </div>
      </div>`;
    }).join("")}
    <p class="tab-hint">Antippen zeigt die Anfahrt auf der Karte. „Zuweisen" trägt die Vertretung für den oben gewählten Zeitraum ein (auch für die Zukunft vorplanbar) und schreibt den Tagesbericht. Verfügbarkeit wird für den Start-Tag geprüft.</p>`;
};

window.vertretungZuweisen = function (mId, kId, periodeId) {
  const von = document.getElementById("zuw-von").value;
  const bis = document.getElementById("zuw-bis").value;
  if (!von || !bis || bis < von) { alert("Bitte einen gültigen Zeitraum wählen (Ende darf nicht vor dem Start liegen)."); return; }

  const m = mitarbeiterMitId(mId);
  const k = kindMitId(kId);
  const zeitraumText = von === bis ? `am ${datumDE(von)}` : `${datumDE(von)} – ${datumDE(bis)}`;
  if (!confirm(`${m.name} als Vertretung für ${k.name} eintragen (${zeitraumText})?`)) return;

  const periode = (state.ausfaelle[kId] || []).find(p => p.id === periodeId);
  if (!periode) return;
  periode.zuweisungen.push({ id: neueId(), mitarbeiterId: mId, von, bis });

  // Vertreter bekommt für den Zeitraum eine eigene "im Einsatz"-Periode,
  // damit sein Kalender die Zusage widerspiegelt.
  if (!state.statusPerioden[mId]) state.statusPerioden[mId] = [];
  state.statusPerioden[mId].push({ id: neueId(), status: "im_einsatz", von, bis, grund: `Vertretung für ${k.name}` });

  logEintrag("vertretung", `✅ ${m.name} übernimmt die Vertretung für ${k.name} (${k.schule.name}) ${zeitraumText}`);
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

// ---------- UI: Mitarbeiter (Typ + zeitraumbasierter Status) ----------
const statusOptionen = ["krank", "verfuegbar", "im_einsatz"];

function zeichneMitarbeiter() {
  const container = document.getElementById("mitarbeiter-liste");
  const heute = heuteISO();
  const suchtext = document.getElementById("mitarbeiter-suche")?.value || "";
  const sortiert = MITARBEITER
    .filter(m => entsprichtSuche(
      suchtext, m.name, m.wohnort.adresse, m.qualifikation,
      kinderVon(m).map(k => k.name).join(" "),
      state.mitarbeiterTyp[m.id] === "fest" ? "fest eigenes kind" : "springer pool"
    ))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!sortiert.length) {
    container.innerHTML = `<div class="card"><div class="meta">Keine Treffer für „${suchtext}".</div></div>`;
    return;
  }

  container.innerHTML = sortiert.map(m => {
    const betreut = kinderVon(m);
    const aktuellePeriode = aktuelleStatusPeriode(m, heute);
    const aktuell = statusVon(m, heute);
    const statusAnzeige = aktuellePeriode
      ? `${statusText[aktuell]} ${aktuellePeriode.von === aktuellePeriode.bis ? `(nur ${datumDE(heute)})` : aktuellePeriode.bis ? `bis ${datumDE(aktuellePeriode.bis)}` : "(bis auf Weiteres)"}`
      : `${statusText[aktuell]} (Grundstatus)`;
    const kommendePerioden = (state.statusPerioden[m.id] || [])
      .filter(p => !p.bis || p.bis >= heute)
      .sort((a, b) => a.von.localeCompare(b.von));

    return `<div class="card">
      <h3>${m.name} <span class="pill pill-modus">${modusText[m.verkehrsmittel]}</span></h3>
      <div class="meta">📍 ${m.wohnort.adresse} · 📞 ${m.telefon}<br>
        🎒 Stammkind(er): ${betreut.length ? betreut.map(k => `${k.name} (${k.schule.name})`).join(", ") : "– (Springer/Pool)"}<br>
        🎓 ${m.qualifikation}</div>

      <div class="status-zeile">
        <label class="status-label">Typ</label>
        <select class="typ-select" onchange="mitarbeitertypSetzen('${m.id}', this.value)">
          <option value="fest" ${state.mitarbeiterTyp[m.id] === "fest" ? "selected" : ""}>Fest (eigenes Kind)</option>
          <option value="springer" ${state.mitarbeiterTyp[m.id] === "springer" ? "selected" : ""}>Springer/Pool</option>
        </select>
      </div>

      <div class="status-anzeige status-anzeige-${aktuell}">Status heute: ${statusAnzeige}</div>

      ${kommendePerioden.length ? `<div class="perioden-liste">
        ${kommendePerioden.map(p => `<span class="periode-chip periode-chip-${p.status}">
            ${statusText[p.status]}: ${datumDE(p.von)}${p.bis ? (p.von === p.bis ? "" : " – " + datumDE(p.bis)) : " (bis auf Weiteres)"}${p.status === "krank" && enthaeltWochenende(p.von, p.bis) ? " · Wochenende ausgenommen" : ""}
            <span class="periode-loeschen" onclick="statusPeriodeLoeschen('${m.id}','${p.id}')" title="löschen">✕</span>
          </span>`).join("")}
      </div>` : ""}

      <div class="status-form">
        <select id="neu-status-${m.id}">
          ${statusOptionen.map(s => `<option value="${s}">${statusText[s]}</option>`).join("")}
        </select>
        <input type="date" id="neu-von-${m.id}" value="${heute}" title="von">
        <input type="date" id="neu-bis-${m.id}" title="bis (leer = bis auf Weiteres)">
        <button class="aktion aktion-sekundaer" onclick="statusPeriodeHinzufuegen('${m.id}')">+ hinterlegen</button>
      </div>
    </div>`;
  }).join("");
}

window.mitarbeitertypSetzen = function (mId, typ) {
  state.mitarbeiterTyp[mId] = typ;
  logEintrag("info", `ℹ️ ${mitarbeiterMitId(mId).name}: Typ auf „${typ === "fest" ? "Fest" : "Springer/Pool"}" gesetzt`);
  speichereZustand();
  allesNeuZeichnen();
};

// Legt einen Status-Zeitraum an (z. B. "krank vom 09.07. bis 12.07.").
// Erzeugt bei "krank" automatisch eine Ausfallperiode für die Stammkinder
// über GENAU denselben Zeitraum – kein tägliches Nachpflegen nötig.
// "verfügbar" erzeugt bewusst KEINEN Fall (betrifft nur die eigene
// Einsatzbereitschaft, nicht das eigene Stammkind).
window.statusPeriodeHinzufuegen = function (mId) {
  const m = mitarbeiterMitId(mId);
  const status = document.getElementById(`neu-status-${mId}`).value;
  const von = document.getElementById(`neu-von-${mId}`).value || heuteISO();
  const bis = document.getElementById(`neu-bis-${mId}`).value || null;
  if (bis && bis < von) { alert("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }

  if (!state.statusPerioden[mId]) state.statusPerioden[mId] = [];
  state.statusPerioden[mId].push({ id: neueId(), status, von, bis, grund: "" });

  const heute = heuteISO();
  const zeitraumText = bis ? (von === bis ? `am ${datumDE(von)}` : `vom ${datumDE(von)} bis ${datumDE(bis)}`) : `ab ${datumDE(von)} (bis auf Weiteres)`;
  let neuerFallHeute = false;

  if (status === "krank") {
    const betroffene = kinderVon(m);
    betroffene.forEach(k => {
      if (!state.ausfaelle[k.id]) state.ausfaelle[k.id] = [];
      state.ausfaelle[k.id].push({ id: neueId(), von, bis, grund: `Stammkraft ${m.name} krankgemeldet`, zuweisungen: [] });
    });
    const zusatz = betroffene.length
      ? ` → ${betroffene.map(k => k.name).join(", ")} braucht Vertretung ${zeitraumText}` +
        (betroffene.some(k => k.anforderungen?.keineVertretung) ? " (Achtung: keine Vertretung gewünscht!)" : "") +
        (betroffene.some(k => k.anforderungen?.geschlecht) ? " (Anforderung ans Geschlecht beachten!)" : "")
      : " (kein festes Stammkind betroffen)";
    logEintrag("krankmeldung", `🤒 ${m.name} krankgemeldet ${zeitraumText}${zusatz}`);
    neuerFallHeute = betroffene.length > 0 && imZeitraum(heute, von, bis);
  } else {
    logEintrag("info", `ℹ️ ${m.name}: Status „${statusText[status]}" hinterlegt (${zeitraumText})`);
  }

  speichereZustand();
  allesNeuZeichnen();
  if (neuerFallHeute) document.querySelector('.tab[data-tab="faelle"]').click();
};

window.statusPeriodeLoeschen = function (mId, periodeId) {
  state.statusPerioden[mId] = (state.statusPerioden[mId] || []).filter(p => p.id !== periodeId);
  speichereZustand();
  allesNeuZeichnen();
};

// ---------- UI: Kinder (Steckbriefe + Ausfallperioden verwalten) ----------
function zeichneKinder() {
  const container = document.getElementById("kinder-liste");
  const heute = heuteISO();
  const suchtext = document.getElementById("kinder-suche")?.value || "";
  const gefiltert = KINDER.filter(k => {
    const stamm = mitarbeiterMitId(k.stammkraft);
    return entsprichtSuche(suchtext, k.name, k.schule.name, k.klasse, stamm ? stamm.name : "");
  });

  if (!gefiltert.length) {
    container.innerHTML = `<div class="card"><div class="meta">Keine Treffer für „${suchtext}".</div></div>`;
    return;
  }

  container.innerHTML = gefiltert.map(k => {
    const stamm = mitarbeiterMitId(k.stammkraft);
    const offenHeute = !!offenePeriodeAm(k.id, heute);
    const perioden = (state.ausfaelle[k.id] || []).filter(p => !p.bis || p.bis >= heute);
    const abwesenheiten = (state.kindAbwesenheiten[k.id] || []).filter(a => !a.bis || a.bis >= heute);

    return `<div class="card ${offenHeute ? "fall-alarm" : ""}">
      <h3>${k.name} <span class="meta">· ${k.alter} J. · ${k.klasse}</span>
        ${offenHeute ? '<span class="pill pill-krank">heute offen</span>' : ""}
        ${anforderungsBadges(k)}</h3>
      <div class="meta">🏫 ${k.schule.name}<br>👤 Stammkraft: ${stamm ? `${stamm.name} (${statusText[statusVon(stamm)]})` : "–"}</div>
      ${perioden.length ? `<div class="ausfall-liste">${perioden.map(p => zeichnePeriodeZeile(k, p)).join("")}</div>` : ""}
      ${abwesenheiten.length ? `<div class="ausfall-liste">${abwesenheiten.map(a => zeichneAbwesenheitZeile(k, a)).join("")}</div>` : ""}
      <div class="card-actions">
        <button class="aktion aktion-primaer" onclick="oeffneSteckbrief('${k.id}')">📋 Steckbrief</button>
        <button class="aktion aktion-rot" onclick="ausfallMeldenOeffnen('${k.id}')">🚨 Ausfall/Vertretung melden</button>
        <button class="aktion aktion-sekundaer" onclick="kindAbwesendMeldenOeffnen('${k.id}')">🏥 Kind krank/abwesend</button>
      </div>
    </div>`;
  }).join("");
}

function zeichnePeriodeZeile(k, p) {
  const offeneTage = offeneTageInPeriode(p);
  const zeitraum = p.bis ? (p.von === p.bis ? datumDE(p.von) : `${datumDE(p.von)} – ${datumDE(p.bis)}`) : `ab ${datumDE(p.von)} (bis auf Weiteres)`;
  const weBemerkung = enthaeltWochenende(p.von, p.bis) ? " · Wochenende ausgenommen" : "";
  const statusText2 = offeneTage.length
    ? `🔴 ${offeneTage.length} Tag(e) noch offen (${offeneTage.slice(0, 4).map(datumDE).join(", ")}${offeneTage.length > 4 ? " …" : ""})`
    : "🟢 vollständig abgedeckt";
  return `<div class="periode-zeile">
    <div>📅 ${zeitraum}${weBemerkung} · ${p.grund}<br><small>${statusText2}</small></div>
    <div class="periode-zeile-aktionen">
      ${offeneTage.length ? `<button class="aktion aktion-sekundaer" onclick="sucheVertretung('${k.id}','${p.id}')">🔍 suchen</button>` : ""}
      <button class="aktion aktion-sekundaer" onclick="periodeBeenden('${k.id}','${p.id}')" title="Zeitraum löschen">🗑</button>
    </div>
  </div>`;
}

function zeichneAbwesenheitZeile(k, a) {
  const zeitraum = a.von === a.bis ? datumDE(a.von) : `${datumDE(a.von)} – ${datumDE(a.bis)}`;
  return `<div class="periode-zeile">
    <div>🏥 ${zeitraum} · ${a.grund}<br><small>Kind abwesend – keine Betreuungsstunden, Stammkraft verfügbar</small></div>
    <div class="periode-zeile-aktionen">
      <button class="aktion aktion-sekundaer" onclick="kindAbwesenheitLoeschen('${k.id}','${a.id}')" title="löschen">🗑</button>
    </div>
  </div>`;
}

window.periodeBeenden = function (kindId, periodeId) {
  if (!confirm("Diesen Ausfall-/Vertretungszeitraum wirklich löschen?")) return;
  state.ausfaelle[kindId] = (state.ausfaelle[kindId] || []).filter(p => p.id !== periodeId);
  speichereZustand();
  allesNeuZeichnen();
};

// Manuelles Anlegen einer Ausfallperiode (z. B. wenn der Bedarf nicht über
// eine Mitarbeiter-Krankmeldung entstanden ist, sondern anders gemeldet wurde).
window.ausfallMeldenOeffnen = function (kindId) {
  const k = kindMitId(kindId);
  modal.innerHTML = `
    <h2>🚨 Ausfall/Vertretung melden</h2>
    <div class="untertitel">${k.name} · ${k.schule.name}</div>
    <div class="steckbrief-feld"><label>Von</label><div><input type="date" id="af-von" value="${heuteISO()}"></div></div>
    <div class="steckbrief-feld"><label>Bis (leer = bis auf Weiteres)</label><div><input type="date" id="af-bis"></div></div>
    <div class="steckbrief-feld"><label>Grund</label><div>
      <input type="text" id="af-grund" placeholder="z. B. Stammkraft krankgemeldet" class="text-input"></div></div>
    <div class="modal-actions">
      <button class="aktion aktion-primaer" onclick="ausfallMeldenSpeichern('${kindId}')">Speichern</button>
      <button class="aktion aktion-sekundaer" onclick="schliesseModal()">Abbrechen</button>
    </div>`;
  modalOverlay.classList.remove("hidden");
};

window.ausfallMeldenSpeichern = function (kindId) {
  const von = document.getElementById("af-von").value || heuteISO();
  const bis = document.getElementById("af-bis").value || null;
  const grund = document.getElementById("af-grund").value.trim() || "Vertretung benötigt";
  if (bis && bis < von) { alert("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }

  if (!state.ausfaelle[kindId]) state.ausfaelle[kindId] = [];
  state.ausfaelle[kindId].push({ id: neueId(), von, bis, grund, zuweisungen: [] });

  const zeitraumText = bis ? (von === bis ? `am ${datumDE(von)}` : `${datumDE(von)} – ${datumDE(bis)}`) : `ab ${datumDE(von)} (bis auf Weiteres)`;
  logEintrag("krankmeldung", `🚨 Ausfall gemeldet für ${kindMitId(kindId).name}: ${grund} (${zeitraumText})`);
  schliesseModal();
  speichereZustand();
  allesNeuZeichnen();
  if (imZeitraum(heuteISO(), von, bis)) document.querySelector('.tab[data-tab="faelle"]').click();
};

// "Kind krank/abwesend" ist bewusst GETRENNT von "Ausfall/Vertretung melden":
// Ist das Kind selbst nicht da, wird KEINE Vertretung benötigt – die
// Stammkraft wird stattdessen für den Zeitraum als "verfügbar" markiert.
// Wichtig für die Abrechnung: Die Stunden laufen über die Kinder, ein
// abwesenes Kind bedeutet für die Stammkraft keine abrechenbaren Stunden
// an diesem Kind – deshalb wird das explizit im Protokoll/Bericht vermerkt.
window.kindAbwesendMeldenOeffnen = function (kindId) {
  const k = kindMitId(kindId);
  const stamm = mitarbeiterMitId(k.stammkraft);
  modal.innerHTML = `
    <h2>🏥 Kind krank/abwesend melden</h2>
    <div class="untertitel">${k.name} · ${k.schule.name}</div>
    <div class="steckbrief-feld"><label>Von</label><div><input type="date" id="ka-von" value="${heuteISO()}"></div></div>
    <div class="steckbrief-feld"><label>Bis (leer = nur dieser eine Tag)</label><div><input type="date" id="ka-bis"></div></div>
    <div class="steckbrief-feld"><label>Grund</label><div>
      <input type="text" id="ka-grund" placeholder="z. B. Kind erkrankt" class="text-input"></div></div>
    <div class="steckbrief-wichtig">ℹ️ Es wird KEINE Vertretung gesucht. ${stamm ? `Die Stammkraft ${stamm.name} wird` : "Die Stammkraft wird"} für diesen Zeitraum als „verfügbar" markiert. Wird im Bericht/Export vermerkt, damit das Stundenkonto korrekt geprüft werden kann (keine Betreuungsstunden für dieses Kind).</div>
    <div class="modal-actions">
      <button class="aktion aktion-primaer" onclick="kindAbwesendSpeichern('${kindId}')">Speichern</button>
      <button class="aktion aktion-sekundaer" onclick="schliesseModal()">Abbrechen</button>
    </div>`;
  modalOverlay.classList.remove("hidden");
};

window.kindAbwesendSpeichern = function (kindId) {
  const von = document.getElementById("ka-von").value || heuteISO();
  const bis = document.getElementById("ka-bis").value || von;
  const grund = document.getElementById("ka-grund").value.trim() || "Kind krank/abwesend";
  if (bis < von) { alert("Das Enddatum darf nicht vor dem Startdatum liegen."); return; }

  if (!state.kindAbwesenheiten[kindId]) state.kindAbwesenheiten[kindId] = [];
  state.kindAbwesenheiten[kindId].push({ id: neueId(), von, bis, grund });

  const k = kindMitId(kindId);
  const stamm = mitarbeiterMitId(k.stammkraft);
  let hinweisStamm = "";
  if (stamm) {
    if (!state.statusPerioden[stamm.id]) state.statusPerioden[stamm.id] = [];
    state.statusPerioden[stamm.id].push({ id: neueId(), status: "verfuegbar", von, bis, grund: `Kind ${k.name} krank/abwesend` });
    hinweisStamm = ` – Stammkraft ${stamm.name} in diesem Zeitraum als verfügbar markiert`;
  }

  const zeitraumText = von === bis ? `am ${datumDE(von)}` : `${datumDE(von)} – ${datumDE(bis)}`;
  logEintrag("kind_abwesend", `🏥 ${k.name} krank/abwesend ${zeitraumText}: ${grund}${hinweisStamm} (keine Betreuungsstunden für dieses Kind – wichtig fürs Stundenkonto)`);

  schliesseModal();
  speichereZustand();
  allesNeuZeichnen();
};

window.kindAbwesenheitLoeschen = function (kindId, id) {
  if (!confirm("Diese Kind-Abwesenheit wirklich löschen?")) return;
  state.kindAbwesenheiten[kindId] = (state.kindAbwesenheiten[kindId] || []).filter(a => a.id !== id);
  speichereZustand();
  allesNeuZeichnen();
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
    const kindAbwesend = eintraege.filter(e => e.typ === "kind_abwesend").length;
    return `<div class="card">
      <h3>📅 ${datumDE(datum)} ${datum === heuteISO() ? '<span class="pill pill-modus">heute</span>' : ""}</h3>
      <div class="meta">🤒 ${krank} Krankmeldung(en) · ✅ ${vertreten} Vertretung(en) zugewiesen${kindAbwesend ? ` · 🏥 ${kindAbwesend} Kind-Abwesenheit(en)` : ""}</div>
      <ul class="bericht-eintraege">
        ${eintraege.map(e => `<li><span class="bericht-zeit">${e.zeit}</span> ${e.text}</li>`).join("")}
      </ul>
      <div class="card-actions">
        <a class="aktion aktion-whatsapp" target="_blank" rel="noopener"
           href="https://wa.me/?text=${encodeURIComponent(berichtText(datum, eintraege))}">💬 Bericht per WhatsApp teilen</a>
        <button class="aktion aktion-sekundaer" onclick="exportTagesberichtPDF('${datum}')">📄 Als PDF exportieren</button>
      </div>
    </div>`;
  }).join("");
}

// ---------- UI: Auswertung (Historie, Stunden, Ausfallquote, Heatmap) ----------
function zeichneAuswertungStunden() {
  const stunden = berechneVertretungsstunden();
  const eintraege = MITARBEITER.map(m => ({ m, h: stunden[m.id] || 0 }))
    .filter(e => e.h > 0)
    .sort((a, b) => b.h - a.h);
  const max = Math.max(1, ...eintraege.map(e => e.h));

  document.getElementById("auswertung-stunden").innerHTML = `
    <div class="card">
      <h3>🕒 Vertretungsstunden bisher</h3>
      <div class="meta">Geleistete Vertretungseinsätze (nur vergangene/heutige Tage; Wochenenden ausgenommen)</div>
      <div class="balken-liste">
        ${eintraege.length ? eintraege.map(e => `
          <div class="balken-zeile">
            <span class="balken-label">${e.m.name}</span>
            <div class="balken-spur"><div class="balken-fuellung" style="width:${(e.h / max * 100).toFixed(0)}%"></div></div>
            <span class="balken-wert">${e.h.toFixed(1)} h</span>
          </div>`).join("") : '<div class="meta">Noch keine abgeschlossenen Vertretungseinsätze.</div>'}
      </div>
    </div>`;
}

function zeichneAuswertungAusfallquote() {
  const { proKind, gesamt } = berechneAusfallquote();
  const quoteGesamt = gesamt.tage ? Math.round(gesamt.ohne / gesamt.tage * 100) : 0;

  document.getElementById("auswertung-ausfallquote").innerHTML = `
    <div class="card">
      <h3>📉 Ausfallquote</h3>
      <div class="meta">Anteil der Betreuungstage mit Ausfallperiode ohne echte Vertretung (nur vergangene/heutige Tage)</div>
      <div class="quote-gesamt">Gesamt: <b>${quoteGesamt}%</b>
        <span class="meta">(${gesamt.ohne} von ${gesamt.tage} betroffenen Tagen ohne Vertretung)</span></div>
      <div class="quote-liste">
        ${KINDER.map(k => {
          const s = proKind[k.id];
          if (!s || !s.tage) return "";
          const q = Math.round(s.ohne / s.tage * 100);
          const pillKlasse = q > 30 ? "pill-krank" : q > 0 ? "pill-anforderung" : "pill-verfuegbar";
          return `<div class="quote-zeile"><span>${k.name}</span><span class="pill ${pillKlasse}">${q}% (${s.ohne}/${s.tage})</span></div>`;
        }).join("") || '<div class="meta">Noch keine Ausfalltage erfasst.</div>'}
      </div>
    </div>`;
}

function heatStil(n) {
  if (n === 0) return { bg: "#cde2fb", fg: "#0b0b0b" };
  if (n === 1) return { bg: "#86b6ef", fg: "#0b0b0b" };
  if (n === 2) return { bg: "#3987e5", fg: "#ffffff" };
  if (n === 3) return { bg: "#1c5cab", fg: "#ffffff" };
  return { bg: "#0d366b", fg: "#ffffff" };
}

function zeichneAuswertungHeatmap() {
  const wochen = berechneHeatmap(8);
  const tageKopf = ["Mo", "Di", "Mi", "Do", "Fr"];

  document.getElementById("auswertung-heatmap").innerHTML = `
    <div class="card">
      <h3>🗓️ Heatmap: gleichzeitige Ausfälle</h3>
      <div class="meta">Anzahl Kinder mit Ausfallperiode an dem Tag, letzte 8 Wochen – Wochenenden ausgeklammert</div>
      <div class="heatmap-grid">
        <div class="heatmap-kopfzeile">${tageKopf.map(t => `<span>${t}</span>`).join("")}</div>
        ${wochen.map(woche => `<div class="heatmap-woche">
          ${woche.map(tag => {
            const { bg, fg } = heatStil(tag.anzahl);
            return `<span class="heatmap-zelle" style="background:${bg};color:${fg}" title="${datumDE(tag.datum)}: ${tag.anzahl} Ausfall/Ausfälle">${tag.anzahl || ""}</span>`;
          }).join("")}
        </div>`).join("")}
      </div>
      <div class="heatmap-legende">
        <span>Weniger</span>
        <span class="heatmap-zelle" style="background:${heatStil(0).bg}"></span>
        <span class="heatmap-zelle" style="background:${heatStil(1).bg}"></span>
        <span class="heatmap-zelle" style="background:${heatStil(2).bg}"></span>
        <span class="heatmap-zelle" style="background:${heatStil(3).bg}"></span>
        <span class="heatmap-zelle" style="background:${heatStil(4).bg}"></span>
        <span>Mehr</span>
      </div>
    </div>`;
}

function zeichneAuswertung() {
  zeichneAuswertungStunden();
  zeichneAuswertungAusfallquote();
  zeichneAuswertungHeatmap();
}

// ---------- Export: PDF-Tagesbericht & Excel-Übersicht ----------
// jsPDFs Standardschrift kann die meisten Emojis nicht darstellen (Kästchen
// statt Symbol) – für den PDF-Export werden sie deshalb entfernt, im Rest
// der App (WhatsApp, Bildschirm) bleiben sie erhalten.
function entferneEmojiUndMarkdown(text) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

window.exportTagesberichtPDF = function (datum) {
  const eintraege = state.protokoll.filter(e => e.datum === datum).sort((a, b) => a.zeit.localeCompare(b.zeit));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginX = 15;
  let y = 20;

  doc.setFontSize(16);
  doc.text(`Tagesbericht Vertretung - ${datumDE(datum)}`, marginX, y);
  y += 12;
  doc.setFontSize(11);

  if (!eintraege.length) {
    doc.text("Keine Einträge für diesen Tag.", marginX, y);
  }
  eintraege.forEach(e => {
    const zeilen = doc.splitTextToSize(`${e.zeit} Uhr - ${entferneEmojiUndMarkdown(e.text)}`, 180);
    zeilen.forEach(zeile => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(zeile, marginX, y);
      y += 7;
    });
  });

  doc.save(`Tagesbericht_${datum}.pdf`);
  logEintrag("info", `📄 Tagesbericht ${datumDE(datum)} als PDF exportiert`);
};

window.exportExcelGesamt = function () {
  const heute = heuteISO();
  const stunden = berechneVertretungsstunden();
  const { proKind, gesamt } = berechneAusfallquote();

  const mitarbeiterZeilen = [
    ["Name", "Typ", "Status heute", "Verkehrsmittel", "Stammkind(er)", "Vertretungsstunden bisher"],
    ...MITARBEITER.map(m => [
      m.name,
      state.mitarbeiterTyp[m.id] === "fest" ? "Fest" : "Springer/Pool",
      statusText[statusVon(m, heute)],
      m.verkehrsmittel === "auto" ? "Auto" : "ÖPNV",
      kinderVon(m).map(k => k.name).join(", ") || "–",
      Number((stunden[m.id] || 0).toFixed(1))
    ])
  ];

  const kinderZeilen = [
    ["Name", "Schule", "Stammkraft", "Ausfalltage bisher", "davon ohne Vertretung", "Ausfallquote", "Anforderungen"],
    ...KINDER.map(k => {
      const s = proKind[k.id] || { tage: 0, ohne: 0 };
      const stamm = mitarbeiterMitId(k.stammkraft);
      return [
        k.name, k.schule.name, stamm ? stamm.name : "–",
        s.tage, s.ohne,
        s.tage ? `${Math.round(s.ohne / s.tage * 100)}%` : "0%",
        anforderungsText(k) || "–"
      ];
    }),
    [],
    ["Gesamt", "", "", gesamt.tage, gesamt.ohne, gesamt.tage ? `${Math.round(gesamt.ohne / gesamt.tage * 100)}%` : "0%", ""]
  ];

  const abwesenheiten = kindAbwesenheitenImZeitraum(SEIT_JEHER, FERNE_ZUKUNFT);
  const abwesenheitenZeilen = [
    ["Kind", "Stammkraft", "Von", "Bis", "Grund", "Betroffene Stunden der Stammkraft"],
    ...abwesenheiten.map(a => [a.kindName, a.stammName, a.von, a.bis, a.grund, a.stunden])
  ];

  const protokollZeilen = [
    ["Datum", "Zeit", "Typ", "Text"],
    ...[...state.protokoll]
      .sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit))
      .map(e => [e.datum, e.zeit, e.typ, e.text])
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mitarbeiterZeilen), "Mitarbeiter");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kinderZeilen), "Kinder");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abwesenheitenZeilen), "Kind-Abwesenheiten");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(protokollZeilen), "Protokoll");
  XLSX.writeFile(wb, `Vertretungsplan_Uebersicht_${heute}.xlsx`);
  logEintrag("info", "📊 Excel-Gesamtübersicht exportiert");
};

// Monatsübersicht: dieselben Auswertungen wie oben, aber auf einen
// gewählten Kalendermonat begrenzt (Stunden, Ausfallquote, Kind-
// Abwesenheiten, Protokoll) – für die monatliche Abrechnung/Prüfung.
window.exportExcelMonat = function () {
  const monatWert = document.getElementById("monat-auswahl").value; // "YYYY-MM"
  if (!monatWert) { alert("Bitte zuerst einen Monat auswählen."); return; }
  const [jahr, monat] = monatWert.split("-").map(Number);
  const monatStart = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const monatEnde = `${jahr}-${String(monat).padStart(2, "0")}-${String(letzterTag).padStart(2, "0")}`;

  const stunden = berechneVertretungsstundenZeitraum(monatStart, monatEnde);
  const { proKind, gesamt } = berechneAusfallquoteZeitraum(monatStart, monatEnde);
  const abwesenheiten = kindAbwesenheitenImZeitraum(monatStart, monatEnde);

  const mitarbeiterZeilen = [
    ["Name", "Typ", "Vertretungsstunden im Monat"],
    ...MITARBEITER.map(m => [
      m.name,
      state.mitarbeiterTyp[m.id] === "fest" ? "Fest" : "Springer/Pool",
      Number((stunden[m.id] || 0).toFixed(1))
    ])
  ];

  const kinderZeilen = [
    ["Name", "Schule", "Stammkraft", "Ausfalltage im Monat", "davon ohne Vertretung", "Ausfallquote"],
    ...KINDER.map(k => {
      const s = proKind[k.id] || { tage: 0, ohne: 0 };
      const stamm = mitarbeiterMitId(k.stammkraft);
      return [
        k.name, k.schule.name, stamm ? stamm.name : "–",
        s.tage, s.ohne,
        s.tage ? `${Math.round(s.ohne / s.tage * 100)}%` : "0%"
      ];
    }),
    [],
    ["Gesamt", "", "", gesamt.tage, gesamt.ohne, gesamt.tage ? `${Math.round(gesamt.ohne / gesamt.tage * 100)}%` : "0%"]
  ];

  const abwesenheitenZeilen = [
    ["Kind", "Stammkraft", "Von", "Bis", "Grund", "Betroffene Stunden der Stammkraft"],
    ...abwesenheiten.map(a => [a.kindName, a.stammName, a.von, a.bis, a.grund, a.stunden])
  ];

  const protokollZeilen = [
    ["Datum", "Zeit", "Typ", "Text"],
    ...state.protokoll
      .filter(e => e.datum >= monatStart && e.datum <= monatEnde)
      .sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit))
      .map(e => [e.datum, e.zeit, e.typ, e.text])
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mitarbeiterZeilen), "Mitarbeiter");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kinderZeilen), "Kinder");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abwesenheitenZeilen), "Kind-Abwesenheiten");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(protokollZeilen), "Protokoll");
  XLSX.writeFile(wb, `Vertretungsplan_Monatsuebersicht_${monatWert}.xlsx`);
  logEintrag("info", `📊 Monatsübersicht ${monatWert} als Excel exportiert`);
};

// ---------- Geräte-Übertragung ohne Cloud (Download/Import) ----------
// Funktioniert überall identisch (Web-Version, Handy-Browser, Desktop-App),
// da rein clientseitig über Blob-Download bzw. FileReader – keine Cloud-
// Datenbank nötig. Für manuelles Synchronisieren zwischen zwei Geräten:
// auf Gerät A herunterladen, Datei z. B. per E-Mail/Cloud-Ordner/USB-Stick
// zu Gerät B übertragen, dort importieren.
window.datenHerunterladen = function () {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Vertretungsplan_Datensicherung_${heuteISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logEintrag("info", "⬇️ Datensicherung heruntergeladen");
};

window.datenImportierenDatei = function (input) {
  const datei = input.files[0];
  if (!datei) return;
  const reader = new FileReader();
  reader.onload = () => {
    input.value = ""; // gleiche Datei später erneut auswählbar machen
    let importiert;
    try {
      importiert = JSON.parse(reader.result);
    } catch (e) {
      alert("Die Datei ist keine gültige Vertretungsplan-Datensicherung (.json).");
      return;
    }
    if (!importiert || typeof importiert !== "object") {
      alert("Die Datei ist keine gültige Vertretungsplan-Datensicherung (.json).");
      return;
    }
    if (!confirm("Aktuellen Datenstand auf DIESEM Gerät durch die importierte Datensicherung ERSETZEN? Das kann nicht rückgängig gemacht werden.")) return;

    state = {
      mitarbeiterTyp: { ...Object.fromEntries(MITARBEITER.map(m => [m.id, m.typ])), ...importiert.mitarbeiterTyp },
      statusPerioden: { ...Object.fromEntries(MITARBEITER.map(m => [m.id, []])), ...importiert.statusPerioden },
      ausfaelle: { ...Object.fromEntries(KINDER.map(k => [k.id, []])), ...importiert.ausfaelle },
      kindAbwesenheiten: { ...Object.fromEntries(KINDER.map(k => [k.id, []])), ...importiert.kindAbwesenheiten },
      protokoll: Array.isArray(importiert.protokoll) ? importiert.protokoll : []
    };
    speichereZustand();
    allesNeuZeichnen();
    alert("Datensicherung erfolgreich importiert.");
  };
  reader.readAsText(datei);
};

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
  zeichneAuswertung();
  zeichneMarker();
}
allesNeuZeichnen();

// Suchfelder: nur die jeweilige Liste neu zeichnen (nicht die Karte/andere
// Tabs), damit die Suche beim Tippen sofort und ohne Nebenwirkungen filtert.
document.getElementById("mitarbeiter-suche").addEventListener("input", zeichneMitarbeiter);
document.getElementById("kinder-suche").addEventListener("input", zeichneKinder);

// In der Windows-Desktop-App: Hinweis + Links zur lokalen Datendatei
// einblenden (existiert nur dort, die Online-Version zeigt nichts an).
if (window.electronAPI) {
  document.getElementById("desktop-datenaktionen")?.classList.remove("hidden");
}

// Monats-Auswahl (Excel-Monatsübersicht) mit dem aktuellen Monat vorbelegen.
// Das Element ist statisches HTML (nicht Teil eines re-render-Zyklus),
// daher genügt eine einmalige Initialisierung beim Start.
const monatAuswahlEl = document.getElementById("monat-auswahl");
if (monatAuswahlEl) monatAuswahlEl.value = heuteISO().slice(0, 7);
