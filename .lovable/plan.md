# Worker-Vertrag Version 1 – Umsetzung des Arbeitsauftrags

Ziel: Die Zentrale so fertigstellen, dass ein unabhängiger lokaler Worker gegen eine
klar definierte, abgesicherte Schnittstelle entwickelt und getestet werden kann.

Deine Entscheidungen: „Follow-up“ wird entfernt, Worker-Schlüssel werden sofort auf
Hash-Speicherung umgestellt (Geheimnisse wie Cookies und Proxy-Passwörter dagegen
verschlüsselt), Testdaten bekommen einen Anlegen- und einen Aufräumen-Knopf.

## Phase 1 – Zugangsschlüssel absichern

- Trennung: Worker-Schlüssel werden nicht verschlüsselt, sondern als nicht
  rückrechenbarer Hash gespeichert. Cookies, Sitzungsdaten, Proxy-Passwörter und
  fremde API-Schlüssel werden verschlüsselt abgelegt.
- Beim Erzeugen wird der Schlüssel genau einmal angezeigt, mit Kopierknopf und
  deutlichem Hinweis. Danach ist er nirgends mehr abrufbar.
- Rotation je Worker ohne Aussperren: Der alte Schlüssel bleibt gültig, bis der neue
  erzeugt und lokal eingetragen ist; erst danach wird der alte widerrufen. Kurzzeitig
  sind also zwei Schlüssel je Worker gültig.
- Sichtbar bleiben nur Name, Zustand, letzte Nutzung, letzter Fehler.
- Das Startskript liest den Schlüssel nur noch aus der Umgebungsvariable
  `FB_CONTROL_WORKER_TOKEN`; kein fest eingetragener Schlüssel mehr im Download.
- Der Verschlüsselungsschlüssel für Sitzungsdaten kommt ausschließlich aus dem
  Secret-Management, nie aus Datenbank oder Repository, und ist später wechselbar.
- Schlüssel, Cookies, Proxy-Passwörter und fremde API-Schlüssel erscheinen in keiner
  Antwort, keinem Protokoll und keiner Beispieldatei.

## Phase 2 – Auftrags-Lebenszyklus verbindlich machen

- Technische Zustände in Schnittstelle und Datenbank ausschließlich: `pending`,
  `running`, `done`, `failed`, `skipped`, `cancelled`. Deutsche Begriffe erscheinen nur
  in der Oberfläche. `claimed` ist kein fachlicher Status.
- Erlaubte Wechsel werden im Server und zusätzlich in der Datenbank erzwungen.
  Abgeschlossene Aufträge sind unveränderlich.
- `failed` → `pending` nur über die Wiederholung; parallele Wiederholungen werden
  durch eine Datenbanksperre auf höchstens eine aktive begrenzt.
- Auftragstyp „Follow-up“ wird aus Oberfläche, Prüfung, Ergebniszuordnung, Datenbank-
  prüfung und Vertrag entfernt. Alte Datensätze bleiben lesbar.

## Phase 3 – Schnittstelle härten

- Lebenszeichen: nimmt zusätzlich Worker-Kennung, Vertragsversion, Fähigkeiten, Modus,
  Zustand und Bot entgegen und antwortet mit Serverzeit, Freigabe zum Abholen und
  Intervallen. Rechte, Benutzer, erlaubte Bots und wirksame Zustände ermittelt immer der
  Server; Angaben des Workers schalten nichts frei.
- Abholen: liefert nichts, wenn der Bot gesperrt, pausiert, abgemeldet, in Prüfung oder
  im Handbetrieb ist, wenn der Worker den Auftragstyp nicht kann, nicht zum Bot gehört,
  Tageslimits oder Zeitfenster verletzt sind oder Versuche aufgebraucht sind. Botdaten
  werden auf die nötigen, unkritischen Felder reduziert. Antwort enthält Serverzeit und
  Vertragsversion. Das Sperren läuft in einer Datenbankfunktion mit
  `FOR UPDATE SKIP LOCKED`, sodass zwei Worker nie denselben Auftrag erhalten.
