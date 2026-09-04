# Worker-Anbindung (Python / Playwright)

Die Web-App ist die Kommandozentrale. Ausgeführt wird alles von deinem eigenen
Worker (lokal oder VPS). Der Worker authentifiziert sich mit einem Token aus der
Seite **Worker**.

Header für alle Aufrufe:

```
x-worker-token: <token>
content-type: application/json
```

Basis-URL: die Preview- bzw. Published-URL des Projekts.

## Endpunkte

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/api/public/worker/heartbeat` | `{ "version": "1.0.0" }` — meldet den Worker online |
| POST | `/api/public/worker/poll` | `{ "bot_id"?, "limit"? }` — holt fällige Jobs und setzt sie auf `running` |
| POST | `/api/public/worker/result` | `{ "job_id", "status": "done\|failed\|skipped", "result"?, "error"? }` |
| POST | `/api/public/worker/messages` | Nachricht ins Backlog schreiben (`direction: in\|out`) |
| POST | `/api/public/worker/events` | Log-Ereignis (`level: info\|warn\|error`) |
| GET | `/api/public/worker/session?bot_id=…` | Cookies + User-Agent für den Bot |
| POST | `/api/public/worker/session` | Cookies aktualisieren / Session-Status setzen |

Wichtig: Jobs mit `needs_approval = true` werden **nicht** ausgeliefert, bis sie
im Cockpit freigegeben wurden. `poll` liefert zusätzlich die Bot-Datensätze mit
Zeitfenstern, Caps, Jitter und Wochenendfaktor, damit der Worker sein Verhalten
selbst drosseln kann.

## Minimalbeispiel

```python
import requests, time

BASE = "https://<projekt>.lovable.app"
H = {"x-worker-token": "<token>"}

requests.post(f"{BASE}/api/public/worker/heartbeat", json={"version": "1.0.0"}, headers=H)

while True:
    r = requests.post(f"{BASE}/api/public/worker/poll", json={"limit": 3}, headers=H).json()
    for job in r["jobs"]:
        sess = requests.get(
            f"{BASE}/api/public/worker/session", params={"bot_id": job["bot_id"]}, headers=H
        ).json()
        try:
            # -> Playwright: Cookies setzen, Aktion ausführen (like/comment/dm)
            requests.post(
                f"{BASE}/api/public/worker/result",
                json={"job_id": job["id"], "status": "done", "result": {}},
                headers=H,
            )
        except Exception as exc:
            requests.post(
                f"{BASE}/api/public/worker/result",
                json={"job_id": job["id"], "status": "failed", "error": str(exc)},
                headers=H,
            )
    time.sleep(30)
```

## Blockierungsschutz

Meldet der Worker ein Ereignis mit `type: "blocked"` und `level: "error"`, wird
der betroffene Bot automatisch pausiert und auf Status `blocked` gesetzt.

## Session/Cookies

Cookies werden im Cockpit unter **Bots → Details** als JSON-Array hinterlegt und
können aus Sicherheitsgründen im Browser nicht wieder gelesen werden. Nur der
Worker holt sie serverseitig über `/api/public/worker/session`.
