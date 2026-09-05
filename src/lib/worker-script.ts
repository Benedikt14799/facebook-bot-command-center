/**
 * Erzeugt ein fertiges Python-Worker-Startskript zum Herunterladen.
 * Enthaelt: Proxy- und Fingerprint-Uebernahme aus dem Cockpit, Stealth-Patches,
 * optionalen Antidetect-Start per CDP, menschliches Verhalten, IP-Check und
 * Checkpoint-Erkennung.
 */
export function workerScript(baseUrl: string, botHint = "") {
  return `#!/usr/bin/env python3
"""FB/Control Worker - Tarnung, Proxy und menschliches Verhalten.

Installation:
    pip install requests playwright playwright-stealth
    playwright install chromium

Konfiguration (nur ueber Umgebungsvariablen, NIE im Skript):
    export FB_CONTROL_BASE_URL="${baseUrl}"
    export FB_CONTROL_WORKER_TOKEN="<dein Worker-Schluessel>"
    export FB_CONTROL_WORKER_ID="<optional>"
    export FB_CONTROL_BOT_ID="<optional>"
    export FB_CONTROL_MODE="dry_run"   # dry_run (Standard) oder live

Start:
    python fbcontrol_worker.py

Im Probebetrieb (dry_run) wird KEINE Plattformaktion ausgefuehrt. Ergebnisse
werden als "skipped" mit dem Code DRY_RUN gemeldet und nie als verifiziert.
"""
import os
import random
import sys
import time
import traceback

import requests

BASE_URL = os.environ.get("FB_CONTROL_BASE_URL", "${baseUrl}").rstrip("/")
TOKEN = os.environ.get("FB_CONTROL_WORKER_TOKEN", "")
WORKER_ID = os.environ.get("FB_CONTROL_WORKER_ID") or None
BOT_ID = os.environ.get("FB_CONTROL_BOT_ID") or None
MODE = (os.environ.get("FB_CONTROL_MODE") or "dry_run").strip().lower()
POLL_SECONDS = 20
PROFILE_DIR = os.path.expanduser("~/.fbcontrol/profiles")
${botHint}

if not TOKEN:
    sys.exit(
        "Kein Worker-Schluessel gefunden. Bitte FB_CONTROL_WORKER_TOKEN setzen, "
        "z. B.: export FB_CONTROL_WORKER_TOKEN=\\"...\\""
    )
if MODE not in ("dry_run", "live"):
    sys.exit("FB_CONTROL_MODE muss dry_run oder live sein.")

session = requests.Session()
session.headers.update({"x-worker-token": TOKEN, "content-type": "application/json"})


def api(path: str, payload: dict | None = None, method: str = "POST"):
    url = f"{BASE_URL}/api/public/worker/{path}"
    resp = session.request(method, url, json=payload or {}, timeout=30)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


def api_get(path: str) -> dict:
    """GET-Aufruf auf die Worker-API (z. B. offene Freischaltungen)."""
    resp = session.get(f"{BASE_URL}/api/public/worker/{path}", timeout=30)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


def load_session(bot_id: str) -> dict:
    """Cookies, Proxy, Fingerprint, Verhalten und Antidetect-Konfig des Bots."""
    resp = session.get(f"{BASE_URL}/api/public/worker/session?bot_id={bot_id}", timeout=30)
    if resp.status_code == 404:
        try:
            err = resp.json().get("error")
        except Exception:
            err = None
        if err == "no session":
            return {
                "cookies": [],
                "user_agent": None,
                "fingerprint": {},
                "proxy": None,
                "behavior": {},
                "browser_mode": "stealth",
                "antidetect": None,
            }
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------- Verhalten
def human_pause(behavior: dict, factor: float = 1.0):
    lo = behavior.get("pause_min", 12) * factor
    hi = behavior.get("pause_max", 65) * factor
    time.sleep(random.uniform(lo, hi))


def read_delay(behavior: dict, text: str):
    """Lesezeit abhaengig von der Textlaenge - Menschen antworten nicht sofort."""
    ms = len(text or "") * behavior.get("read_ms_per_char", 30)
    time.sleep(min(max(ms / 1000.0, 1.5), 60) * random.uniform(0.7, 1.4))


def human_type(page, selector_or_locator, text: str, behavior: dict):
    """Tippt Zeichen fuer Zeichen mit Zufallsverzoegerung und gelegentlichem Tippfehler."""
    loc = page.locator(selector_or_locator) if isinstance(selector_or_locator, str) else selector_or_locator
    loc.click()
    lo = behavior.get("type_delay_min", 60)
    hi = behavior.get("type_delay_max", 170)
    typo = behavior.get("typo_chance", 0.04)
    for char in text:
        if random.random() < typo:
            page.keyboard.type(random.choice("abcdefghijklmnopqrstuvwxyz"))
            time.sleep(random.uniform(lo, hi) / 1000.0)
            page.keyboard.press("Backspace")
            time.sleep(random.uniform(lo, hi) / 1000.0)
        page.keyboard.type(char)
        time.sleep(random.uniform(lo, hi) / 1000.0)


def human_scroll(page, behavior: dict):
    steps = random.randint(behavior.get("warmup_scroll_min", 3), behavior.get("warmup_scroll_max", 7))
    for _ in range(steps):
        page.mouse.wheel(0, random.randint(250, 900))
        time.sleep(random.uniform(0.8, 3.5))
    if random.random() < behavior.get("idle_click_chance", 0.2):
        page.mouse.move(random.randint(100, 900), random.randint(100, 600))
        time.sleep(random.uniform(0.5, 2.0))


# ---------------------------------------------------------------- Browser
STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
window.chrome = window.chrome || {runtime: {}};
const q = navigator.permissions.query;
navigator.permissions.query = (p) => p.name === 'notifications'
  ? Promise.resolve({state: Notification.permission}) : q(p);
"""


def build_context(p, data: dict, bot_id: str, headless: bool = False):
    """Startet Chromium (Stealth) oder verbindet sich mit einem Antidetect-Browser."""
    fp = data.get("fingerprint") or {}
    proxy = data.get("proxy")
    behavior = data.get("behavior") or {}
    antidetect = data.get("antidetect")

    if data.get("browser_mode") == "antidetect" and antidetect and antidetect.get("profile_id"):
        try:
            ws = start_antidetect(antidetect)
            browser = p.chromium.connect_over_cdp(ws)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            return browser, ctx, behavior
        except Exception as exc:
            print("Antidetect-Start fehlgeschlagen:", exc)
            if not antidetect.get("fallback_stealth", True):
                raise

    proxy_cfg = None
    if proxy and proxy.get("server"):
        proxy_cfg = {"server": proxy["server"]}
        if proxy.get("username"):
            proxy_cfg["username"] = proxy["username"]
        if proxy.get("password"):
            proxy_cfg["password"] = proxy["password"]

    user_data = os.path.join(PROFILE_DIR, bot_id)
    os.makedirs(user_data, exist_ok=True)
    ctx = p.chromium.launch_persistent_context(
        user_data,
        headless=headless,
        proxy=proxy_cfg,
        user_agent=data.get("user_agent") or fp.get("user_agent"),
        locale=fp.get("locale", "de-DE"),
        timezone_id=fp.get("timezone", "Europe/Berlin"),
        viewport={"width": fp.get("width", 1920), "height": fp.get("height", 1080)},
        args=["--disable-blink-features=AutomationControlled"],
    )
    ctx.add_init_script(STEALTH_JS)
    if data.get("cookies"):
        try:
            ctx.add_cookies(data["cookies"])
        except Exception as exc:
            print("Cookies konnten nicht gesetzt werden:", exc)
    return None, ctx, behavior


def start_antidetect(cfg: dict) -> str:
    """Startet das Profil im Antidetect-Tool und liefert die CDP-Adresse."""
    provider = cfg.get("provider")
    base = cfg.get("api_url", "").rstrip("/")
    key = cfg.get("api_key")
    pid = cfg["profile_id"]
    if provider == "adspower":
        r = requests.get(f"{base}/api/v1/browser/start", params={"user_id": pid}, timeout=60).json()
        return r["data"]["ws"]["puppeteer"]
    if provider == "dolphin":
        r = requests.get(f"{base}/v1.0/browser_profiles/{pid}/start", params={"automation": 1}, timeout=60).json()
        return f"ws://127.0.0.1:{r['automation']['port']}{r['automation']['wsEndpoint']}"
    if provider == "gologin":
        r = requests.post(
            f"{base}/browser/start-profile",
            json={"profileId": pid},
            headers={"Authorization": f"Bearer {key}"} if key else {},
            timeout=90,
        ).json()
        return r["wsUrl"]
    raise RuntimeError(f"Unbekannter Antidetect-Anbieter: {provider}")


def report_ip(page, bot_id: str):
    """Ausgangs-IP ueber den Proxy pruefen und ans Cockpit melden."""
    try:
        page.goto("http://ip-api.com/json/?fields=query,countryCode,isp,org,as,hosting,mobile",
                  wait_until="domcontentloaded")
        info = page.evaluate("() => JSON.parse(document.body.innerText)")
        api("ip-report", {
            "bot_id": bot_id,
            "ip": info.get("query"),
            "country": info.get("countryCode"),
            "isp": info.get("isp"),
            "org": info.get("org"),
            "asn": info.get("as"),
            "hosting": bool(info.get("hosting")),
            "type": "mobile" if info.get("mobile") else ("datacenter" if info.get("hosting") else "residential"),
        })
        return info
    except Exception as exc:
        print("IP-Check fehlgeschlagen:", exc)
        return {}


# Erkennungsmuster je Ereignisart. Das Cockpit setzt den Bot bei jedem
# dieser Typen sofort in den manuellen Modus und benachrichtigt dich.
DETECTORS = [
    ("blocked", ["dein konto wurde gesperrt", "your account has been disabled",
                 "we suspend", "account restricted", "/disabled"]),
    ("captcha", ["captcha", "recaptcha", "sicherheitsabfrage", "security check",
                 "bestätige, dass du ein mensch bist"]),
    ("two_factor", ["two-factor", "zwei-faktor", "authentication code",
                    "bestätigungscode", "/two_step_verification"]),
    ("checkpoint", ["/checkpoint", "confirm your identity", "bestätige deine identität",
                    "unusual activity", "ungewöhnliche aktivität"]),
    ("login_required", ["/login", "log in to facebook", "bei facebook anmelden",
                        "passwort vergessen?"]),
]


def check_blocked(page, bot_id: str) -> bool:
    """Erkennt Checkpoint-, CAPTCHA-, 2FA-, Login- und Sperrseiten."""
    try:
        url = (page.url or "").lower()
        body = (page.content() or "").lower()
    except Exception:
        return False
    for kind, hints in DETECTORS:
        if any(h in url or h in body for h in hints):
            api("events", {
                "bot_id": bot_id,
                "level": "error",
                "type": kind,
                "message": f"{kind} erkannt: {page.url}",
                "meta": {"url": page.url},
            })
            return True
    return False


# --------------------------------------------------- Visuelle Freischaltung
def handle_unlock_requests():
    """
    Oeffnet fuer angeforderte Bots ein SICHTBARES Browserfenster mit demselben
    Profil, Proxy und Fingerprint. Du meldest dich dort von Hand an; danach
    werden die Cookies zurueck ins Cockpit gespeichert.
    """
    from playwright.sync_api import sync_playwright

    try:
        reqs = api_get("unlock").get("requests", [])
    except Exception as exc:
        print("Freischaltung konnte nicht abgefragt werden:", exc)
        return

    for req in reqs:
        bot_id = req["id"]
        print(f"[unlock] Öffne Fenster für {req.get('name') or bot_id}")
        api("unlock", {"bot_id": bot_id, "state": "open"})
        try:
            data = load_session(bot_id)
            with sync_playwright() as p:
                browser, ctx, behavior = build_context(p, data, bot_id, headless=False)
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
                print("    Bitte im Fenster anmelden. Danach hier ENTER drücken.")
                input()
                cookies = ctx.cookies()
                ua = page.evaluate("navigator.userAgent")
                api("session", {"bot_id": bot_id, "cookies": cookies,
                                "user_agent": ua, "status": "ok"})
                api("unlock", {"bot_id": bot_id, "state": "done",
                               "note": "Von Hand im Worker-Fenster angemeldet"})
                print("    Sitzung gespeichert, Bot ist wieder freigeschaltet.")
                try:
                    ctx.close()
                    if browser:
                        browser.close()
                except Exception:
                    pass
        except Exception as exc:
            traceback.print_exc()
            api("unlock", {"bot_id": bot_id, "state": "failed", "note": str(exc)})


# ---------------------------------------------------------------- Auftraege
def run_job(job: dict) -> dict:
    """Hier deine Playwright-Automatisierung einbauen."""
    from playwright.sync_api import sync_playwright

    bot_id = job["bot_id"]
    data = load_session(bot_id)
    kind = job.get("type")
    payload = job.get("payload") or {}
    text = payload.get("text") or job.get("generated_text")

    with sync_playwright() as p:
        browser, ctx, behavior = build_context(p, data, bot_id)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            report_ip(page, bot_id)
            page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
            if check_blocked(page, bot_id):
                raise RuntimeError("Checkpoint erkannt - Bot pausiert")

            # Sitzung menschlich aufwaermen, bevor irgendetwas passiert
            human_scroll(page, behavior)
            human_pause(behavior, 0.3)

            # === Hier die eigentliche Aktion umsetzen ===
            # like_posts / comment_post / dm_new_member / reply_message
            if text:
                read_delay(behavior, text)
            print(f"[job] {kind} -> {text!r}")

            if check_blocked(page, bot_id):
                raise RuntimeError("Checkpoint nach Aktion erkannt")

            if text and kind in ("comment_post", "dm_new_member", "reply_message"):
                api("messages", {
                    "bot_id": bot_id,
                    "group_id": job.get("group_id"),
                    "recipient_id": job.get("recipient_id"),
                    "job_id": job["id"],
                    "direction": "out",
                    "channel": "comment" if "comment" in (kind or "") else "dm",
                    "body": text,
                })
            human_pause(behavior)
            return {"ok": True}
        finally:
            try:
                ctx.close()
            except Exception:
                pass
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass


def main():
    print(f"FB/Control Worker gestartet (Modus: {MODE})")
    while True:
        try:
            hb = api("heartbeat", {
                "version": "3.1.0",
                "contract_version": "1.0",
                "capabilities": ["like", "comment", "scan", "dm", "reply"],
                "mode": MODE,
                **({"bot_id": BOT_ID} if BOT_ID else {}),
            })
            # Wirksam ist immer der Modus vom Server, nie der eigene Wunsch.
            effective_mode = (hb or {}).get("effective_mode", "dry_run")
            if effective_mode != "live":
                print("Probebetrieb: es werden keine Plattformaktionen ausgefuehrt.")
            # Zuerst pruefen, ob du einen Bot von Hand freischalten willst.
            handle_unlock_requests()
            jobs = api("poll", {"limit": 3}).get("jobs", [])
            if not jobs:
                time.sleep(POLL_SECONDS + random.uniform(0, 10))
                continue
            for job in jobs:
                try:
                    if effective_mode != "live":
                        api("result", {
                            "job_id": job["id"],
                            "status": "skipped",
                            "result": {"verified": False, "dry_run": True},
                            "error_code": "DRY_RUN",
                            "error": "Probebetrieb: keine Aktion ausgefuehrt.",
                            "error_retryable": False,
                        })
                        continue
                    result = run_job(job) or {}
                    # Vertrag 1.0: "done" nur, wenn die Ausfuehrung wirklich
                    # bestaetigt wurde. Niemals pauschal setzen.
                    if result.get("verified") is True:
                        api("result", {"job_id": job["id"], "status": "done", "result": result})
                    else:
                        api("result", {
                            "job_id": job["id"],
                            "status": "failed",
                            "result": result,
                            "error": "Ausfuehrung nicht verifiziert.",
                            "error_code": "not_verified",
                            "error_retryable": True,
                        })
                except Exception as exc:  # Fehler melden, damit das Cockpit reagieren kann
                    traceback.print_exc()
                    api("result", {
                        "job_id": job["id"],
                        "status": "failed",
                        "error": str(exc),
                        "error_code": "worker_error",
                        "error_retryable": True,
                    })
                    api("events", {
                        "bot_id": job.get("bot_id"),
                        "level": "error",
                        "type": "job_failed",
                        "message": str(exc),
                    })
                time.sleep(random.uniform(20, 120))
        except Exception as exc:
            print("Verbindungsfehler:", exc)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
`;
}
