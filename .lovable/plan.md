# Worker-Vertrag Version 1 – Umsetzung des Arbeitsauftrags

Ziel: Die Zentrale so fertigstellen, dass ein unabhängiger lokaler Worker gegen eine
klar definierte, abgesicherte Schnittstelle entwickelt und getestet werden kann.

Deine Entscheidungen: „Follow-up“ wird entfernt, Worker-Schlüssel werden sofort auf
verschlüsselte Speicherung umgestellt, Testdaten bekommen einen Anlegen- und einen
Aufräumen-Knopf.

## Phase 1 – Zugangsschlüssel absichern

- Neue Schlüssel werden nur noch als nicht rückrechenbarer Prüfwert gespeichert.
- Beim Erzeugen wird der Schlüssel genau einmal angezeigt, mit Kopierknopf und
  deutlichem Hinweis. Danach ist er nirgends mehr abrufbar.
- Je Worker: Schlüssel neu erzeugen (Rotation) und widerrufen. Sichtbar bleiben nur
  Name, Zustand, letzte Nutzung, letzter Fehler.
- Ablauf ohne Aussperren: erst neuen Schlüssel erzeugen und lokal eintragen, dann den
  alten widerrufen. Alle heute bestehenden Schlüssel werden im Zuge der Umstellung
  ungültig – du legst pro Worker einmal einen neuen an.
- Das Startskript liest den Schlüssel nur noch aus der Umgebungsvariable
  `FB_CONTROL_WORKER_TOKEN`; kein fest eingetragener Schlüssel mehr im Download.
- Schlüssel, Cookies, Proxy-Passwörter und fremde API-Schlüssel erscheinen in keiner
  Antwort, keinem Protokoll und keiner Beispieldatei.

## Phase 2 – Auftrags-Lebenszyklus verbindlich machen

- Gültige Zustände: offen, läuft, erledigt, fehlgeschlagen, übersprungen, abgebrochen.
  Der Zwischenzustand „claimed“ entfällt als eigener Zustand.
- Erlaubte Wechsel werden im Server und zusätzlich in der Datenbank erzwungen.
  Abgeschlossene Aufträge sind unveränderlich.
- „Fehlgeschlagen → offen“ nur über die Wiederholung; parallele Wiederholungen werden
  durch eine Datenbanksperre auf höchstens eine aktive begrenzt.
- Auftragstyp „Follow-up“ wird aus Oberfläche, Prüfung, Ergebniszuordnung, Datenbank-
  prüfung und Vertrag entfernt. Alte Datensätze bleiben lesbar.

## Phase 3 – Schnittstelle härten

- Lebenszeichen: nimmt zusätzlich Worker-Kennung, Vertragsversion, Fähigkeiten, Modus,
  Zustand und Bot entgegen und antwortet mit Serverzeit, Freigabe zum Abholen und
  Intervallen. Die Angaben werden gespeichert und in der Worker-Übersicht angezeigt.
- Abholen: liefert nichts, wenn der Bot gesperrt, pausiert, abgemeldet, in Prüfung oder
  im Handbetrieb ist, wenn der Worker den Auftragstyp nicht kann, nicht zum Bot gehört,
  Tageslimits oder Zeitfenster verletzt sind oder Versuche aufgebraucht sind. Botdaten
  werden auf die nötigen, unkritischen Felder reduziert. Antwort enthält Serverzeit und
  Vertragsversion.
- Ergebnis: nur für laufende Aufträge und nur vom abholenden Worker. „Erledigt“ nur mit
  bestätigter Ausführung (`result.verified === true`), sonst Ablehnung. Identische
  Wiederholung bleibt unverändert, abweichende bleibt Konflikt.
- Sitzung: nur an den berechtigten Worker für den zugeordneten Bot; verschlüsselte
  Ablage; klar definierte Sitzungszustände; Zustände mit Anmeldebedarf gelten nie als
  einsatzbereit; minimierte Antwort.
- Ereignisse: einheitliches Schema mit Schweregrad, Zeitpunkt und Details; bei
  Anmelde-, Sicherheits- oder Sitzungsproblemen wird der Bot sofort sicher gestellt und
  bekommt keine Aufträge mehr.
