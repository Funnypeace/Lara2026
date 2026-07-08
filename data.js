// =====================================================================
// BEISPIELDATEN – Vertretungsplan Schulbegleitung
// Region: Norderstedt / Kreis Segeberg (Schleswig-Holstein)
//
// Alle Personen, Adressen, Telefonnummern und Diagnosen sind FIKTIV.
// Zum Anpassen: Einträge unten ändern/ergänzen – die App liest diese
// Datei beim Start. (Später ersetzbar durch eine echte Datenbank.)
// =====================================================================

const KINDER = [
  {
    id: "k1",
    name: "Lena M.",
    alter: 8,
    klasse: "3a",
    schule: {
      name: "Grundschule Harksheide-Nord",
      adresse: "Am Exerzierplatz 1, 22844 Norderstedt",
      lat: 53.7256, lng: 10.0068
    },
    wohnort: { adresse: "Ulzburger Straße 440, 22846 Norderstedt", lat: 53.7304, lng: 9.9989 },
    betreuungszeit: "Mo–Fr 07:45–13:30 Uhr",
    diagnose: "Autismus-Spektrum-Störung (frühkindlicher Autismus)",
    hinweise: "Braucht feste Rituale und Ankündigung von Übergängen. Reagiert empfindlich auf Lärm – Kopfhörer sind im Ranzen. Bei Überforderung Rückzugsraum neben dem Sekretariat nutzen. Nicht anfassen, wenn aufgeregt.",
    notfallkontakt: "Mutter: Sandra M., 0176 111111",
    stammkraft: "m3",
    vertretungBenoetigt: true,
    grund: "Stammkraft krankgemeldet (bis Fr.)"
  },
  {
    id: "k2",
    name: "Finn K.",
    alter: 10,
    klasse: "4b",
    schule: {
      name: "Grundschule Pellwormstraße",
      adresse: "Pellwormstraße 25, 22846 Norderstedt",
      lat: 53.7124, lng: 10.0212
    },
    wohnort: { adresse: "Tangstedter Landstraße 200, 22846 Norderstedt", lat: 53.7051, lng: 10.0405 },
    betreuungszeit: "Mo–Fr 08:00–13:00 Uhr",
    diagnose: "ADHS, kombinierter Typ",
    hinweise: "Nimmt morgens Medikation zu Hause. Braucht Bewegungspausen ca. alle 30 Min. In Konfliktsituationen deeskalierend und ruhig bleiben, kurze klare Ansagen. Sitzt vorne links am Fenster.",
    notfallkontakt: "Vater: Thomas K., 0176 222222",
    stammkraft: "m5",
    vertretungBenoetigt: false,
    grund: ""
  },
  {
    id: "k3",
    name: "Mia S.",
    alter: 7,
    klasse: "1c",
    schule: {
      name: "Olzeborchschule Henstedt-Ulzburg",
      adresse: "Schulstraße 4, 24558 Henstedt-Ulzburg",
      lat: 53.7908, lng: 9.9812
    },
    wohnort: { adresse: "Kirchweg 12, 24558 Henstedt-Ulzburg", lat: 53.7842, lng: 9.9765 },
    betreuungszeit: "Mo–Fr 07:50–12:45 Uhr",
    diagnose: "Diabetes mellitus Typ 1 (Insulinpumpe)",
    hinweise: "WICHTIG: Blutzucker vor der Frühstückspause und vor dem Sport kontrollieren (CGM-App auf dem Begleiter-Handy). Bei Unterzuckerung: Traubenzucker in der Brotdose, Notfallset im Sekretariat. Werte unter 70 mg/dl → sofort Eltern anrufen.",
    notfallkontakt: "Mutter: Julia S., 0176 333333 · Diabetesambulanz UKSH: 0451 000000",
    stammkraft: "m1",
    vertretungBenoetigt: true,
    grund: "Stammkraft fällt heute aus (Kind krank)"
  },
  {
    id: "k4",
    name: "Noah B.",
    alter: 9,
    klasse: "3b",
    schule: {
      name: "Grundschule am Lakweg",
      adresse: "Lakweg 5, 24568 Kaltenkirchen",
      lat: 53.8367, lng: 9.9498
    },
    wohnort: { adresse: "Flottkamp 30, 24568 Kaltenkirchen", lat: 53.8412, lng: 9.9605 },
    betreuungszeit: "Mo–Do 08:00–14:00 Uhr",
    diagnose: "Epilepsie (fokale Anfälle)",
    hinweise: "WICHTIG: Bei Anfall Zeit stoppen, Umgebung sichern, NICHT festhalten. Notfallmedikament (Buccolam) im Kühlschrank des Sekretariats – Gabe erst nach 3 Min. Anfall, Einweisung liegt vor. Danach immer Eltern + ggf. 112. Schwimmunterricht nur mit 1:1-Begleitung im Wasser.",
    notfallkontakt: "Mutter: Anna B., 0176 444444",
    stammkraft: "m7",
    vertretungBenoetigt: false,
    grund: ""
  },
  {
    id: "k5",
    name: "Emil W.",
    alter: 11,
    klasse: "5a",
    schule: {
      name: "Franz-Claudius-Schule (Förderzentrum)",
      adresse: "Falkenburger Straße 90, 23795 Bad Segeberg",
      lat: 53.9312, lng: 10.3021
    },
    wohnort: { adresse: "Eutiner Straße 8, 23795 Bad Segeberg", lat: 53.9401, lng: 10.3189 },
    betreuungszeit: "Mo–Fr 08:15–13:45 Uhr",
    diagnose: "Down-Syndrom (Trisomie 21), Herzfehler (operiert)",
    hinweise: "Sehr offen und freundlich, läuft aber gern weg – beim Pausenhof immer in Sichtweite bleiben. Spricht wenige Worte, nutzt Gebärden-unterstützte Kommunikation (Karten im Ranzen). Beim Sport auf Belastung achten (Herz), Pausen anbieten.",
    notfallkontakt: "Eltern: Familie W., 0176 555555",
    stammkraft: "m2",
    vertretungBenoetigt: false,
    grund: ""
  },
  {
    id: "k6",
    name: "Ida P.",
    alter: 8,
    klasse: "2b",
    schule: {
      name: "Grundschule Maienbeeck",
      adresse: "Maienbeeck 22, 24576 Bad Bramstedt",
      lat: 53.9188, lng: 9.8843
    },
    wohnort: { adresse: "Landweg 3, 24576 Bad Bramstedt", lat: 53.9243, lng: 9.8791 },
    betreuungszeit: "Mo–Fr 07:45–13:00 Uhr",
    diagnose: "FASD (Fetale Alkoholspektrumstörung)",
    hinweise: "Lebt in Pflegefamilie – Ansprechpartner ist NUR die Pflegemutter. Braucht sehr kleinschrittige Anleitung, vergisst Absprachen schnell (nicht böswillig!). Reizarme Umgebung wählen, Lob wirkt sehr gut. Kein Kontakt zur leiblichen Familie auf dem Schulgelände zulassen.",
    notfallkontakt: "Pflegemutter: Petra L., 0176 666666",
    stammkraft: "m9",
    vertretungBenoetigt: false,
    grund: ""
  }
];

