# FB/Control — Kommandozentrale für Facebook-Bots

FB/Control ist ein Cockpit zur Steuerung eigener Facebook-Profile („Bots“):
Aufwärmphase, Arbeitszeiten, Tages-Limits, Gruppen- und Vorlagenverwaltung,
Auftragsplanung mit Freigabe-Queue sowie ein vollständiges Nachrichten-Backlog.

**Wichtig zur Architektur:** Die Web-App führt selbst keine Facebook-Aktionen aus.
Login, Cookies und alle Aktionen (Likes, Kommentare, DMs) laufen in einem
**eigenen Worker** (Python + Playwright, lokal oder auf einem VPS), der sich über
eine gesicherte HTTP-API mit dem Cockpit verbindet.

```text
┌──────────────┐   Jobs / Cookies / Ergebnisse   ┌──────────────────┐
│  FB/Control  │ <-----------------------------> │  Worker (lokal)  │
│  (Web-App)   │      /api/public/worker/*       │ Python+Playwright│
└──────┬───────┘                                 └────────┬─────────┘
       │ RLS-geschützt                                    │ Browser
┌──────┴───────┐                                 ┌────────┴─────────┐
│  Datenbank   │                                 │    Facebook      │
└──────────────┘                                 └──────────────────┘
```

## Funktionsumfang

- **Bots**: Status (warmup / live / paused / blocked), Aufwärm-Startdatum,
  Arbeitszeiten (z. B. 08:00–22:00), Zufalls-Jitter, Wochenendfaktor,
  Tages-Caps je Aktionstyp, Textmodus (Vorlagen oder KI), Tonfall, Not-Aus.
- **Gruppen**: Facebook-Gruppen anlegen/importieren, Thema, Sprache, Größe,
  Bot-Zuweisungen, gruppenspezifische Regeln und Caps, Empfängerlisten mit
  Score-Schwellen.
- **Aufträge (Jobs)**: geplante Aktionen (`dm_new_member`, `reply_message`,
  `like`, `comment`), Freigabe-Queue, Filter, Abbruch und Retry.
- **Nachrichten**: Backlog aller ein- und ausgehenden DMs und Kommentare.
- **Vorlagen**: Textbausteine mit Variationen für DMs und Kommentare.
- **Protokoll**: Info-/Warn-/Fehlerereignisse der Worker, inkl. automatischer
  Sperr-Erkennung (Bot wird bei `blocked`-Event pausiert).
- **Worker**: Tokens erzeugen, Online-Status und Version einsehen.

## Setup

### 1. Lokal starten

