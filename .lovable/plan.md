# Worker-Vertrag: Sicherheits-Review und Korrekturrunde

Bestandsaufnahme (geprüft im Code):

- Das erzeugte Worker-Skript trägt den Schlüssel im Klartext (`TOKEN = "…"`) und setzt an
  einer Stelle pauschal `result["verified"] = True` sowie `"mode": "live"`.
- Der Sitzungs-Endpunkt prüft Benutzer und Bot, aber nicht die Zuordnung Worker → Bot.
- Sitzungsdaten und Passwörter können auf unverschlüsselte Ablage zurückfallen.
- Fehlerantworten sind uneinheitlich: mehrere Endpunkte liefern noch `{"error":"Text"}`.
- `.env` liegt im Repo und steht nicht in `.gitignore`.
- Im `package.json` fehlt ein Testbefehl, obwohl Vitest vorhanden ist.

Nichts davon löst echte Facebook-Aktionen aus; alles bleibt im technischen Probebetrieb.

## Stufe 1 – Muss vor jedem Worker-Test

1. **Kein Schlüssel im Download.** Das erzeugte Skript liest ausschließlich
   `FB_CONTROL_BASE_URL`, `FB_CONTROL_WORKER_TOKEN`, `FB_CONTROL_WORKER_ID`,
   `FB_CONTROL_BOT_ID`, `FB_CONTROL_MODE`. Fehlt der Schlüssel, bricht der Start mit
   einer verständlichen Meldung ab. Der Download enthält nur die öffentliche Adresse.
   Ein Test prüft, dass kein erzeugtes Skript ein Schlüsselmuster (`fbc_`) enthält.
2. **Kein „erledigt“ ohne echte Ausführung.** Im Probebetrieb wird keine Plattformaktion
   ausgeführt: Ergebnis `skipped`, `error.code = DRY_RUN`, `verified = false`. `verified`
   wird nur aus einem echten Ausführungsergebnis übernommen, nie pauschal gesetzt.
   Keine Nachrichten und keine Kontaktakten aus einer Simulation.
3. **Sitzungszugriff an den Worker binden.** Vor jedem Zugriff mit Bot-Bezug (Sitzung
   lesen/schreiben, Ereignisse, Nachrichten, Personen, IP-Meldung, Ergebnis, Entsperren)
   wird serverseitig `worker_bots` geprüft. Fremder Bot → 403 `forbidden`.
4. **Keine unverschlüsselte Ablage.** Cookies, Proxy-Passwörter und Antidetect-Schlüssel
   werden immer verschlüsselt gespeichert. Fehlt der Schlüssel aus dem Secret-Management,
   bricht das Speichern mit `server_error` ab statt im Klartext zu speichern. Der Altbestand
   wird nicht per SQL, sondern über einen geschützten, wiederholbaren Serverlauf verschlüsselt:
   bereits verschlüsselte Datensätze werden übersprungen, Klartext erst nach erfolgreicher
   Prüfung geleert, und die Zusammenfassung nennt nur Anzahlen, nie Inhalte. Rotation über `enc_key_id`.
5. **Echtbetrieb gesperrt.** Standard ist Probebetrieb. Echtbetrieb gilt nur, wenn der Worker
   ausdrücklich freigeschaltet ist (`live_enabled`), dem Bot zugeordnet ist, die Fähigkeit
   besitzt und Bot, Sitzung, Zeitfenster und Grenzen es zulassen. Andernfalls liefert der
   Server `dry_run` zurück; Angaben des Workers schalten nie etwas frei.
6. **Nur ein echtes Lebenszeichen zählt.** Nur der Lebenszeichen-Endpunkt setzt einen Worker
   auf „online“; andere Aufrufe nicht. Älter als 90 Sekunden gilt als offline — dann keine
   neuen Aufträge; Anzeige im Cockpit und Test dazu.

## Stufe 2 – Vor der Abnahme

6. Neue Aufträge starten immer als `pending`; Status-, Claim- und Zeitfelder sind für
   Clients gesperrt. Der interne Sonderfall `pending → failed` bei ungültigen Aufträgen
   wird im Vertrag dokumentiert.
7. Abgeschlossene Aufträge sind vollständig unveränderlich – in Oberfläche, Serverfunktionen,
   Worker-Schnittstelle und Datenbank (Trigger).
