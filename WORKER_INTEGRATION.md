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

## Automatik im Cockpit (ohne Worker)

Zwei zeitgesteuerte Abläufe laufen serverseitig:

| Ablauf | Takt | Route | Aufgabe |
| --- | --- | --- | --- |
| Planer | alle 10 Min | `POST /api/public/cron/plan` | erzeugt automatisch Aufträge für Bots mit Autopilot: Arbeitszeit, Tages-Caps, Aufwärmstufe, Wochenendfaktor, Jitter; Texte per KI oder Vorlage |
| Wartung | alle 30 Min | `POST /api/public/cron/maintenance` | Worker-Offlineerkennung (5 Min ohne Heartbeat), hängende Jobs (>20 Min) neu einreihen oder abbrechen, Simulationsmodus abarbeiten, Bots bei ≥3 Fehlern/Stunde pausieren und Aufwärmphase um 3 Tage verlängern |

Beide Routen sind mit dem Header `x-cron-token` geschützt (interner Schlüssel in
`cron_tokens`, nur serverseitig lesbar) und laufen dank Sperrtabelle `job_locks`
nie doppelt.

Pro Bot steuerbar: **Automatik (Autopilot)** ein/aus, **Simulationsmodus**
(Trockenlauf ohne echten Worker), Aufwärm-Preset (vorsichtig/normal/zügig),
Pause, Verlängerung und „sofort live“ auf der Seite **Aufwärmphase**.
Manuelles Anlegen von Aufträgen bleibt unverändert möglich; Aufträge zeigen in
der Liste, ob sie `auto` oder `manuell` sind.

Auf der Worker-Seite lädst du mit **Worker-Skript herunterladen** ein fertiges
Python-Startskript inklusive Token und Basis-URL herunter.

## Personen erkennen und Kontaktakte füllen

Damit Nachrichten persönlich klingen, meldet der Worker erkannte Personen zurück.
Alles landet in `recipients` (Person) und `contact_events` (Zeitleiste).

### `POST /api/public/worker/recipients`

Neue oder aktualisierte Personen melden (z. B. nach `scan_group`):

```json
{
  "group_id": "…",
  "bot_id": "…",
  "people": [
    {
      "fb_user_id": "100001234",
      "name": "Benedikt Meier",
      "profile_url": "https://facebook.com/…",
      "context": "Kommentar über Knieschmerzen nach dem Laufen",
      "kind": "scan"
    }
  ]
}
```

Der Vorname wird automatisch abgeleitet und in Texten als Anrede genutzt.

### `POST /api/public/worker/messages` — zusätzliche Felder

`recipient_name`, `recipient_fb_id`, `recipient_profile_url`, `kind`.
Ohne `recipient_id` wird die Person darüber angelegt bzw. gefunden.
Eingehende Nachrichten erhöhen `reply_count`, setzen `replied_at` und
schalten die Stufe auf „Hat geantwortet“.

### `POST /api/public/worker/result` — zusätzliche Felder

`recipient_name`, `recipient_fb_id`, `recipient_profile_url`, `context`, `sent_text`.
Bei `status: "done"` wird automatisch ein Eintrag in der Kontaktakte erzeugt
(Like, Kommentar, Welcome-Nachricht, Follow-up, Antwort).

## KI-Anbieter

Unter „KI-Einstellungen“ lässt sich statt der eingebauten KI ein eigener
Anbieter hinterlegen (OpenAI, OpenRouter, Anthropic oder ein beliebiger
OpenAI-kompatibler Endpunkt). Der Schlüssel wird nur serverseitig gelesen.
Die KI bekommt Vorname, erkannten Text, Gesprächsverlauf, Rolle des Bots und
optional das Angebot als Kontext — und schreibt daraus kurze, natürliche Texte.

## Tarnung: Proxy, Fingerprint und Verhalten

