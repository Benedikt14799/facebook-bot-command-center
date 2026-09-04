/**
 * Erzeugt ein fertiges Python-Worker-Startskript zum Herunterladen.
 * Das Skript meldet sich mit dem Token an, holt Auftraege ab, fuehrt sie
 * (Platzhalter fuer Playwright) aus und meldet Ergebnisse zurueck.
 */
export function workerScript(baseUrl: string, token: string, botHint = "") {
  return `#!/usr/bin/env python3
"""FB/Control Worker - Grundgeruest.

Installation:
    pip install requests playwright
    playwright install chromium

Start:
    python fbcontrol_worker.py

Der Worker holt Auftraege aus dem Cockpit ab. Die eigentliche Facebook-Aktion
setzt du in run_job() mit Playwright um - Cookies kommen aus /worker/session.
"""
import time
import traceback

import requests

BASE_URL = "${baseUrl}"
TOKEN = "${token}"
POLL_SECONDS = 20
${botHint}

session = requests.Session()
session.headers.update({"x-worker-token": TOKEN, "content-type": "application/json"})


def api(path: str, payload: dict | None = None, method: str = "POST"):
    url = f"{BASE_URL}/api/public/worker/{path}"
    resp = session.request(method, url, json=payload or {}, timeout=30)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


def load_session(bot_id: str):
    """Cookies + User-Agent des Bots holen (nur serverseitig lesbar)."""
    resp = session.get(f"{BASE_URL}/api/public/worker/session?bot_id={bot_id}", timeout=30)
    resp.raise_for_status()
    return resp.json()


def run_job(job: dict) -> dict:
    """Hier deine Playwright-Automatisierung einbauen."""
    kind = job.get("type")
    payload = job.get("payload") or {}
    text = payload.get("text")

    # Beispiel: Browser mit den Bot-Cookies starten
    # data = load_session(job["bot_id"])
    # with sync_playwright() as p: ...

    print(f"[job] {kind} -> {text!r}")
    time.sleep(2)

    if text and kind in ("comment", "dm_new_member"):
        api("messages", {
            "bot_id": job["bot_id"],
            "group_id": job.get("group_id"),
            "recipient_id": job.get("recipient_id"),
            "job_id": job["id"],
            "direction": "out",
            "channel": "comment" if kind == "comment" else "dm",
            "body": text,
        })
    return {"ok": True}


def main():
    print("FB/Control Worker gestartet")
    while True:
        try:
            api("heartbeat", {"version": "1.0.0"})
            jobs = api("poll", {"limit": 3}).get("jobs", [])
            if not jobs:
                time.sleep(POLL_SECONDS)
                continue
            for job in jobs:
                try:
                    result = run_job(job)
                    api("result", {"job_id": job["id"], "status": "done", "result": result})
                except Exception as exc:  # Fehler melden, damit das Cockpit reagieren kann
                    traceback.print_exc()
                    api("result", {"job_id": job["id"], "status": "failed", "error": str(exc)})
                    api("events", {
                        "bot_id": job.get("bot_id"),
                        "level": "error",
                        "type": "job_failed",
                        "message": str(exc),
                    })
        except Exception as exc:
            print("Verbindungsfehler:", exc)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
`;
}
