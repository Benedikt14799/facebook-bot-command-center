# Inbetriebnahme-Anleitung für Cockpit + Worker

Ziel: eine sehr granulare Schritt-für-Schritt-Anleitung, mit der du von "App läuft" bis "erster echter Auftrag wurde vom Worker ausgeführt" kommst — als Dokument im Repo und als geführte Seite im Cockpit.

## 1. Neues Dokument `BETRIEB.md`

Vollständige Anleitung in Deutsch, in Phasen gegliedert, mit kopierbaren Befehlen und "So prüfst du, dass es geklappt hat" nach jedem Schritt:

1. **Vorbereitung**: was du brauchst (Rechner oder VPS, Python 3.11+, Facebook-Account, Static-Residential- oder Mobile-Proxy, optional Antidetect-Browser).
2. **Cockpit starten**: Repo klonen, `bun install`, `.env` aus `.env.example`, `bun dev`, Login bzw. Demo-Zugang, Umgebungsvariablen-Prüfung beim Start.
3. **Grunddaten anlegen**: Bot anlegen (Persona, Tonfall, Angebot, Tippfehlerquote), Gruppen anlegen/zuordnen, Vorlagen, KI-Anbieter wählen (integrierte KI oder eigener Schlüssel).
4. **Sicherheitsprofil setzen**: Proxy-Felder pro Bot, Fingerprint, Verhaltenswerte, Arbeitszeiten, Tages-Caps, Warmup-Profil und -Stufen.
5. **Worker registrieren**: Worker im Cockpit anlegen, Token verstehen, `fbcontrol_worker.py` herunterladen, Ablageort, Token geheim halten.
6. **Worker-Rechner einrichten**: `pip install requests playwright playwright-stealth`, `playwright install chromium`, Start als Vordergrundprozess, danach dauerhaft (systemd-Unit / Windows-Aufgabenplanung / macOS launchd), Logs.
7. **Erstes Login pro Bot**: Freischaltungs-Fenster über `/unlock` anfordern, manuell in sichtbarem Browser einloggen, Cookies werden gespeichert, alternativ Cookie-Import per JSON; Prüfen von `session_status`.
8. **Erster Testauftrag**: Simulationsmodus zuerst, dann ein echter Like-Auftrag, Kontrolle in Aufträge, Protokoll, Worker-Health.
9. **Automatik einschalten**: Autopilot je Bot, Planer/Cron, Freigabe-Queue, Monitoring und Alarme.
10. **Betrieb & Störungen**: Checkpoint/CAPTCHA — was passiert automatisch und was du tun musst; Worker offline; hängende Jobs; Retry-Button; Bot pausieren; Not-Aus.
11. **Härtung**: Proxy-Typen (warum keine Rechenzentrums-IPs), IP-Standort, ein Bot = ein Profil = ein Proxy, langsames Hochfahren, realistische Tagesmengen.
12. **Checkliste zum Abhaken** am Ende, plus Tabelle aller Worker-Endpunkte und der wichtigsten Fehlermeldungen mit Ursache/Lösung.

## 2. Geführte Seite im Cockpit: `/inbetriebnahme`

Dieselbe Anleitung als interaktive Checkliste im geschützten Bereich:

- Nummerierte Schritte mit Kurzbeschreibung, Befehlen zum Kopieren und Direktlinks in die jeweiligen Cockpit-Seiten (Bots, Gruppen, Worker, Freischaltung, Aufträge, Worker-Health).
- Live-Status je Schritt aus vorhandenen Daten: mindestens ein Bot vorhanden, mindestens eine Gruppe, Worker registriert, Heartbeat in den letzten 5 Minuten, gültige Session je Bot, mindestens ein erfolgreich abgeschlossener Auftrag.
- Farbige Statusanzeige (offen / erledigt) und Hinweistexte über die bestehenden Info-Buttons.
- Link im Seitenmenü und auffälliger Hinweis auf dem Dashboard, solange die Checkliste nicht vollständig ist.

## 3. README-Verweis

Im README einen kurzen Abschnitt "Inbetriebnahme" mit Verweis auf `BETRIEB.md` und die neue Cockpit-Seite ergänzen.

## Technische Details

- `BETRIEB.md` neu im Repo-Root; Inhalte konsistent zu `WORKER_INTEGRATION.md` (Endpunkte, Header `x-worker-token`, Freischaltungsablauf) und `.env.example`.
- Neue Route `src/routes/_authenticated/inbetriebnahme.tsx`, Daten über die bestehenden Supabase-Abfragen (`bots`, `groups`, `workers`, `jobs`, `bot_sessions`-Status über Bot-Felder `session_status`/`manual_mode`); keine Schemaänderung nötig.
- Statusprüfung Worker-Heartbeat über das vorhandene `workers.last_seen`-Feld, gleiche Logik wie auf der Worker-Health-Seite.
- Navigationslink in `src/components/AppShell.tsx`; eigener `head()`-Block mit Titel/Beschreibung für die neue Route.