### Proxy (Pflicht auf Servern)
- Empfohlen: **Static Residential (ISP)** oder **Mobil-Proxy (4G/5G)**, IP im Land des Accounts.
- Rechenzentrums-IPs (Hetzner, AWS, DigitalOcean …) führen fast immer zu Checkpoint oder Sperre.
- Rotierende Residential-Proxys nur mit fester Sitzungsbindung — IP-Wechsel im Minutentakt ist ein Alarmsignal.
- Konfiguration je Bot im Cockpit unter „Netzwerk & Proxy“. Das Passwort liegt in `bot_secrets` und ist im Browser nicht lesbar.
- `Proxy prüfen` im Cockpit bewertet den Proxy-Endpunkt (Land, Anbieter, Hosting-Flag). Die echte Ausgangs-IP meldet der Worker per `POST /api/public/worker/ip-report` bei jedem Sitzungsstart; bei Hosting-IP wird der Bot automatisch pausiert und ein `proxy_warning`-Ereignis erzeugt.

### Session-Endpunkt
`GET /api/public/worker/session?bot_id=…` liefert zusätzlich zu Cookies und User-Agent:

| Feld | Inhalt |
| --- | --- |
| `proxy` | `{ type, server, username, password, country, rotate_url }` oder `null` |
| `fingerprint` | Plattform, User-Agent, Auflösung, RAM, CPU-Kerne, Sprache, Zeitzone |
| `behavior` | Tippverzögerungen, Pausen, Scroll-Verhalten, Sitzungslängen, Lesezeit |
| `browser_mode` | `stealth` oder `antidetect` |
| `antidetect` | Anbieter, lokale API-URL, Profil-ID, API-Schlüssel, Stealth-Rückfall |

### Browserstart
- **Stealth-Chromium (Standard):** persistentes Profil je Bot, `--disable-blink-features=AutomationControlled`, Init-Script gegen `navigator.webdriver`, Proxy + Fingerprint aus dem Cockpit.
- **Antidetect per CDP (optional):** AdsPower, Dolphin{anty} oder GoLogin werden über ihre lokale API gestartet, der Worker verbindet sich mit `connect_over_cdp`. Schlägt der Start fehl, greift optional Stealth-Chromium.

### Menschliches Verhalten
Der Worker nutzt nur Zufallswerte innerhalb der eingestellten Bereiche: `human_type` (Anschlag für Anschlag inkl. Tippfehler + Korrektur), `human_pause`, `human_scroll` (Feed-Aufwärmen vor der ersten Aktion) und `read_delay` (Lesezeit abhängig von der Textlänge). Niemals `page.fill()` verwenden.

### Checkpoint-Erkennung
`check_blocked()` prüft URL und Seiteninhalt auf Checkpoint-/Sperrhinweise, bricht sofort ab und meldet ein `blocked`-Ereignis — das Cockpit pausiert den Bot daraufhin automatisch.

## Checkpoint-Erkennung und visuelle Freischaltung

Der Worker erkennt Checkpoint-, CAPTCHA-, 2FA-, Login- und Sperrseiten und meldet
sie als Ereignis mit dem passenden Typ:

| Typ | Bedeutung |
| --- | --- |
| `checkpoint` | Facebook verlangt eine Identitätsbestätigung |
| `captcha` | Sicherheitsabfrage / reCAPTCHA |
| `two_factor` | Zwei-Faktor-Code nötig |
| `login_required` | Sitzung abgelaufen, erneuter Login nötig |
| `blocked` | Konto gesperrt oder eingeschränkt |

Bei jedem dieser Typen setzt das Cockpit den Bot sofort in den **manuellen Modus**:
Automatik aus, keine weiteren Jobs (`/worker/poll` liefert für diesen Bot nichts mehr),
Benachrichtigung in der Glocke oben rechts.

### Freischaltung

| Methode | Endpunkt | Zweck |
| --- | --- | --- |
| GET | `/api/public/worker/unlock` | offene Freischalt-Anfragen abholen |
| POST | `/api/public/worker/unlock` | `{bot_id, state: "open"\|"done"\|"failed"\|"cancelled", note?}` |

Ablauf: Im Cockpit unter **Freischaltung** auf „Fenster öffnen“ klicken. Der Worker
öffnet beim nächsten Durchlauf ein sichtbares Browserfenster mit demselben Profil,
Proxy und Fingerprint. Nach der manuellen Anmeldung speichert er die Cookies über
`/worker/session` und meldet `state: "done"` — der manuelle Modus wird aufgehoben.
Alternativ lassen sich die Cookies im Cockpit als JSON einfügen.
