# Inbetriebnahme: Cockpit + Worker

Diese Anleitung führt dich Schritt für Schritt von „nichts läuft" bis „ein Bot hat über den Worker eine echte Aktion auf Facebook ausgeführt".

Grundprinzip:

```text
Cockpit (diese Web-App)          Worker (dein Rechner / VPS)
 - plant Aufträge                 - holt Aufträge per Token ab
 - erzeugt Texte (KI/Vorlagen)    - startet Chromium mit Proxy + Fingerprint
 - speichert Verlauf & Protokoll  - führt Klicks auf Facebook aus
 - zeigt Status & Alarme          - meldet Ergebnis, Nachrichten, Ereignisse
```

Das Cockpit fasst Facebook **nie** direkt an. Alles, was mit dem Facebook-Account passiert, macht der Worker auf deiner Maschine.

Die gleiche Anleitung findest du interaktiv im Cockpit unter **Inbetriebnahme** — dort mit Live-Status je Schritt.

---

## Phase 0 — Vorbereitung

Du brauchst:

| Baustein | Empfehlung |
| --- | --- |
| Rechner für den Worker | Dauerhaft laufender Mini-PC, Mac oder VPS. Muss Chromium starten können. |
| Python | 3.11 oder neuer (`python3 --version`) |
| Facebook-Account | Bestehender, benutzter Account. Frische Accounts fliegen am schnellsten raus. |
| Proxy | **Static Residential (ISP)** oder **Mobil (4G/5G)**. Standort passend zum Account. |
| Optional | Antidetect-Browser (AdsPower, Dolphin, GoLogin) für maximale Tarnung |

Nicht verwenden: Rechenzentrums-IPs (Hetzner, AWS, DigitalOcean …) und schnell rotierende Residential-Proxies. Beides ist bei Facebook ein sofortiger Auslöser für Checkpoints.

**Prüfen:** `python3 --version` gibt 3.11+ aus, dein Proxy-Anbieter hat dir Host, Port, Benutzer und Passwort geliefert.

---

## Phase 1 — Cockpit starten

Auf Lovable Cloud läuft das Cockpit bereits (Preview- bzw. veröffentlichte URL). Lokal:

```bash
git clone <dein-repo> fbcontrol
cd fbcontrol
bun install
cp .env.example .env
```

`.env` befüllen (Werte siehe `.env.example`):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — Browser
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Server
- `LOVABLE_API_KEY` — optional, für die integrierte KI

Starten:

```bash
bun dev
```