const MITARBEITER = [
  { id: "m1",  name: "Sabine Krüger",   wohnort: { adresse: "Norderstedt-Garstedt", lat: 53.6889, lng: 9.9812 }, verkehrsmittel: "auto", status: "krank",     telefon: "0170 1000001", qualifikation: "Erzieherin, Diabetes-Schulung" },
  { id: "m2",  name: "Jan Petersen",    wohnort: { adresse: "Bad Segeberg",         lat: 53.9355, lng: 10.3102 }, verkehrsmittel: "auto", status: "im_einsatz", telefon: "0170 1000002", qualifikation: "Heilerziehungspfleger, UK-Erfahrung" },
  { id: "m3",  name: "Melanie Voss",    wohnort: { adresse: "Norderstedt-Harksheide", lat: 53.7301, lng: 10.0154 }, verkehrsmittel: "oepnv", status: "krank",  telefon: "0170 1000003", qualifikation: "Sozialpäd. Assistentin, Autismus-Fortbildung" },
  { id: "m4",  name: "Kerstin Albrecht",wohnort: { adresse: "Henstedt-Ulzburg (Rhen)", lat: 53.7618, lng: 9.9985 }, verkehrsmittel: "auto", status: "verfuegbar", telefon: "0170 1000004", qualifikation: "Erzieherin, Erste-Hilfe am Kind" },
  { id: "m5",  name: "Deniz Yılmaz",    wohnort: { adresse: "Norderstedt-Mitte",    lat: 53.7089, lng: 9.9934 },  verkehrsmittel: "oepnv", status: "verfuegbar", telefon: "0170 1000005", qualifikation: "Schulbegleiter, ADHS-Erfahrung" },
  { id: "m6",  name: "Britta Hansen",   wohnort: { adresse: "Kaltenkirchen",        lat: 53.8331, lng: 9.9612 },  verkehrsmittel: "auto", status: "verfuegbar", telefon: "0170 1000006", qualifikation: "Heilerzieherin, Epilepsie-Einweisung" },
  { id: "m7",  name: "Marco Lehmann",   wohnort: { adresse: "Kaltenkirchen-Süd",    lat: 53.8258, lng: 9.9553 },  verkehrsmittel: "auto", status: "krank",     telefon: "0170 1000007", qualifikation: "Schulbegleiter" },
  { id: "m8",  name: "Aylin Demir",     wohnort: { adresse: "Quickborn",            lat: 53.7278, lng: 9.9042 },  verkehrsmittel: "oepnv", status: "verfuegbar", telefon: "0170 1000008", qualifikation: "Sozialpäd. Assistentin" },
  { id: "m9",  name: "Frauke Petersen", wohnort: { adresse: "Bad Bramstedt",        lat: 53.9201, lng: 9.8867 },  verkehrsmittel: "auto", status: "verfuegbar", telefon: "0170 1000009", qualifikation: "Erzieherin, FASD-Fortbildung" },
  { id: "m10", name: "Tobias Brandt",   wohnort: { adresse: "Ellerau",              lat: 53.7549, lng: 9.9218 },  verkehrsmittel: "oepnv", status: "verfuegbar", telefon: "0170 1000010", qualifikation: "Schulbegleiter, Springer" },
  { id: "m11", name: "Nicole Sievers",  wohnort: { adresse: "Henstedt-Ulzburg",     lat: 53.7935, lng: 9.9768 },  verkehrsmittel: "auto", status: "verfuegbar", telefon: "0170 1000011", qualifikation: "Heilerziehungspflegerin" },
  { id: "m12", name: "Sven Otte",       wohnort: { adresse: "Wahlstedt",            lat: 53.9522, lng: 10.2145 }, verkehrsmittel: "oepnv", status: "verfuegbar", telefon: "0170 1000012", qualifikation: "Schulbegleiter" }
];
