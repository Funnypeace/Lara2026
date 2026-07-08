# 🧭 Vertretungsplan Schulbegleitung (Prototyp)

Web-Tool für die Vertretungskoordination in der Schulbegleitung –
**Prototyp** mit **fiktiven Beispieldaten** (fiktive Personen und Straßen, echte Orte)
aus der Region **Norderstedt / Kreis Segeberg**.
Gedacht als Vorlage für die IT: Für den Produktivbetrieb auf einen eigenen Server
packen und mit echtem Login/Rechteverwaltung versehen (siehe Datenschutz unten).

## Was kann das Tool?

- **Karte** (OpenStreetMap): zeigt alle Schulen der betreuten Kinder und die Wohnorte der Mitarbeiter (straßengenau). Farben = Status (grün: verfügbar, rot: krank, orange: im Einsatz), Symbol = Verkehrsmittel (🚗 Auto / 🚌 ÖPNV).
- **Stammkraft-Verknüpfung**: Jedes Kind ist mit seiner festen Begleitkraft verknüpft. Meldet die sich krank, entsteht **automatisch ein Vertretungsfall** für ihr Kind („Max Mustermann krank → Lenny braucht Vertretung").
- **Vertretungsfälle**: „Vertretung suchen" sortiert alle passenden verfügbaren Mitarbeiter nach **Fahrzeit zur Schule**:
  - 🚗 Autofahrer: echte Fahrzeit über den OSRM-Routendienst (**kostenlos**, OpenStreetMap-basiert, kein API-Key). Fällt der Dienst aus, rechnet die App **offline** mit Luftlinie weiter.
  - 🚌 ÖPNV: Offline-Schätzwert + Klick-Link, der die echte Verbindung in Google Maps öffnet
  - „✅ zuweisen" trägt die Vertretung ein: Fall geschlossen, Mitarbeiter „im Einsatz", Eintrag im Tagesbericht.
- **Anforderungen an die Vertretung** pro Kind hinterlegbar: z. B. *nur männliche/weibliche Vertretung* (filtert die Suche), *keine fremde Vertretung gewünscht* (Fall wird angezeigt, aber ohne Suche) oder Freitext-Besonderheiten.
- **📊 Tagesbericht**: automatisches Protokoll pro Tag – wer hat sich wann krankgemeldet, wer hat wo vertreten. Teilbar per WhatsApp.
- **Steckbriefe**: pro Kind mit Schule, Betreuungszeit, Diagnose, Hinweisen, Anforderungen und Notfallkontakt – inkl. Button **„per WhatsApp senden"** (öffnet WhatsApp mit fertigem Text, passend zum bestehenden WhatsApp-Workflow).
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
