# Review: Erstanmeldung des Workers

Heute liefert die Session-Abfrage für einen Bot, der noch nie angemeldet war, einen Fehler ("keine Sitzung"). Dadurch bricht der allererste Login ab, obwohl genau dann noch keine Cookies existieren können.

## Was sich ändert

1. **Session-Abfrage (`src/routes/api/public/worker/session.ts`, GET)**
   - Reihenfolge umdrehen: zuerst den Bot laden (inkl. Proxy-, Fingerprint-, Verhaltens-, Browser- und Antidetect-Feldern) und prüfen, ob er dem angemeldeten Worker-Nutzer gehört.
   - Bot fehlt oder gehört jemand anderem → HTTP 404.
   - Fehlende `bot_id` → weiterhin HTTP 400.
   - Bot vorhanden, aber noch kein `bot_sessions`-Eintrag → HTTP 200 mit `cookies: []`, `user_agent` aus dem Fingerprint (sonst `null`), `updated_at: null` und den übrigen Feldern `proxy`, `fingerprint`, `behavior`, `browser_mode`, `antidetect` wie bisher.
   - Vorhandene Sitzung → unverändertes Verhalten.
   - Der POST-Teil (Cookies speichern, Status melden, manuellen Modus aufheben) bleibt exakt wie er ist.

2. **Worker-Skript (`src/lib/worker-script.ts`, Funktion `load_session`)**
   - Antwortstatus prüfen: Bei 404 eine leere Startkonfiguration zurückgeben (`cookies: []`, `user_agent: None`, `fingerprint: {}`, `proxy: None`, `behavior: {}`, `browser_mode: "stealth"`, `antidetect: None`), damit der Erstlogin durchläuft.
   - Alle anderen HTTP-Fehler weiterhin auslösen (`raise_for_status`).

3. **Unverändert**: Freischaltungsablauf (Anfrage abholen, sichtbares Fenster, Facebook öffnen, manuelle Anmeldung, Cookies speichern, Session „ok", Freischaltung „done"), `run_job()` und jegliche Facebook-Aktionslogik.

## Abschluss

TypeScript-Prüfung und Lint laufen lassen, danach die Änderungen bereitstellen.
