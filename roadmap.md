# Roadmap – Worker-Vertrag Version 1

- [x] Phase 1: Worker-Schlüssel als Hash, überlappende Rotation, Widerruf, Secret-basierte Verschlüsselung von Sitzungsdaten
- [x] Phase 2: Kanonische Auftragszustände, Zustandswechsel-Schutz, Retry-Sperre, `follow_up` entfernen
- [x] Phase 3: Heartbeat/Poll/Result/Session/Events/Messages/IP-Report nach Vertrag härten, `claim_jobs` mit SKIP LOCKED, strukturierte Fehler
- [x] Phase 4: Strikte zentrale Validierung (Zod + DB-Trigger synchron)
- [x] Phase 5: Testdaten-Bereich mit `test_run_id` und Aufräumen
- [x] Phase 6: WORKER_CONTRACT.md, WORKER_QUICKSTART.md, JSON-Schema, examples/, Regressionstests

## Sicherheits- und Korrekturrunde (Dry-Run-Betrieb)

- [x] P0: Worker-Skript ohne Schlüssel, Konfiguration nur über Umgebungsvariablen
- [x] P0: Probebetrieb als Standard (`skipped` + `DRY_RUN`, `verified: false`)
- [x] P0: Serverseitige Freigabe für den Echtbetrieb (`live_enabled`), `done` sonst 409
- [x] P0: Worker-Bot-Bindung serverseitig auf allen Endpunkten
- [x] P0: Verschlüsselung ohne Klartext-Fallback + Nachrüstlauf für Altbestand
- [x] P1: Heartbeat-Zeitfenster 90 Sekunden, atomares Claiming, Arbeitszeitfenster
- [x] P1: Idempotente Nebenwirkungen (Nachrichten, Kontaktakten)
- [x] P1: Einheitliche strukturierte Fehler `{error:{code,message}}`
- [x] P2: Vertrag, Schnellstart, Schema, Tests und .env-Hygiene aktualisiert