**Prüfen:** `http://localhost:8080` öffnet sich, du kannst dich anmelden (oder „Demo ohne Anmeldung" nutzen). Fehlt eine Pflichtvariable, bricht der Start mit einer klaren Meldung ab.

> Notiere dir deine **Basis-URL** — lokal `http://localhost:8080`, in Betrieb deine `…lovable.app`-Adresse. Der Worker braucht sie.
> Läuft der Worker nicht auf demselben Rechner wie das Cockpit, nimm die öffentliche URL, nicht `localhost`.

---

## Phase 2 — Grunddaten anlegen

### 2.1 Bot anlegen — Seite **Bots**

Ein Bot = ein Facebook-Profil.

- **Name** — nur zur Wiedererkennung im Cockpit
- **Persona/Rolle** — z. B. „Gruppenbetreuer", „Lauftrainer". Fließt in jeden KI-Text ein.
- **Tonfall** — z. B. „locker, kurz, du-Form, keine Emojis"
- **Angebot/Referral + Schritt** — was ab welcher Antwort platziert wird (leer lassen, wenn noch nicht relevant)
- **Tippfehler-Rate** — Standard 12 %; sorgt für menschlich wirkende Texte
- **Freigabe erforderlich** — an, solange du jeden Text vor dem Senden sehen willst

### 2.2 Gruppen anlegen — Seite **Gruppen**

Pro Gruppe: Facebook-ID oder Link, Name, Thema, Sprache. Das Thema ist wichtig — die KI greift es in Kommentaren und Nachrichten auf. Danach die Gruppe dem Bot zuordnen und gruppenspezifische Caps setzen.

### 2.3 Vorlagen — Seite **Vorlagen**

Fallback-Texte, falls die KI nicht verfügbar ist oder du bewusst feste Formulierungen willst.

### 2.4 KI wählen — Seite **KI-Einstellungen**

Entweder die integrierte KI (kein Schlüssel nötig) oder ein eigener Anbieter mit eigenem Schlüssel. Der Schlüssel wird serverseitig gespeichert und nie an den Browser ausgeliefert.

**Prüfen:** Auf der Seite **Aufträge** einen Auftrag anlegen, ohne ihn zu speichern, und „Vorschau erzeugen" klicken — es erscheint ein fertiger Text mit Persona, Tonfall und Tippfehlerquote.

---

## Phase 3 — Sicherheitsprofil je Bot setzen

Alles auf der Bot-Detailseite:

1. **Proxy** — Typ (ISP/Mobil), Host, Port, Benutzer, Passwort, Land/Stadt. Ein Bot = ein Proxy, dauerhaft derselbe.
2. **Proxy-Check** — Server prüft Reputation und Standort des Proxy-Hosts; der Worker meldet zusätzlich die tatsächlich benutzte Exit-IP.
3. **Fingerprint** — wird einmal erzeugt und bleibt fest (User-Agent, Auflösung, Sprache, Zeitzone). Nicht ständig ändern.
4. **Verhalten** — Tippgeschwindigkeit, Pausen, Scrollverhalten.
5. **Arbeitszeiten & Zeitzone** — z. B. 08:00–22:00, plus Mittagspause; Wochenendfaktor.
6. **Tages-Caps** — Likes, Kommentare, Direktnachrichten pro Tag.
7. **Warmup** — auf der Seite **Aufwärmphase**: Stufen, Dauer je Stufe, Mengen und Gewichte je Aktionstyp.

Faustregel für die erste Woche: nur Likes, maximal 10–20 am Tag, keine Direktnachrichten.

**Prüfen:** Auf der Bot-Detailseite steht der Tarnstatus auf „vollständig" (Proxy gesetzt, Fingerprint vorhanden, Verhalten konfiguriert).

---

## Phase 4 — Worker registrieren

Seite **Worker**:

1. Worker anlegen (Name, z. B. „VPS-Frankfurt").
2. Es wird ein **Token** erzeugt. Dieses Token ist das Passwort deines Workers — nicht teilen, nicht ins Repo committen.
3. Button **Skript herunterladen** → `fbcontrol_worker.py`. Basis-URL und Token sind bereits eingetragen.
4. Datei auf den Worker-Rechner legen, z. B. `~/fbcontrol/fbcontrol_worker.py`.

**Prüfen:** Die Datei enthält oben `BASE_URL = "…"` und `TOKEN = "…"` mit deinen echten Werten.

---

## Phase 5 — Worker-Rechner einrichten

```bash
mkdir -p ~/fbcontrol && cd ~/fbcontrol
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install requests playwright playwright-stealth
playwright install chromium
```

Auf einem Linux-VPS zusätzlich die Systembibliotheken:

```bash
playwright install-deps chromium
```

Ersten Start im Vordergrund, damit du die Ausgabe siehst:

```bash
python fbcontrol_worker.py
```

**Prüfen:** Im Cockpit unter **Worker-Health** wechselt der Worker innerhalb einer Minute auf „online" und zeigt einen frischen Heartbeat.

### Dauerbetrieb

**Linux (systemd)** — `/etc/systemd/system/fbcontrol-worker.service`:

```ini
[Unit]
Description=FB/Control Worker
After=network-online.target

[Service]
User=fbcontrol
WorkingDirectory=/home/fbcontrol/fbcontrol
ExecStart=/home/fbcontrol/fbcontrol/.venv/bin/python fbcontrol_worker.py
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fbcontrol-worker
journalctl -u fbcontrol-worker -f
```

**macOS**: launchd-Plist in `~/Library/LaunchAgents/`, `KeepAlive` auf `true`.
**Windows**: Aufgabenplanung → „Beim Start des Computers", Aktion `…\.venv\Scripts\python.exe fbcontrol_worker.py`.

Wichtig für die Freischaltung (Phase 6): Der Worker muss einen **sichtbaren** Browser öffnen können. Auf einem headless-VPS dafür entweder X-Server/VNC bereitstellen oder die Freischaltung auf einem Desktop-Rechner mit demselben Proxy durchführen.

---

## Phase 6 — Erstes Facebook-Login je Bot

Facebook-Passwörter werden nie im Cockpit gespeichert. Du meldest dich einmal von Hand an, danach arbeitet der Worker mit den Cookies weiter.

Weg A — **geführt über den Worker** (empfohlen):

1. Cockpit → **Freischaltung** → Bot wählen → „Freischaltung anfordern".
2. Der Worker sieht die Anfrage beim nächsten Poll und öffnet ein sichtbares Browserfenster mit demselben Profil, Proxy und Fingerprint.
3. Du meldest dich dort ganz normal bei Facebook an, inklusive 2FA.
4. Der Worker speichert die Cookies und meldet „done". Der manuelle Modus wird aufgehoben.

Weg B — **Cookies manuell importieren**:

1. In deinem Browser mit einer Cookie-Export-Erweiterung die Facebook-Cookies als JSON exportieren.
2. Cockpit → **Freischaltung** → „Cookies importieren" → JSON einfügen → speichern.
3. Das JSON muss den Cookie `c_user` enthalten, sonst wird es abgelehnt.

**Prüfen:** Der Bot zeigt Session-Status „gültig", steht nicht mehr im manuellen Modus, und unter **Protokoll** liegt ein `login`-Ereignis.

> Automatik bleibt nach einer Freischaltung bewusst aus. Du schaltest sie in Phase 8 selbst wieder ein.

---

## Phase 7 — Erster Testauftrag

1. **Simulation zuerst:** Auf der Bot-Detailseite den Simulationsmodus aktivieren. Aufträge laufen dann durch, ohne dass Facebook angefasst wird — gut, um Planung, Texte und Protokoll zu prüfen.
2. Seite **Aufträge** → „Auftrag anlegen": Bot, Gruppe, Aktion **Beiträge liken**, Startzeit „jetzt", Payload `{ "count": 1 }`.
3. Ergebnis kontrollieren: Status wechselt `pending → running → done`. Unter **Protokoll** und **Worker-Health** erscheinen die Läufe.
4. Danach Simulation ausschalten und denselben Like-Auftrag echt laufen lassen. Auf Facebook prüfen, ob das Like sitzt.
5. Erst wenn das sauber läuft: ein Kommentar-Auftrag, danach die erste Direktnachricht.

**Prüfen:** Mindestens ein Auftrag steht auf „erledigt", ohne Fehlereintrag.

---

## Phase 8 — Automatik einschalten

1. Bot-Detailseite → **Autopilot** aktivieren. Der Planer erzeugt jetzt selbst Aufträge innerhalb von Arbeitszeiten, Warmup-Stufe, Tages-Caps und Jitter.
2. Der Planer läuft serverseitig als geplanter Lauf; Wartung setzt hängende Aufträge zurück.
3. **Freigabe-Queue**: Solange „Freigabe erforderlich" am Bot an ist, wartet jeder Text auf deine Bestätigung unter **Aufträge**.
4. **Alarme**: Die Glocke oben rechts meldet Checkpoint, CAPTCHA, 2FA, abgelaufene Session, Sperren und Worker-Ausfälle.

**Prüfen:** Am nächsten Tag stehen automatisch geplante Aufträge in der Liste, mit Quelle „Planer".

---

## Phase 9 — Betrieb und Störungen

| Symptom | Was passiert automatisch | Was du tust |
| --- | --- | --- |
| Checkpoint / CAPTCHA / 2FA | Bot geht in manuellen Modus, Autopilot aus, Benachrichtigung | **Freischaltung** öffnen, Fenster anfordern, manuell lösen |
| Session abgelaufen | Manueller Modus, keine neuen Aufträge für diesen Bot | Neu einloggen oder Cookies importieren |
| Account gesperrt | Bot wird pausiert/blockiert, Ereignis `blocked` | Account ruhen lassen, Ursachen prüfen, Mengen senken |
| Worker offline | Worker-Health zeigt „offline" | Prozess/Dienst prüfen, `journalctl -u fbcontrol-worker -f` |
| Auftrag hängt in „running" | Wartung setzt ihn nach Zeitablauf zurück | Sonst Retry-Button auf **Worker-Health** |
| Aufträge fehlgeschlagen | Fehlertext am Auftrag | Einzeln oder gesammelt „Erneut versuchen" |
| KI blockiert (Guthaben/Limit) | Automatik wird pausiert, Meldung im Cockpit | Guthaben aufladen oder eigenen Anbieter hinterlegen |

Not-Aus: Bot pausieren auf der Bots-Seite; der Planer plant nichts mehr und der Worker bekommt für diesen Bot keine Aufträge.

---

## Phase 10 — Härtung, damit es dauerhaft läuft

- Ein Bot = ein Facebook-Profil = ein Browserprofil = ein fester Proxy. Niemals mischen.
- Proxy-Standort passend zum gewohnten Login-Ort des Accounts.
- Fingerprint einmal festlegen und nie wieder ändern.
- Langsam hochfahren: Woche 1 nur Likes, Woche 2 Kommentare, ab Woche 3 Direktnachrichten.
- Realistische Tagesmengen: 20–40 Likes, 5–10 Kommentare, 10–20 DMs sind für einen eingelaufenen Account bereits viel.
- Nachts nichts tun, Wochenenden anders gewichten, Pausen einplanen.
- Kein identischer Text zweimal — Vorlagenvariationen und KI-Texte mit Tippfehlern nutzen.
- Beobachte die Antwortquote: Bricht sie ein oder häufen sich Checkpoints, sofort Mengen halbieren.

---

## Worker-Endpunkte (Referenz)

Alle Aufrufe mit Header `x-worker-token: <dein Token>`.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/api/public/worker/heartbeat` | Lebenszeichen + Version |
| POST | `/api/public/worker/poll` | Aufträge atomar übernehmen |
| POST | `/api/public/worker/result` | Ergebnis / Fehler melden |
| POST | `/api/public/worker/messages` | Ein- und ausgehende Nachrichten protokollieren |
| POST | `/api/public/worker/recipients` | Person erkennen/anlegen (Name, Profil, Rohdaten) |
| POST | `/api/public/worker/events` | Ereignisse: login, checkpoint, captcha, two_factor, blocked … |
| GET | `/api/public/worker/session?bot_id=…` | Cookies, Proxy, Fingerprint, Verhalten |
| POST | `/api/public/worker/session` | Neue Cookies nach Login speichern |
| GET | `/api/public/worker/unlock` | Offene Freischaltanfragen |
| POST | `/api/public/worker/unlock` | Freischaltung auf open/done/failed/cancelled setzen |

Details und Beispiel-Payloads: [WORKER_INTEGRATION.md](./WORKER_INTEGRATION.md)

## Häufige Fehlermeldungen

| Meldung | Ursache | Lösung |
| --- | --- | --- |
| `401 Missing worker token` | Header fehlt oder Token falsch | Skript neu herunterladen |
| `Connection refused` beim Worker | Basis-URL falsch (z. B. `localhost` auf einem anderen Rechner) | Öffentliche URL eintragen |
| `playwright: executable doesn't exist` | Chromium fehlt | `playwright install chromium` |
| `Host system is missing dependencies` | VPS ohne Bibliotheken | `playwright install-deps chromium` |
| Bot bekommt keine Aufträge | Manueller Modus, pausiert, außerhalb der Arbeitszeit oder Cap erreicht | Bot-Detailseite und Freischaltung prüfen |
| Sofortiger Checkpoint nach Login | Rechenzentrums-IP oder wechselnde IP | Static-Residential- oder Mobil-Proxy nutzen |

---

## Checkliste

- [ ] Cockpit läuft und ich bin angemeldet
- [ ] Bot mit Persona, Tonfall und Tages-Caps angelegt
- [ ] Mindestens eine Gruppe angelegt und dem Bot zugeordnet
- [ ] KI-Anbieter gewählt, Vorschau erzeugt einen Text
- [ ] Proxy, Fingerprint und Verhalten je Bot gesetzt
- [ ] Warmup-Profil festgelegt
- [ ] Worker angelegt, Skript heruntergeladen
- [ ] Python-Umgebung und Chromium installiert
- [ ] Worker zeigt „online" in Worker-Health
- [ ] Facebook-Login einmal manuell erledigt, Session gültig
- [ ] Testauftrag in Simulation und danach echt erledigt
- [ ] Autopilot aktiviert, Alarme kommen an

## Verantwortungsvoller Einsatz

Automatisierung auf Facebook verstößt gegen deren Nutzungsbedingungen und kann zur Sperrung führen. Setze das Werkzeug nur für Accounts und Inhalte ein, für die du zuständig bist, halte dich an geltendes Recht (u. a. DSGVO) und versende keine unerwünschte Massenwerbung.
