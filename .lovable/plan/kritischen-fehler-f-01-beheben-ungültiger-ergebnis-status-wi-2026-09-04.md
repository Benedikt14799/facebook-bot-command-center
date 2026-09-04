# Kritischen Fehler F-01 beheben: ungültiger Ergebnis-Status wird als „erledigt“ gewertet

Der Prüfbericht zeigt: Meldet ein Worker ein Ergebnis mit einem unbekannten Status (z. B. `invalid_status_for_test`), wird der Auftrag trotzdem auf „erledigt“ gesetzt — sogar wenn er vorher schon abgeschlossen war. Ursache ist ein Rückfall auf „erledigt“ in der Ergebnis-Schnittstelle (`src/routes/api/public/worker/result.ts`, Zeilen 46–48).

## Was sich ändert

Nur die Ergebnis-Schnittstelle für Worker:

1. Strikte Statusprüfung: erlaubt sind ausschließlich `done`, `failed`, `skipped`. Alles andere (auch fehlend) wird mit HTTP 400 und der Meldung „Ungültiger Status. Erlaubt sind: done, failed, skipped.“ abgelehnt — ohne jede Änderung am Auftrag.
2. Abgeschlossene Aufträge werden geschützt: steht der Auftrag bereits auf `done`, `failed`, `skipped` oder `cancelled`, wird nichts mehr geändert. Ist der gemeldete Status identisch mit dem gespeicherten, antwortet die Schnittstelle idempotent mit HTTP 200 und ändert nichts; bei abweichendem Status kommt HTTP 409.
3. Zuordnung prüfen: ein Ergebnis wird nur akzeptiert, wenn der Auftrag von genau diesem Worker übernommen wurde (`claimed_by`). Andernfalls HTTP 409.
4. Die bestehende Absicherung bleibt erhalten: fachlich unvollständige Aufträge können weiterhin nie als „erledigt“ durchgehen, sondern landen auf `failed`.
5. Folgewirkungen (Kontakteintrag, Stufenfortschritt) laufen nur noch bei einem tatsächlich neu auf `done` gesetzten Auftrag — nie bei einem abgelehnten oder wiederholten Ergebnis.

## Nicht Teil dieser Änderung

Die weiteren Berichtspunkte (F-03 Retry-Verhalten, F-05 tolerante JSON-Behandlung, F-06 Poll-Obergrenze) bleiben vorerst offen und können danach einzeln angegangen werden.

## Prüfung nach der Umsetzung

- ungültiger Status → HTTP 400, Auftrag bleibt unverändert
- fehlender Status → HTTP 400
- `running → done/failed/skipped` → weiterhin erlaubt
- zweites identisches Ergebnis → HTTP 200, keine Nebenwirkungen
- Ergebnis für fremden/abgeschlossenen Auftrag → HTTP 409
- Ergebnis ohne Auftrags-ID → HTTP 400