8. Ohne ausdrückliche Bot-Zuordnung und ohne gespeicherte Fähigkeiten gibt es keine Aufträge.
9. Arbeitszeiten, Tageslimits, Freigabepflicht, Versuchsgrenzen, Pausen-, Sitzungs- und
   Sperrzustände werden im Claiming serverseitig geprüft; Spaltennamen (`active_from`/
   `active_to`, `cap_*`) werden vorher gegen den Code abgeglichen.
10. Ergebnis-Nebenwirkungen laufen genau einmal (Datenbank-Eindeutigkeit statt reiner
    Vorabprüfung), auch bei parallelen identischen Meldungen.
11. Ereignisse bekommen ein einheitliches Schema (`severity`, `details`, `occurred_at`, …)
    mit fester Werteliste; Sicherheitsereignisse setzen den Bot sofort in den Handbetrieb.
12. Nachrichten werden streng geprüft: Richtung nur `in`/`out`, Eigentumsprüfungen, Länge,
    Kanal, Doppelvermeidung über die Fremdkennung.
13. IP-Meldung bekommt feste Pflichtfelder, Längen, Warn-/Pausenregel und Aufbewahrung.
14. „Follow-up“ verschwindet aus allen aktiven Artefakten; alte Datensätze bleiben lesbar,
    werden aber nicht mehr angelegt oder ausgeliefert.
15. Alle Endpunkte antworten im einheitlichen Fehlerformat mit zentral definierten Codes.

## Stufe 3 – Dokumentation, Testdaten, Hygiene

16. `worker-contract.schema.json` deckt alle Anfragen, Antworten, Auftragsdaten je Typ,
    Ergebnisse, Fehlerobjekt, Sitzung, Ereignis, Nachricht und IP-Meldung ab.
17. `WORKER_CONTRACT.md` beschreibt Adressregel, Anmeldung, Rotation, Zuordnung, Zustände,
    Claiming, Grenzen, Idempotenz, Testdaten und alle tatsächlich vorhandenen Endpunkte.
18. README, Worker-Seite und Schnellstart werden auf die neuen Variablennamen und Beispiele
    ohne Schlüssel und ohne unbestätigtes „erledigt“ umgestellt.
19. Testdaten: Bot, Gruppe, 26 offene Aufträge, je ein Auftrag pro Zustand, ein
    Wiederholungsfall – atomar erzeugt, restlos je `test_run_id` und nur beim eigenen
    Benutzer löschbar.
20. `npm run test` und `npm run test:watch` ergänzen; Testabdeckung für Rotation, Fehler-
    format, Grenzwerte, paralleles Abholen, Zustandsregeln, Verifikation, Idempotenz,
    Sitzungszugriff, Zuordnung, Doppelvermeidung und Aufräumen.
21. `.env` aus der Versionierung nehmen, in `.gitignore` aufnehmen, `.env.example`
    aktualisieren und den Verlauf auf Geheimnisse prüfen.

## Technische Details

- `src/lib/worker-script.ts`: Signatur ohne Token, `os.environ`-Lesen, Standard `dry_run`,
  Executor-Registry statt Platzhalter mit `verified=true`.
- Neue Migration: Eindeutigkeit für `contact_events`/`messages` (Idempotenz), Verschlüsselung
  des Altbestands, Klartextspalten leeren, Trigger für terminale Unveränderlichkeit erweitern,
  `claim_jobs` um Zeitfenster-, Limit- und Zuordnungsprüfung ergänzen, `workers.live_enabled`.
- Zentrale Fehlerhilfe (`apiError`) in `worker-auth.server.ts`, genutzt von allen Routen.
- `secret-crypto.server.ts` wirft künftig bei fehlendem Schlüssel statt Klartext-Fallback.
- Vitest-Suiten unter `src/lib/__tests__/` gegen die lokal laufende Anwendung.

## Reihenfolge

Stufe 1 zuerst (Schlüssel, Probebetrieb, Zuordnung, Verschlüsselung), dann Stufe 2
(Zustands- und Schnittstellenhärtung), zuletzt Dokumentation, Testdaten und Hygiene.
Am Ende folgt der geforderte Abschlussbericht mit Dateien, Migrationen, Endpunkten,
Fehlercodes, Regeländerungen, Testergebnissen und den drei Bestätigungen.
