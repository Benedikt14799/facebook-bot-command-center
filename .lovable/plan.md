# Result-API: Fehlerbericht vom 05.09.2026

## Was ich im Code sehe

Der Ergebnis-Endpunkt behandelt abgeschlossene Aufträge heute so:

- gleicher Status wie gespeichert → HTTP 200 mit `unchanged: true`
- anderer Status → HTTP 409

Damit gibt es zwei Punkte, die zum Bericht passen bzw. nicht passen:

1. **Bestätigte Lücke:** Ein abweichender Ergebnis-**Inhalt** mit gleichem Status
   (`done`) wird nicht erkannt. Der Vertrag verlangt hier HTTP 409, der Code
   antwortet aber mit 200 „unverändert“. Das ist ein echter Fehler und wird behoben.
2. **Noch offen:** Warum der Test HTTP 400 **mit leerem Antwortkörper** bekommen hat,
   lässt sich aus dem Code nicht erklären — jede 400-Antwort dort enthält einen
   JSON-Fehlertext. Wahrscheinlich lief der Test gegen einen älteren
   veröffentlichten Stand oder die Anfrage kam gar nicht erst am Endpunkt an.
   Das prüfe ich zuerst, bevor ich etwas daran ändere.

## Vorgehen

### 1. Ursache der leeren 400 klären (erster Schritt)

Testanfragen gegen Vorschau- und veröffentlichte Adresse mit einem Testauftrag
schicken und Statuscode plus Antwortkörper vergleichen. Damit sehen wir, ob es sich
um einen veralteten veröffentlichten Stand handelt oder um eine Antwort aus der
Anfrageprüfung davor.

### 2. Vertrag für abgeschlossene Aufträge sauber umsetzen

Bei bereits abgeschlossenem Auftrag wird künftig Status **und** Inhalt verglichen:

| Fall | Antwort |
| --- | --- |
| gleicher Status, gleicher Inhalt (`result` und `error`) | 200, `unchanged: true` |
| gleicher Status, abweichender Inhalt | 409 |
| abweichender Status | 409 |

In allen Fällen bleiben Auftrag, Fehlertext, Nachrichten und Kontaktakte unverändert,
und es wird keine Plattformaktion ausgelöst.

### 3. Alle Fehlerantworten mit nachvollziehbarem JSON-Körper

Die Anmeldeprüfung des Workers antwortet aktuell mit reinem Text
(„Missing worker token“ usw.). Diese Antworten bekommen dasselbe JSON-Format wie die
übrigen Fehler, damit jeder Fehler maschinell lesbar ist.

### 4. Prüfen und veröffentlichen

Alle vier Fälle aus den Abnahmekriterien gegen die laufende Anwendung durchspielen,
Testdaten danach wieder entfernen, Dokumentation in `WORKER_INTEGRATION.md`
ergänzen und den Stand neu veröffentlichen, damit der Test gegen die
veröffentlichte Adresse wiederholt werden kann.

## Technische Details

- `src/routes/api/public/worker/result.ts`: Vergleich von `result` (kanonisch
  serialisiert, schlüsselunabhängig) und `error` gegen die gespeicherten Werte,
  bevor `unchanged: true` zurückgegeben wird; sonst 409 mit
  `{ error, status, reason: "result_mismatch" }`.
- `src/lib/worker-auth.server.ts`: `authenticateWorker` liefert JSON-Fehler
  (`401`/`500`) statt `new Response("…")`.
- Statusprüfung (`done|failed|skipped`) und `job_id`-Pflicht bleiben unverändert
  bei HTTP 400.