Voraussetzung: Node.js (empfohlen via [nvm](https://github.com/nvm-sh/nvm)) und Bun oder npm.

```sh
git clone <repository-url>
cd <repository-name>
npm i
npm run dev
```

Die App läuft danach auf `http://localhost:8080`.

### 2. Umgebungsvariablen

Die Datei `.env` wird von Lovable Cloud automatisch verwaltet und enthält:

| Variable | Sichtbarkeit | Zweck |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Backend-URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | öffentlicher Key (RLS greift) |
| `SUPABASE_URL` | Server | Backend-URL für Serverfunktionen |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Admin-Zugriff für die Worker-API |

Der Service-Role-Key wird **nie** an den Browser ausgeliefert; er wird nur in
serverseitigen Dateien (`*.server.ts`, Serverrouten) verwendet.

### 3. Anmeldung

- **E-Mail + Passwort** oder **Google-Login** auf `/auth`.
- **Demo-Zugang** ohne eigene Anmeldung: Button „Demo ohne Anmeldung“ auf der
  Startseite bzw. „Ohne Anmeldung: Demo-Zugang“ auf `/auth`, alternativ direkt
  `/auth?demo=true` aufrufen.
  - Zugangsdaten: `demo@fbcontrol.app` / `demo-zugang-2026`
  - Beim ersten Aufruf legt die Serverfunktion `ensureDemoUser`
    (`src/lib/demo.functions.ts`) den bestätigten Account an und seedet einmalig
    Beispieldaten: zwei Bots, zwei Gruppen, Jobs, Nachrichten und ein Ereignis.
  - Der Demo-Account ist ein echter Nutzer mit RLS — er sieht ausschließlich
    seine eigenen Demo-Daten.

## Datenmodell (Supabase)

Alle Tabellen liegen im Schema `public`, haben eine `user_id` und sind per
**Row Level Security** auf `auth.uid()` beschränkt. `service_role` hat Vollzugriff
(für die Worker-API). `updated_at` wird per Trigger `set_updated_at()` gepflegt.

| Tabelle | Zweck | Wichtige Spalten |
| --- | --- | --- |
| `bots` | Profile/Bots | `name`, `status`, `paused`, `warmup_start`, `active_from`, `active_to`, `jitter`, `weekend_factor`, `cap_likes`, `cap_comments`, `cap_dms`, `text_mode`, `tone`, `session_status`, `last_seen_at` |
| `bot_sessions` | Facebook-Cookies je Bot | `bot_id` (unique), `cookies` (jsonb), `user_agent`, `updated_at` |
| `groups` | Facebook-Gruppen | `name`, `fb_group_id`, `topic`, `language`, `member_count`, `status`, gruppenspezifische Caps/Regeln |
| `bot_groups` | Zuordnung Bot ↔ Gruppe | `bot_id`, `group_id`, Beitrittsstatus |
| `recipients` | Empfänger-/Kontaktlisten | `group_id`, `external_id`, `name`, `score`, `status` |
| `templates` | Textvorlagen | `name`, `kind`, `body`, `variants`, `active` |
| `jobs` | geplante Aktionen | `bot_id`, `group_id`, `type`, `status`, `scheduled_for`, `needs_approval`, `attempts`, `claimed_by`, `payload`, `result`, `error` |
| `messages` | Backlog | `direction` (`in`/`out`), `channel`, `body`, `bot_id`, `group_id`, `recipient_id`, `job_id`, `thread_ref`, `external_id`, `source` |
| `events` | Protokoll | `level` (`info`/`warn`/`error`), `type`, `message`, `meta` |
| `workers` | registrierte Worker | `name`, `token`, `status`, `version`, `last_seen_at` |
| `ai_usage` | KI-Verbrauch | Modell, Tokens, Kosten |

**Sicherheitshinweis:** `bot_sessions` erlaubt authentifizierten Nutzern
Schreiben und Löschen, aber **kein** `SELECT` — Cookies können also nicht aus dem
Browser ausgelesen werden. Nur der Worker (über `service_role`) liest sie.

## Worker-API

Basis-URL: Preview- oder Published-URL des Projekts.
Alle Endpunkte liegen unter `/api/public/worker/*` und werden **nicht** über die
Nutzer-Session, sondern über ein Worker-Token authentifiziert.

Header für jeden Aufruf:

```
x-worker-token: <token aus der Seite "Worker">
content-type: application/json
```

| Methode | Pfad | Body / Query | Zweck |
| --- | --- | --- | --- |
| POST | `/api/public/worker/heartbeat` | `{ "version": "1.0.0" }` | Worker als online melden |
| POST | `/api/public/worker/poll` | `{ "bot_id"?, "limit"? }` | fällige Jobs atomar übernehmen (`pending` → `running`), liefert zusätzlich die Bot-Datensätze |
| POST | `/api/public/worker/result` | `{ "job_id", "status": "done\|failed\|skipped", "result"?, "error"? }` | Ergebnis zurückmelden |
| POST | `/api/public/worker/messages` | `{ "direction": "in\|out", "body", "bot_id"?, "group_id"?, … }` | Nachricht ins Backlog schreiben |
| POST | `/api/public/worker/events` | `{ "type", "message", "level"?, "bot_id"?, "meta"? }` | Ereignis protokollieren |
| GET | `/api/public/worker/session?bot_id=…` | — | Cookies + User-Agent des Bots |
| POST | `/api/public/worker/session` | `{ "bot_id", "cookies"?, "user_agent"?, "status"? }` | Cookies/Session-Status aktualisieren |

Regeln:

- Jobs mit `needs_approval = true` werden erst ausgeliefert, wenn sie im Cockpit
  freigegeben wurden.
- `poll` liefert Zeitfenster, Caps, Jitter und Wochenendfaktor mit, damit der
  Worker sein Verhalten selbst drosselt.
- Ein Event mit `level: "error"` und `type: "blocked"` sperrt und pausiert den
  betroffenen Bot automatisch.
- Ohne gültiges Token antworten alle Endpunkte mit `401`.

### Minimalbeispiel (Python)

```python
import requests

BASE = "https://<projekt>.lovable.app"
H = {"x-worker-token": "<token>"}

requests.post(f"{BASE}/api/public/worker/heartbeat", json={"version": "1.0.0"}, headers=H)

while True:
    jobs = requests.post(f"{BASE}/api/public/worker/poll", json={"limit": 3}, headers=H).json()["jobs"]
    for job in jobs:
        sess = requests.get(
            f"{BASE}/api/public/worker/session", params={"bot_id": job["bot_id"]}, headers=H
        ).json()
        try:
            # Playwright: Cookies setzen, Aktion ausführen (like / comment / dm)
            requests.post(
                f"{BASE}/api/public/worker/result",
                json={"job_id": job["id"], "status": "done", "result": {}}, headers=H,
            )
        except Exception as exc:
            requests.post(
                f"{BASE}/api/public/worker/result",
                json={"job_id": job["id"], "status": "failed", "error": str(exc)}, headers=H,
            )
```

Ausführliche Details inklusive Cookie-Handling: siehe [`WORKER_INTEGRATION.md`](./WORKER_INTEGRATION.md).

## Projektstruktur

```text
src/
  components/        AppShell (Navigation), StatusBadge, InfoHint (Hover-Erklärungen)
  lib/               db.ts (Abfragehelfer), demo.functions.ts, worker-auth.server.ts
  routes/
    index.tsx        öffentliche Startseite
    auth.tsx         Login, Google-OAuth, Demo-Zugang
    _authenticated/  geschütztes Cockpit (Dashboard, Bots, Gruppen, Jobs, …)
    api/public/worker/  Worker-API-Endpunkte
```

Technik: TanStack Start (React 19, Vite 7), Tailwind CSS v4, shadcn/ui,
TanStack Query, Supabase (über Lovable Cloud).

## Hinweise zum verantwortungsvollen Einsatz

Automatisierung auf Facebook kann gegen die Nutzungsbedingungen der Plattform
verstoßen und zu Sperren führen. Aufwärmphase, Zeitfenster, Jitter und Tages-Caps
sind bewusst konservativ gedacht. Setze das System nur für eigene Profile und im
Rahmen der geltenden Regeln und Gesetze ein.

---

Entwickelt mit [Lovable](https://lovable.dev) — Änderungen im
[Lovable-Editor](https://lovable.dev/projects/e8bbcf4f-fe06-4d18-9e55-13c5648c0840)
werden automatisch in dieses Repository synchronisiert.