- Ergebnis: nur für Aufträge im Zustand `running` und nur vom abholenden Worker
  (`claimed_by` muss exakt übereinstimmen). `done` nur, wenn `result.verified` exakt der
  Wahrheitswert `true` ist – `"true"` oder `1` werden mit strukturiertem Fehler
  abgelehnt. Identische Wiederholung bleibt unverändert, abweichende bleibt Konflikt;
  auch Folgewirkungen wie Nachrichten, Kontaktakten und Fortschritt laufen bei
  Wiederholung genau einmal.
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
- Eine zentrale Spezifikation je Auftragstyp; Oberfläche, Server, Abholung, Datenbank
  und Vertragsdokument werden daraus abgeleitet und laufend gegeneinander getestet,
  damit sie nicht auseinanderlaufen.

## Phase 5 – Testumgebung

- Neuer Bereich „Testdaten“ im Cockpit: Test-Bot, Testgruppe, ein Auftrag je Typ, je ein
  Auftrag in jedem Zustand, ein Wiederholungsfall und 26 Aufträge für die Mengenprüfung.
- Jede Erzeugung erhält neben der Markierung `source = "test"` eine eindeutige
  `test_run_id`. Der Aufräumen-Knopf löscht ausschließlich die Daten genau dieses
  Durchlaufs und nur beim eigenen Benutzer – restlos und wiederholbar.
- Keine echten Empfänger, keine Plattformaktionen.

## Phase 6 – Dokumentation und Nachweis

- `WORKER_CONTRACT.md` (vollständiger Vertrag), `WORKER_QUICKSTART.md` (Start in zwölf
  Schritten), `worker-contract.schema.json` und der Beispielordner `examples/`. Beispiele
  nutzen künstliche, klar gekennzeichnete Werte und synthetische Kennungen – niemals
  echte Schlüssel, Cookies oder produktive Kennungen.
- Automatisierte Prüfungen für Ergebnis-Schnittstelle, Abholgrenze, paralleles Abholen,
  JSON-Behandlung, Fachprüfung, Sperrzustände, Wiederholung, Nachrichten sowie
  Anmeldung, Rotation und Widerruf der Schlüssel. Ergebnisse werden dir zusammengefasst.

## Technische Details

- Datenbank: `workers` erhält `token_hash`, `contract_version`, `capabilities`, `mode`,
  `last_ip`, `last_error`, `revoked_at`, `updated_at`; für die überlappende Rotation eine
  eigene Zeile je Schlüssel (`worker_tokens` mit `token_hash`, `created_at`,
  `revoked_at`, `last_used_at`); `token` entfällt nach der Migration. `jobs` erhält
  `started_at`, `mode`, `contract_version`, `executor_version`, `error_code`,
  `error_message`, `error_retryable`, `error_stage`; Index auf `retried_from_job_id`,
  Teilindex für fällige offene Aufträge, partieller Unique-Index gegen mehrfach aktive
  Wiederholungen, Check-Constraint auf `status`, Trigger für Zustandswechsel und
  Unveränderlichkeit terminaler Aufträge.
- Claiming über eine `security definer`-Funktion `claim_jobs(...)` mit
  `FOR UPDATE SKIP LOCKED` statt Einzel-Updates aus dem Anwendungscode.
- Schlüsselprüfung per SHA-256 mit Präfix-Lookup und zeitkonstantem Vergleich in
  `worker-auth.server.ts`; Kontext liefert `workerId`, `userId`, `allowedBotIds` und
  `contractVersion` – alle serverseitig ermittelt.
- Verschlüsselung von Sitzungs- und Geheimdaten mit AES-GCM; Schlüsselmaterial nur aus
  einem neuen Secret, mit Schlüsselkennung im Datensatz für spätere Rotation.
- Validierung als zentrale Zod-Spezifikation in `job-validation.ts`, gespiegelt in
  `validate_job_payload()`; ein Test vergleicht beide Seiten und das Vertragsdokument.
- Testdaten über eine geschützte Serverfunktion (nur eigener Benutzer, `source = 'test'`
  plus `test_run_id`), nicht über einen öffentlichen Endpunkt.
- Regressionstests als Vitest-Suite gegen die lokal laufende Anwendung.

## Reihenfolge und Risiko

Phasen 1 und 2 zuerst, weil sie Sicherheit und Datenmodell festlegen; danach 3 bis 6.
Durch die überlappende Rotation entsteht kein Moment, in dem ein Worker ausgesperrt ist:
Der alte Schlüssel wird erst nach erfolgreicher Übernahme des neuen widerrufen.
