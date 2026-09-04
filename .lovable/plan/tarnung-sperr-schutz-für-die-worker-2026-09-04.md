# Tarnung & Sperr-Schutz für die Worker

Ziel: Das Sperr-Risiko bei Facebook deutlich senken — durch saubere Proxy-Verwaltung, getarnte Browser-Fingerprints, optionale Antidetect-Anbindung und menschlich wirkendes Verhalten. Alles pro Bot einstellbar und im Cockpit sichtbar.

## 1. Proxy-Verwaltung pro Bot

Auf der Bot-Detailseite ein eigener Bereich "Netzwerk & Proxy" mit strukturierten Feldern:

- Typ: Static Residential (ISP), Mobil (4G/5G), Rechenzentrum, kein Proxy
- Protokoll (http/socks5), Host, Port, Benutzer, Passwort
- Land/Region (soll zum gewohnten Login-Ort des Accounts passen)
- Optionale Rotations-URL (bei Mobil-Proxys für IP-Wechsel zwischen Sitzungen)

Warnhinweise direkt in der Oberfläche:

- Rot bei "Rechenzentrum" oder "kein Proxy": hohes Sperr-Risiko
- Gelb, wenn Proxy-Land nicht zum eingestellten Bot-Land/der Zeitzone passt
- Passwörter werden nur serverseitig gelesen (wie die Session-Cookies), der Browser bekommt sie nicht zurück

## 2. Proxy-Prüfung (zweifach)

- **Im Worker:** Beim Start jeder Sitzung ermittelt der Worker über den Proxy die Ausgangs-IP und meldet IP, Land, Anbieter und Typ ans Cockpit. Erkennt er Rechenzentrum oder ein abweichendes Land, wird ein Warn-Ereignis erzeugt; bei "Rechenzentrum" kann der Bot optional automatisch pausiert werden.
- **Im Cockpit:** Button "Proxy prüfen" auf der Bot-Seite. Der Server verbindet sich testweise über den Proxy, ruft einen IP-Infodienst ab und zeigt Ergebnis (IP, Land, Anbieter, Typ, Antwortzeit) samt Bewertung an. Letztes Prüfergebnis wird gespeichert und in der Bot-Liste und auf der Worker-Health-Seite angezeigt.

## 3. Fingerprint & Browserstart

Pro Bot ein Fingerprint-Profil, das dauerhaft gleich bleibt (wichtig: nicht bei jedem Start neu würfeln):

- Plattform (Windows/macOS/Android), User-Agent, Bildschirmauflösung, Gerätespeicher, CPU-Kerne
- Sprache, Zeitzone, Standort — konsistent zum Proxy-Land
- Konsistenzprüfung im Cockpit: warnt, wenn User-Agent, Plattform und Zeitzone nicht zusammenpassen

Browserstart im Worker in zwei Varianten, pro Bot wählbar:

- **Stealth-Chromium (Standard):** Playwright mit persistentem Nutzerprofil je Bot, `playwright-stealth`-artigen Patches (webdriver-Flag, Plugins, Sprachen, WebGL-Anbieter), Proxy und Fingerprint aus dem Cockpit.
- **Antidetect per CDP (optional):** Felder für Anbieter (AdsPower, Dolphin{anty}, GoLogin), lokale API-URL, API-Schlüssel und Profil-ID. Der Worker startet das Profil über die lokale API und verbindet sich per CDP. Fällt der Start aus, greift automatisch Stealth-Chromium als Rückfallebene (abschaltbar).

## 4. Menschliches Verhalten (pro Bot einstellbar)

Neuer Bereich "Verhalten" mit sinnvollen Voreinstellungen:

- Tippgeschwindigkeit: Bereich in Millisekunden pro Anschlag, gelegentliche Tippfehler mit Korrektur
- Pausen zwischen Aktionen: Min/Max in Sekunden statt fester Werte
- Aufwärmen einer Sitzung: vor der ersten Aktion Feed scrollen, Verweildauer, gelegentlicher Klick ohne Ziel
- Sitzungslänge und Pause zwischen Sitzungen
- Lesezeit vor dem Antworten (abhängig von der Textlänge)

Der Worker liest diese Werte aus der Session-Antwort und verwendet ausschließlich Zufallswerte innerhalb der Bereiche. Es gibt einen Presets-Umschalter: vorsichtig / normal / zügig.

## 5. Worker-Skript neu

Das herunterladbare Python-Skript wird deutlich ausgebaut:

- Proxy, Fingerprint und Verhaltensprofil werden vom Cockpit geholt und angewendet
- Persistentes Browserprofil je Bot, Cookies aus dem Cockpit
- Menschliche Hilfsfunktionen: `human_type`, `human_pause`, `human_scroll`, `read_delay`
- Antidetect-Start per CDP inklusive Rückfall auf Stealth
- IP-Check beim Sitzungsstart mit Meldung ans Cockpit
- Erkennung von Checkpoint-/Sperrseiten: sofortiger Abbruch, `blocked`-Ereignis ans Cockpit (pausiert den Bot bereits automatisch)

## 6. Sichtbarkeit im Cockpit

- Bot-Liste: Ampel für Tarnstatus (Proxy-Typ, Fingerprint-Konsistenz, letzter IP-Check)
- Worker-Health-Seite: Abschnitt "Tarnung" mit IP je Bot, Land, Proxy-Typ, letztem Check und Warnungen
- Erklärungs-Buttons (Hover) an allen neuen Feldern, wie im restlichen Cockpit

## Technische Umsetzung

- Migration: `bots` erhält `proxy_type`, `proxy_protocol`, `proxy_host`, `proxy_port`, `proxy_user`, `proxy_password`, `proxy_country`, `proxy_rotate_url`, `fingerprint` (JSONB), `behavior` (JSONB), `browser_mode`, `antidetect` (JSONB), `proxy_check` (JSONB, letztes Ergebnis). Das alte Textfeld `proxy` bleibt als Altbestand erhalten und wird einmalig übernommen.
- RLS: sensible Spalten (Proxy-Passwort, Antidetect-Schlüssel) werden dem Browser nicht ausgeliefert — Lesen/Schreiben laufen über Serverfunktionen mit `requireSupabaseAuth`; der Worker erhält sie über `/api/public/worker/session`.
- Neue Serverfunktion `checkProxy` (Fetch über den Proxy auf einen IP-Infodienst, Ergebnisbewertung, Speichern in `proxy_check`).
- Neuer Worker-Endpunkt `/api/public/worker/ip-report` für den IP-Check aus dem Worker; `session` liefert zusätzlich Proxy, Fingerprint, Verhalten und Antidetect-Konfiguration.
- `src/lib/worker-script.ts` wird ersetzt; `src/lib/stealth.ts` enthält Fingerprint-Vorlagen, Verhaltens-Presets und die Konsistenzprüfung.
- `WORKER_INTEGRATION.md` und `README.md` werden um Proxy-Empfehlungen, Antidetect-Anbindung und Verhaltensparameter ergänzt.

## Hinweis

Proxys selbst kann die App nicht bereitstellen — du brauchst einen Anbieter für Static-Residential- oder Mobil-Proxys. Die App verwaltet, prüft und verwendet sie dann konsequent.
