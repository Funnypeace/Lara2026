# 🧭 Vertretungsplan Schulbegleitung (Demo)

Web-Tool für die Vertretungskoordination in der Schulbegleitung –
Demo mit **fiktiven Beispieldaten** aus der Region **Norderstedt / Kreis Segeberg**.

## Was kann das Tool?

- **Karte** (OpenStreetMap): zeigt alle Schulen der betreuten Kinder und die Wohnorte der Mitarbeiter. Farben = Status (grün: verfügbar, rot: krank, orange: im Einsatz), Symbol = Verkehrsmittel (🚗 Auto / 🚌 ÖPNV).
- **Vertretungsfälle**: Kinder, deren Stammkraft ausgefallen ist. „Vertretung suchen" sortiert alle verfügbaren Mitarbeiter nach **Fahrzeit zur Schule**:
  - 🚗 Autofahrer: echte Fahrzeit über den OSRM-Routendienst (kostenlos, OpenStreetMap-basiert)
  - 🚌 ÖPNV: Schätzwert + Klick-Link, der die echte Verbindung in Google Maps öffnet
- **Steckbriefe**: pro Kind mit Schule, Betreuungszeit, Diagnose, Hinweisen und Notfallkontakt – inkl. Button **„per WhatsApp senden"** (öffnet WhatsApp mit fertigem Text, passend zum bestehenden WhatsApp-Workflow).
- **Statusverwaltung**: Mitarbeiter per Klick auf krank / verfügbar / im Einsatz setzen; Vertretungsbedarf für ein Kind melden. Änderungen werden im Browser gespeichert (localStorage).
- **Zugangscode** (Demo): `lara2026`

## Beispieldaten anpassen

Alle Daten stehen in [`data.js`](data.js) – Kinder und Mitarbeiter einfach dort ändern/ergänzen
(Name, Adresse, Koordinaten, Diagnose, Hinweise …). Koordinaten findet man z. B. über
[nominatim.openstreetmap.org](https://nominatim.openstreetmap.org).

## Lokal starten

Einfach `index.html` im Browser öffnen – kein Server, keine Installation nötig.

## ⚠️ Wichtig vor dem echten Einsatz (DSGVO)

Diese Demo enthält nur fiktive Daten. Für echte Daten gilt:

- **Diagnosen von Kindern sind besondere Kategorien personenbezogener Daten (Art. 9 DSGVO).** Der Träger muss die Verarbeitung rechtlich absichern (Einwilligungen, Verarbeitungsverzeichnis).
- Der Demo-Zugangscode ist **kein** echter Schutz – für den Produktivbetrieb braucht es einen richtigen Login (z. B. Vercel-Passwortschutz, Supabase Auth).
- Die Übermittlung von Steckbriefen mit Diagnosen **über WhatsApp** ist datenschutzrechtlich problematisch (US-Anbieter, Meta). Alternativen: Link auf den passwortgeschützten Steckbrief statt Klartext, oder ein Messenger mit AV-Vertrag (z. B. Threema Work, Signal per Dienstgerät).

## Mögliche Ausbaustufen

1. **Echte Datenbank** (Vercel Postgres oder Supabase): Daten zentral pflegen statt in `data.js`, Status geräteübergreifend synchron.
2. **Login & Rollen**: Koordinatorin (alles), Mitarbeiter (nur eigener Status + zugewiesene Steckbriefe).
3. **Selbstmeldung**: Mitarbeiter melden sich per Handy selbst krank/verfügbar – die Koordinatorin sieht es live.
4. **Echte ÖPNV-Fahrzeiten** über eine Fahrplan-API (z. B. HVV/NAH.SH-Daten).
5. **Einsatzhistorie & Dokumentation** der Vertretungen.
