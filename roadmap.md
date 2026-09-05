# Roadmap – Worker-Vertrag Version 1

- [ ] Phase 1: Worker-Schlüssel als Hash, überlappende Rotation, Widerruf, Secret-basierte Verschlüsselung von Sitzungsdaten
- [ ] Phase 2: Kanonische Auftragszustände, Zustandswechsel-Schutz, Retry-Sperre, `follow_up` entfernen
- [ ] Phase 3: Heartbeat/Poll/Result/Session/Events/Messages/IP-Report nach Vertrag härten, `claim_jobs` mit SKIP LOCKED, strukturierte Fehler
- [ ] Phase 4: Strikte zentrale Validierung (Zod + DB-Trigger synchron)
- [ ] Phase 5: Testdaten-Bereich mit `test_run_id` und Aufräumen
- [ ] Phase 6: WORKER_CONTRACT.md, WORKER_QUICKSTART.md, JSON-Schema, examples/, Regressionstests
