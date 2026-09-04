# Worker-Automatisierung im Cockpit

## Wie es heute läuft

```text
Cockpit (App)                         Dein Worker (PC/VPS)
  Job manuell anlegen  ──poll──────▶  Job übernehmen
                                      Playwright: Cookies setzen, Aktion ausführen
  Backlog / Protokoll ◀──result/messages/events──  zurückmelden
```

Der Facebook-Zugriff selbst braucht einen echten Browser und bleibt deshalb im
eigenen Worker. Alles davor und danach — Planung, Texte, Überwachung — kann die
App übernehmen. Genau das baue ich aus.

## Was dazukommt

### Manuelle Steuerung bleibt vollständig erhalten

Nichts wird ersetzt: Worker weiterhin selbst anlegen, benennen, Token erzeugen
und löschen; Jobs weiterhin von Hand planen (Bot, Gruppe, Typ, Zeitpunkt, Text,
Freigabepflicht), abbrechen, wiederholen und einzeln freigeben. Die Automatik
ist pro Bot zuschaltbar und lässt sich jederzeit ausschalten — dann läuft alles
wie bisher rein manuell. Automatisch erzeugte Jobs sind als solche gekennzeichnet
und lassen sich vor dem Start noch bearbeiten.

### Aufwärmphasen-Verwaltung

Eigene Seite "Aufwärmphase", weil das der kritische Teil gegen Sperren ist:

- Aufwärmplan je Bot: Dauer in Tagen und Tagesmengen je Aktionstyp pro Stufe
  (z. B. Tag 1–3 nur Lesen/wenige Likes, Tag 4–7 erste Kommentare, ab Tag 8 DMs)
- Vorlagen für Aufwärmpläne (vorsichtig / normal / zügig) plus frei anpassbare
  eigene Kurve; Werte je Tag einzeln überschreibbar
- Fortschrittsanzeige pro Bot: aktueller Tag, aktuelle Stufe, heutiges Limit,
  bereits verbraucht, Restkontingent, Datum des voraussichtlichen "live"-Status
- manuelle Eingriffe: Aufwärmphase pausieren, verlängern, zurücksetzen, eine
  Stufe zurückstufen oder vorzeitig auf "live" setzen
- Sicherheitsnetz: bei Warn-/Sperrereignis wird der Bot automatisch eine Stufe
  zurückgesetzt und die Aufwärmphase verlängert, mit Hinweis im Protokoll
- Der Planer hält sich strikt an die Aufwärmwerte; manuell angelegte Jobs zeigen
  eine Warnung, wenn sie das Tageslimit der Aufwärmphase überschreiten würden.

### 1. Automatische Job-Planung (pro Bot zuschaltbar)

Ein Planer läuft alle 10 Minuten und erzeugt selbstständig Jobs pro Bot:

- nur innerhalb der Arbeitszeit des Bots, nicht wenn pausiert/gesperrt
- respektiert Tages-Caps je Aktionstyp (Likes, Kommentare, DMs)
- verteilt die Aktionen über den Tag mit Zufalls-Jitter, Wochenendfaktor
- Aufwärmphase: in den ersten Tagen deutlich reduzierte Mengen, langsam steigend
- Zielauswahl aus zugewiesenen Gruppen und Empfängern über der Score-Schwelle
- neue Seite "Automatik": pro Bot an/aus, Vorschau "Was macht dieser Bot heute?"

### 2. KI-Texte im Cockpit

Beim Erzeugen eines Jobs schreibt die App den Text bereits mit und legt ihn in
den Job — der Worker sendet nur noch.

- Tonfall, Sprache und Beispieltexte je Bot bzw. Gruppe
- Anti-AI-Nachbearbeitung: kurze Sätze, keine Floskeln/Emoji-Schwemme, leichte
  Varianz und Tippfehlertoleranz, Vermeidung typischer KI-Formulierungen
- Fallback auf Vorlagen, wenn KI aus ist oder fehlschlägt
- Verbrauch wird in der bestehenden Verbrauchstabelle mitgeschrieben
- Texte, die eine Freigabe brauchen, landen weiter in der Freigabe-Queue

### 3. Worker-Setup & Download

Neue Ansicht auf der Worker-Seite:

- fertiges Python-Worker-Skript mit eingesetztem Token und Basis-URL als Download
- Kurzanleitung (Python, Playwright installieren, starten) mit Kopierbuttons
- Statusanzeige "verbunden / nie gesehen / offline seit X"

### 4. Überwachung & Alarme

- Worker offline (kein Lebenszeichen) wird automatisch auf "offline" gesetzt
- hängende Jobs (zu lange "running") werden zurück auf "pending" gestellt,
  nach mehreren Fehlversuchen auf "failed"
- Fehlerhäufung oder Sperr-Ereignis pausiert den Bot und erzeugt eine Warnung
- Warnbanner im Dashboard mit den offenen Problemen

### 5. Simulationsmodus

Pro Bot umschaltbar: Jobs werden ohne echten Worker verarbeitet, als erledigt
markiert und erzeugen Beispiel-Nachrichten im Backlog. Damit lassen sich
Planung, Texte und Auswertung testen, ohne Facebook zu berühren. Deutlich
sichtbar als "Simulation" gekennzeichnet.

## Technische Umsetzung

- Migration: Felder für Automatik (`autopilot`, `simulate`, Aufwärmkurve,
  Zeitzone) auf `bots`; Tabelle `job_locks` als Einzellauf-Sperre; Statuszeile
  für den Planer inkl. Pausenzustand. Für jede neue Tabelle: GRANTs, RLS und
  nutzerbezogene Policies.
- Zeitsteuerung über pg_cron → HTTP auf neue öffentliche Serverrouten
  `src/routes/api/public/cron/plan` (Planer + Texte) und
  `.../cron/maintenance` (Offline-/Hänger-Erkennung, Simulation), abgesichert
  über ein geheimes Cron-Token.
- Jeder Lauf ist begrenzt: feste Batch-Größe, Einzellauf-Sperre, idempotente
  Markierung, Abbruch bei KI-Fehlern (Guthaben/Limit) mit sichtbarem
  Pausenzustand statt Endlosschleife.
- KI über das Lovable-AI-Gateway (`google/gemini-3.7-flash` für Texte),
  Aufrufe ausschließlich serverseitig.
- Worker-API bleibt unverändert kompatibel; `poll` liefert den fertigen Text im
  Job-Payload mit. README und Worker-Doku werden ergänzt.

## Was weiterhin dein Worker macht

Facebook-Login per Cookie, Klicks, Likes, Kommentare, DMs und das Einsammeln
eingehender Nachrichten. Ohne laufenden Worker plant die App weiter, es wird
aber nichts tatsächlich auf Facebook ausgeführt (außer im Simulationsmodus).
