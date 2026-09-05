# Testlauf im Probebetrieb: Aufträge erreichen den Worker nicht

## Was ich geprüft habe

In der Datenbank stehen zwei Worker mit dem Namen „Benedikt“. Beide haben:

- **keine Bot-Zuordnung** (0 Einträge) und
- **keine freigegebenen Fähigkeiten** (leere Liste).

Der Server liefert Aufträge nur aus, wenn beides vorhanden ist. Deshalb bleiben alle 26 Testaufträge auf „Wartend“. Das Briefing nennt die fehlende Zuordnung — die fehlende Fähigkeiten-Freigabe ist ein zweiter, ebenso blockierender Punkt.

Zusätzlich legt die Testdaten-Funktion aktuell nur Testbot, Testgruppe und Aufträge an, aber keine Zuordnung zum Worker.

## Was ich ändern will

1. **Worker-Seite: Bots zuordnen**
   Auf jeder Worker-Karte eine Auswahl deiner Bots mit Häkchen. Angehakte Bots darf dieser Worker bearbeiten. Vorhandene Zuordnungen bleiben unangetastet.

2. **Worker-Seite: Fähigkeiten freigeben**
   Ebenfalls auf der Worker-Karte: Häkchen für Liken, Kommentieren, Scannen, Nachricht senden, Antworten. Nur was du hier freigibst, wird ausgeliefert — der Worker kann sich weiterhin nichts selbst erlauben.

3. **Testdaten-Seite: Worker auswählen**
   Vor dem Anlegen wählst du einen Worker aus. Der neue Testbot wird ihm automatisch zugeordnet, und die Testreihe zeigt an, welchem Worker sie zugeordnet ist. Gibt es keinen Worker, erscheint der Hinweis „Für den Dry-Run ist zunächst ein aktiver Worker erforderlich.“
   Fehlen dem gewählten Worker noch Fähigkeiten, gebe ich die für den Test nötige Fähigkeit („Liken“) beim Anlegen der Testreihe mit frei und weise darauf hin.

4. **Aufräumen**
   Beim Aufräumen wird nur die Zuordnung dieser Testreihe entfernt; alle anderen Zuordnungen bleiben bestehen.

## Sicherheit

Am Probebetrieb ändert sich nichts: keine echten Facebook-Aktionen, kein Browserstart, keine Live-Freigabe. Aufträge sollen von „Wartend“ über „Läuft“ nach „Übersprungen“ mit Grund „DRY_RUN“ wechseln.

## Technische Details

- `src/lib/test-fixtures.functions.ts`: neuer Eingabewert `worker_id`, Prüfung auf Eigentümerschaft, Insert in `worker_bots` (mit `test_run_id`-Spalte, per Migration ergänzt), Freigabe von `like` in `workers.capabilities` falls leer; `cleanupTestFixtures` löscht die `worker_bots`-Zeile der Testreihe.
- Migration: Spalte `worker_bots.test_run_id` (nullable) plus passender Index; keine Änderung an bestehenden Zeilen.
- Neue Serverfunktionen in `src/lib/worker-tokens.functions.ts` (oder eigenes Modul) zum Setzen von Bot-Zuordnungen und Capabilities, jeweils mit `requireSupabaseAuth` und Besitzprüfung.
- `src/routes/_authenticated/workers.tsx`: zwei Auswahlbereiche pro Worker-Karte.
- `src/routes/_authenticated/test-data.tsx`: Worker-Auswahl, Anzeige der Zuordnung, Leerzustand-Hinweis.
- Keine Änderungen an Executor, Poll-Sicherheitslogik oder Live-Gate.