- Nachrichten: feste Feldliste, Eigentumsprüfung für Bot, Gruppe, Person und Auftrag,
  Doppelvermeidung über die Fremdkennung, Kontaktakte nur einmal fortschreiben.
- IP-Meldung: definierte Felder, einheitliches Detailfeld, festgelegte Warn- und
  Pausenregel und Aufbewahrungsfrist.
- Fehlerantworten werden durchgehend strukturiert (Code, Text, Wiederholbarkeit,
  Stufe, Details).

## Phase 4 – Prüfregeln der Auftragsdaten

- Strikte Typen statt stiller Umwandlung: Anzahl nur als echte ganze Zahl 1 bis 20,
  Texte pflicht und längenbegrenzt bei Kommentar- und Nachrichtentypen, Beitrags-
  kennung oder -Adresse als Text geprüft, unbekannte Typen strukturiert abgelehnt.
- Dieselben Regeln in Oberfläche, Server, Abholung und Datenbank.

## Phase 5 – Testumgebung

- Neuer Bereich „Testdaten“ im Cockpit: Test-Bot, Testgruppe, ein Auftrag je Typ, je ein
  Auftrag in jedem Zustand, ein Wiederholungsfall und 26 Aufträge für die Mengenprüfung.
- Alles klar als Test markiert, ohne echte Empfänger und ohne Plattformaktionen; ein
  Knopf löscht restlos und wiederholbar.

## Phase 6 – Dokumentation und Nachweis

- `WORKER_CONTRACT.md` (vollständiger Vertrag), `WORKER_QUICKSTART.md` (Start in zwölf
  Schritten), `worker-contract.schema.json` und der Beispielordner `examples/` – ohne
  echte Schlüssel, Cookies, IDs oder Empfänger.
- Automatisierte Prüfungen für Ergebnis-Schnittstelle, Abholgrenze, JSON-Behandlung,
  Fachprüfung, Sperrzustände, Wiederholung, Nachrichten sowie Anmeldung, Rotation und
  Widerruf der Schlüssel. Ergebnisse werden dir zusammengefasst.

## Technische Details

- Datenbank: `workers` erhält `token_hash`, `contract_version`, `capabilities`, `mode`,
  `last_ip`, `last_error`, `revoked_at`, `updated_at`; `token` entfällt nach Migration.
  `jobs` erhält `started_at`, `mode`, `contract_version`, `executor_version`,
  `error_code`, `error_message`, `error_retryable`, `error_stage`; Index auf
  `retried_from_job_id`, Teilindex für fällige offene Aufträge, partieller Unique-Index
  gegen mehrfach aktive Wiederholungen, Check-Constraint auf `status`, Trigger für
  Zustandswechsel und Unveränderlichkeit terminaler Aufträge. Grants und RLS wie
  bestehend, Worker-Zugriff ausschließlich über die Serverrolle.
- Schlüsselprüfung per SHA-256 mit Präfix-Lookup und zeitkonstantem Vergleich in
  `worker-auth.server.ts`; Kontext liefert zusätzlich `allowedBotIds` und
  `contractVersion`.
- Sitzungs- und Geheimdaten werden mit einem serverseitigen Schlüssel (neues Secret)
  symmetrisch verschlüsselt abgelegt.
- Validierung wandert in strikte Zod-Schemata je Auftragstyp in `job-validation.ts`,
  gespiegelt in `validate_job_payload()`.
- Testdaten über eine geschützte Serverfunktion (nur eigener Benutzer, Marker
  `source = 'test'`), nicht über einen öffentlichen Endpunkt.
- Regressionstests als Vitest-Suite gegen die lokal laufende Anwendung.

## Reihenfolge und Risiko

Phasen 1 und 2 zuerst, weil sie Sicherheit und Datenmodell festlegen; danach 3 bis 6.
Beim Wechsel auf neue Schlüssel entsteht ein kurzer Moment, in dem du je Worker einen
neuen Schlüssel eintragen musst – der Ablauf ist so gebaut, dass der alte erst danach
widerrufen wird.
