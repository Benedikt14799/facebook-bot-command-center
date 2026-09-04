# Restliche Befunde beheben: Wiederholungen, Eingabeprüfung, Poll-Obergrenze

## F-03 — Wiederholung eines fehlgeschlagenen Auftrags (Variante A)

Heute setzt „Speichern & neu einplanen“ denselben Datensatz zurück auf „offen“; der alte Fehlertext bleibt daran hängen und der fehlgeschlagene Auftrag verschwindet aus der Historie.

Neu:

- Der fehlgeschlagene Auftrag bleibt unverändert auf „fehlgeschlagen“ inklusive Fehlertext — die Historie geht nie verloren.
- Die Wiederholung legt einen neuen Auftrag mit eigener ID, Status „offen“, ohne Fehlertext und mit Versuchszähler 0 an.
- Der neue Auftrag speichert eine Referenz auf den Ursprungsauftrag (neues Feld `retried_from_job_id`, per Datenbank-Änderung ergänzt).
- Der Knopf heißt eindeutig „Als Wiederholung neu einplanen“.
- In der Auftragsliste und im Bearbeiten-Dialog wird bei einer Wiederholung ein Hinweis „Wiederholung eines fehlgeschlagenen Auftrags“ mit Link auf den Ursprung angezeigt.
- Ein Auftrag mit Status „offen“ zeigt nie einen alten Fehlertext als aktuellen Fehler.
- Auch der Wiederholen-Knopf auf der Worker-Health-Seite (einzeln und alle) verhält sich künftig genauso: neuer Auftrag statt Zurücksetzen. Doppelte Wiederholungen werden verhindert, indem ein fehlgeschlagener Auftrag, zu dem bereits eine offene Wiederholung existiert, übersprungen wird.

## F-05 — Einheitliche Behandlung fehlerhafter Anfragedaten

Alle Worker-Schnittstellen (Lebenszeichen, Abholen, Ergebnis, Nachrichten, Ereignisse, Sitzung, IP-Meldung, Freischaltung, Empfänger) bekommen eine gemeinsame Hilfsfunktion zum Einlesen der Anfrage:

- leerer Anfragekörper → gilt als leeres Objekt (bisheriges Verhalten bleibt)
- vorhandener, aber kaputter Inhalt → HTTP 400 mit „Ungültiger JSON-Body.“ statt stiller Toleranz
- Inhalt, der kein Objekt ist (Liste, Zahl, Text) → ebenfalls HTTP 400

Die Regel wird in `WORKER_INTEGRATION.md` dokumentiert.

## F-06 — Nachweisbare Obergrenze beim Abholen

- `limit` muss eine ganze Zahl zwischen 1 und 25 sein; ungültige Werte (0, negativ, Text, Kommazahl) ergeben HTTP 400 statt stiller Korrektur.
- Ohne Angabe bleibt der Standard 5.
- Die Antwort enthält zusätzlich `limit` und `max_limit: 25`, damit die Obergrenze auch ohne 25 Testaufträge nachweisbar ist.
- Obergrenze und Fehlerverhalten werden dokumentiert.

## Technische Details

- Neue Datenbankspalte `jobs.retried_from_job_id` (Verweis auf `jobs.id`, optional) inklusive Index; keine Änderung an bestehenden Zeilen.
- Wiederholung läuft über die bestehende, validierende Serverfunktion `saveJob` — unvollständige Aufträge können also weiterhin nicht als „offen“ entstehen.
- `updateJob` bleibt für echtes Bearbeiten offener Aufträge; der Zurücksetz-Pfad (`requeue`) entfällt.
- Gemeinsamer Parser als `readJsonBody()` in `src/lib/worker-auth.server.ts`.

## Prüfung

- Wiederholung: alter Auftrag bleibt „fehlgeschlagen“, neuer ist „offen“ ohne Fehlertext, Referenz sichtbar, keine Duplikate bei mehrfachem Klick.
- Kaputter JSON-Inhalt → 400 auf allen Worker-Endpunkten; leerer Body weiterhin 200.
- `limit: 0 / -1 / 9999 / "abc"` → 400; `limit: 25` → 200 mit höchstens 25 Aufträgen.
- Typprüfung, Lint und Build laufen fehlerfrei.
