# Worker-Status vereinheitlichen, Auftragsdialog aufräumen, Aufträge validieren

## 1. Einheitlicher Worker-Status

Die Worker-Seite zeigt das gespeicherte Feld `status` an, die Worker-Health-Seite rechnet den Status aus dem Alter des letzten Heartbeats. Deshalb bleibt ein beendeter Worker auf der Worker-Seite grün.

- Gemeinsame Hilfsfunktion (`isWorkerOffline` / `effectiveWorkerStatus`) in einem Modul, das beide Seiten nutzen: älter als 5 Minuten ohne Heartbeat = `offline`, sonst gespeicherter Status.
- Worker-Seite nutzt diesen berechneten Status statt `w.status`; Worker-Health nutzt dieselbe Funktion.
- Worker-Seite aktualisiert wie Worker-Health automatisch alle 30 Sekunden.
- Ergebnis: beide Seiten zeigen immer denselben Zustand, auch nach `Strg + F5`.

## 2. Auftragsdialog überarbeiten

- Die große Erklärungsbox im Dialog („Braucht/Ergibt“ mit Beispielen) entfällt. Erklärungen bleiben nur noch als kleine i-Tooltips an den Feldern und im ausklappbaren Nachschlagewerk auf der Auftragsseite.
- Layout aufräumen: klare Feldabstände, scrollbarer Dialoginhalt mit fixiertem Kopf und Fußbereich, Aktionsauswahl einzeilig (Kurztext nicht mehr überlappend), Tippfehler-Bereich kompakter.
- Startzeit ist beim Öffnen bereits mit der aktuellen Uhrzeit vorbelegt (auch beim Duplizieren erledigter Aufträge).

## 3. Pflichtangaben je Auftragstyp

Neues, verbindliches Schema je Aktionstyp (eine Stelle im Code, von Oberfläche und Server genutzt):

| Aktion | Pflicht |
| --- | --- |
| Beiträge liken | Gruppe + Anzahl (`count`, ganze Zahl 1–20) |
| Beitrag kommentieren | Gruppe + `post_url` oder `post_id` |
| Gruppe scannen | Gruppe (`limit` optional, 1–100) |
| Neues Gruppenmitglied anschreiben | Person (`recipient_id` oder `profile_url`) |
| Auf Nachricht antworten | Person (`recipient_id`) |

- **Oberfläche:** Fehler werden direkt am Feld angezeigt („Für ‚Beiträge liken‘ müssen eine Gruppe und die Anzahl der Likes angegeben werden.“), der Einplanen-Knopf bleibt gesperrt, solange etwas fehlt. Für die häufigen Felder (Anzahl, Beitrags-Link, Scan-Tiefe) gibt es eigene Eingabefelder statt reinem JSON; das JSON-Feld bleibt als Zusatz erhalten.
- **Server:** Anlegen und Ändern laufen über eine geprüfte Serverfunktion, die dieselbe Prüfung durchführt; ungültige Aufträge werden abgelehnt und nie mit Status „geplant“ gespeichert.
- **Absicherung in der Datenbank:** Ein Trigger lehnt unvollständige Aufträge auch bei direktem Datenbank-/API-Zugriff ab, sodass die Oberflächenprüfung nicht umgangen werden kann.
- **Bestehende fehlerhafte Aufträge:** Beim Abholen durch den Worker werden sie erneut geprüft; unvollständige Aufträge werden nicht ausgeliefert, sondern mit Status „fehlgeschlagen“ und verständlichem Grund abgeschlossen und in den Logbuch-Einträgen vermerkt. Sie können also nie als „erledigt“ gemeldet werden und starten keinen Browser.
- Zusätzlich: Der Worker meldet einen Auftrag nur dann als erledigt, wenn er tatsächlich ausgeführt wurde; ein Ergebnisbericht ohne gültigen Auftrag wird abgelehnt.

## Technische Details

- Neu: `src/lib/worker-status.ts` (gemeinsame Offline-Logik), `src/lib/job-validation.ts` (Schema + `validateJob()` für Client und Server), `src/lib/jobs.functions.ts` (`saveJob`, `updateJob` mit `requireSupabaseAuth`).
- Geändert: `src/routes/_authenticated/workers.tsx`, `worker-health.tsx`, `jobs.tsx` (Dialoge, Vorbelegung Startzeit, Validierung, Entfernen von `TypeHelp` im Dialog), `src/routes/api/public/worker/poll.ts` (ungültige Aufträge aussortieren + als fehlgeschlagen markieren), `src/routes/api/public/worker/result.ts` (Statuswechsel absichern).
- Migration: Trigger `jobs_validate_payload` (BEFORE INSERT/UPDATE) für die Pflichtfeldprüfung; keine neuen Tabellen.
- Danach: TypeScript-Prüfung, Lint und Build sowie ein Browsertest über Auftragsdialog und Worker-Seiten.
