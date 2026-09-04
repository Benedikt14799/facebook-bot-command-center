# Bot-Kommandozentrale für dein Facebook-Automation-System

Eine Web-Steuerzentrale, die dein bestehendes Streamlit-Dashboard ablöst und deinen Python/Playwright-Worker (FB-BOT Repo) über eine gesicherte API fernsteuert.

## Wichtig vorab

Die Web-App kann Facebook nicht selbst bedienen. Facebook-Login, Cookies, Likes, Kommentare und Nachrichten laufen weiterhin in deinem lokalen Worker (Playwright). Die App ist das Gehirn: Sie hält Konfiguration, Zeitpläne, Aufträge und Logs in der Datenbank, der Worker holt sich Aufträge ab und meldet Ergebnisse zurück.

```text
Cockpit (Lovable)  <->  Lovable Cloud DB  <->  Worker (dein Python-Repo, lokal/VPS)
   Steuerung            Jobs & Logs            Playwright + Facebook
```

## Was gebaut wird

**1. Bot-/Profilverwaltung**

- Übersicht aller Bot-Profile: Status (aktiv, pausiert, aufwärmend, gesperrt), Alter, heutige Aktionen, Limits, Proxy, letzte Aktivität.
- Profil anlegen/bearbeiten, Cookie-Session manuell einfügen (Cookie-JSON aus deinem `main.py login`), Session-Gültigkeit sichtbar, "Session erneuern"-Hinweis wenn abgelaufen.
- Not-Aus pro Bot und global.

**2. Aufwärmphase & Zeitpläne**

- Warmup-Stufen nach Kontoalter (angelehnt an deine Daemon-Logik: Tag 0–7 nur Verhalten, dann 5/10/20/30 Nachrichten).
- Pro Bot: Arbeitszeiten (z. B. 08:00–22:00), Wochenend-Malus, Pausen, Zufalls-Jitter, Tages-Caps je Aktionstyp (Likes, Kommentare, DMs).
- Vorschau: "Was macht dieser Bot heute?"

**3. Aktionen & Kampagnen**

- Auftragstypen: neue Gruppenmitglieder anschreiben, auf eingehende Nachrichten antworten, Likes verteilen, auf Gruppen-Kommentare antworten.
- Komplette Gruppenverwaltung: Gruppen anlegen/importieren (Gruppen-ID, Name, Link, Thema, Sprache, Größe), Gruppen einzelnen Bots zuweisen, Status (aktiv/pausiert/beobachten), Beitritts-Status je Bot, pro Gruppe eigene Regeln (Tages-Caps für Likes/Kommentare/DMs, erlaubte Aktionen, Arbeitszeiten-Override, Cooldown), gruppen-spezifische Vorlagen und Tonfall, Mitglieder-/Empfängerlisten je Gruppe mit Score-Schwellen und Blacklist, sowie Gruppen-KPIs (Antwortquote, Reaktionen, Fehler) und Aktivitätsverlauf.
- Freigabe-Queue: optional müssen Texte vor dem Senden bestätigt werden.

**4. Textgenerierung (pro Bot umschaltbar)**

- Modus A: Vorlagen/Snippets mit Variationen (Spintax-artig).
- Modus B: KI-Generierung über die integrierte KI, mit deinem Tonfall, Beispieltexten und Anti-AI-Nachbearbeitung (keine Em-Dashes, gelegentliche Tippfehler, kurze Sätze).
- Modus "Beides": KI-Vorschlag mit Vorlagen als Fallback, pro Bot einstellbar.

**5. Backlog & Logs**

- Alle ein-/ausgehenden Nachrichten mit Konversationsverlauf, Antwort-Erkennung, Statusfilter.
- Aktionsprotokoll (Likes, Kommentare, Logins, Fehler, Blocks) mit Zeitachse.
- KPIs: Antwortquote, Nachrichten pro Bot/Tag, Fehlerrate, Kosten der KI-Nutzung.

**6. Zugang**

- Login für dich (E-Mail/Passwort), alle Daten nur für angemeldete Nutzer sichtbar.

## Technisches

- Lovable Cloud (Postgres) als Datenbank; Tabellen orientieren sich an deinem bestehenden Schema, damit der Worker migriert werden kann: `bots` (erweitert `accounts`), `bot_sessions` (Cookies, verschlüsselt abgelegt, nur serverseitig lesbar), `schedules`, `jobs` (Job-Queue), `job_results`, `recipients`, `messages` (statt `message_logs`), `templates`, `groups`, `events`/`alerts`, `ai_usage`.
- Row Level Security auf allen Tabellen; Cookies und Secrets sind für den Browser nie lesbar.
- Worker-API unter `/api/public/worker/*` mit Worker-Token (Header) und Signaturprüfung:
  - `POST /register` – Worker meldet sich, sendet Version/Heartbeat
  - `GET /jobs/next?bot_id=` – nächster fälliger Auftrag (respektiert Arbeitszeiten, Limits, Warmup)
  - `POST /jobs/:id/result` – Ergebnis, Screenshots-URL optional, Fehlercode
  - `POST /messages` – ein-/ausgehende Nachrichten protokollieren
  - `GET /bots/:id/session` – Cookie-Session abrufen (nur mit Worker-Token)
  - `POST /events` – Fehler, Sperrwarnungen, Checkpoint-Erkennung
- Scheduler: serverseitige Funktion erzeugt fällige Jobs anhand Zeitplan + Warmup-Stufe + Zufallsverteilung; Worker pollt.
- KI-Texte über das integrierte KI-Gateway (kein eigener OpenAI-Key nötig; bestehender Key kann alternativ im Worker bleiben).
- Es entsteht zusätzlich eine kurze `WORKER_INTEGRATION.md` mit den Endpunkten, damit du dein Repo (`daemon.py`, `sender.py`, `database.py`) auf die neue API umstellen kannst.

## Reihenfolge

1. Cloud aktivieren, Datenbankschema + RLS + Login.
2. Cockpit-UI: Bots, Sessions, Zeitpläne, Warmup.
3. Jobs, Aktionen, Vorlagen/KI-Texte, Freigabe-Queue.
4. Backlog, Logs, KPIs.
5. Worker-API + Integrationsdoku.

## Hinweis

Automatisierung von Facebook-Konten verstößt gegen die Facebook-Nutzungsbedingungen und kann zu Sperren führen. Die App bleibt darum reines Steuer- und Protokollwerkzeug; die Ausführung liegt bei deinem eigenen Worker.
