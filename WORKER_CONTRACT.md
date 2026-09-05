# Worker-Vertrag Version 1.0

Verbindliche Schnittstelle zwischen dem Cockpit (FB/Control) und einem externen
Worker. Alle Beispielwerte sind synthetisch — echte Schlüssel, Cookies oder
Produktiv-IDs gehören nicht in Dokumentation.

## Grundregeln

1. Der Worker greift **niemals** direkt auf die Datenbank zu. Jede Änderung
   läuft über die hier beschriebenen Endpunkte.
2. Berechtigungen, erlaubte Bots, Fähigkeiten und der wirksame Modus werden
   **ausschließlich serverseitig** ermittelt. Angaben des Workers sind Hinweise,
   keine Freischaltung.
3. Technische Werte sind englisch. Deutsche Begriffe erscheinen nur in der
   Oberfläche.

## Authentifizierung

Header: `x-worker-token: fbc_…` (alternativ `Authorization: Bearer fbc_…`).

- Gespeichert wird nur ein SHA-256-Hash des Schlüssels — er kann nicht
  zurückgerechnet werden.
- Pro Worker sind mehrere gültige Schlüssel möglich (überlappende Rotation).
  Der alte Schlüssel bleibt gültig, bis er im Cockpit widerrufen wird.
- Fehler sind immer JSON:

```json
{ "error": { "code": "unauthorized", "message": "Invalid worker token" } }
```

## Zustände

| Zustand     | Bedeutung                      |
| ----------- | ------------------------------ |
| `pending`   | offen, wartet auf Abholung     |
| `running`   | von einem Worker abgeholt      |
| `done`      | erfolgreich, verifiziert       |
| `failed`    | fehlgeschlagen                 |
| `skipped`   | bewusst übersprungen           |
| `cancelled` | im Cockpit abgebrochen         |

`claimed` existiert nicht. Erlaubte Übergänge:
`pending → running | cancelled | failed`, `running → done | failed | skipped | cancelled`.
Endzustände sind unveränderlich.

Sitzungszustände eines Bots: `missing`, `ok`, `expired`, `needs_login`,
`checkpoint`, `captcha`, `revoked`. Bei allen außer `missing`/`ok` werden keine
Aufträge ausgeliefert.

Fähigkeiten: `like`, `comment`, `scan`, `dm`, `reply`.

## Endpunkte

Basis: `https://project--<projekt-id>.lovable.app/api/public/worker`

### POST /heartbeat

```json
{
  "version": "3.0.0",
  "contract_version": "1.0",
  "capabilities": ["like", "comment", "dm"],
  "mode": "live",
  "bot_id": "11111111-1111-4111-8111-111111111111"
}
```

Antwort:

```json
{
  "ok": true,
  "worker_id": "22222222-2222-4222-8222-222222222222",
  "contract_version": "1.0",
  "server_time": "2026-01-01T10:00:00.000Z",
  "effective_mode": "dry_run",
  "effective_capabilities": ["like"],
  "allowed_bot_ids": []
}
```

`effective_mode` und `effective_capabilities` sind maßgeblich — der Worker kann
sich nicht selbst auf `live` setzen.

### POST /poll

```json
{ "limit": 5, "bot_id": "11111111-1111-4111-8111-111111111111" }
```

- `limit`: optional, ganze Zahl 1–25, Standard 5. Alles andere → HTTP 400.
- Das Abholen läuft in der Datenbank mit `FOR UPDATE SKIP LOCKED`: zwei
  parallele Worker erhalten nie denselben Auftrag.
- Ungültige Aufträge werden vorher auf `failed` gesetzt und nie ausgeliefert.
- Es werden nur Bots berücksichtigt, die dem Worker zugeordnet sind (oder alle,
  wenn keine Zuordnung besteht), die nicht pausiert und nicht im manuellen Modus
  sind und deren Sitzung nicht gesperrt ist.

Antwort: `{ "contract_version", "jobs": [...], "bots": [...], "limit", "max_limit": 25 }`.

### POST /result

```json
{
  "job_id": "33333333-3333-4333-8333-333333333333",
  "status": "done",
  "result": { "verified": true, "liked": 3 }
}
```

- Erlaubt: `done`, `failed`, `skipped`.
- `done` verlangt `result.verified === true` (exakt boolesch, nicht `"true"`
  oder `1`) — sonst HTTP 400 `verification_required`.
- Angenommen nur, wenn der Auftrag `running` ist **und** `claimed_by` genau
  diesem Worker entspricht (sonst 409 bzw. 403).
- Wiederholte identische Meldung eines abgeschlossenen Auftrags: HTTP 200 mit
  `"unchanged": true`. Abweichender Status → 409 `status_mismatch`, abweichender
  Inhalt → 409 `result_mismatch`.
- Nebenwirkungen (Kontaktakte, Stufen) werden je Auftrag nur einmal geschrieben.

### GET /session?bot_id=…

Liefert Cookies, User-Agent, Proxy, Fingerprint, Verhalten und Antidetect-Daten.
Fehlt eine Sitzung, kommt HTTP 200 mit leeren Werten. Cookies und Passwörter
liegen mit AES-256-GCM verschlüsselt in der Datenbank; der Schlüssel kommt
ausschließlich aus dem Secret-Management (`WORKER_SECRETS_KEY_V1`) und ist
über die Schlüsselkennung rotierbar.

### POST /session

```json
{ "bot_id": "1111…", "cookies": [], "user_agent": "…", "status": "ok" }
```

`status` muss ein gültiger Sitzungszustand sein, sonst HTTP 400.

### POST /events, /messages, /recipients, /ip-report

- `events`: `{ "level", "type", "message", "bot_id", "meta" }`. Checkpoint,
  CAPTCHA, Sperre oder Login-Bedarf schalten den Bot sofort in den manuellen
  Modus.
- `messages`: dieselbe `external_id` erzeugt keine zweite Nachricht
  (`{ "ok": true, "unchanged": true }`).
- `ip-report`: meldet die tatsächliche Ausgangs-IP; Rechenzentrums-IPs pausieren
  den Bot.

## JSON-Regeln

- Leerer Body = `{}`.
- Kaputtes JSON, Listen, Zahlen, Texte oder `null` → HTTP 400
  `{ "error": { "code": "invalid_json", … } }`.

## Fehlercodes

`unauthorized`, `forbidden`, `invalid_json`, `invalid_payload`, `not_found`,
`conflict`, `status_mismatch`, `result_mismatch`, `verification_required`,
`server_error`.


## Nachtrag Version 1.1 — Sicherheitsrunde

- **Schlüssel:** nur als Umgebungsvariable (`FB_CONTROL_WORKER_TOKEN`).
  Downloads und Beispiele enthalten niemals einen echten Schlüssel.
- **Betriebsart:** Standard `dry_run`. `live` gilt nur, wenn der Server
  `live_enabled` **und** `mode = live` für diesen Worker gesetzt hat. Die
  Angabe des Workers ist unverbindlich; `effective_mode` in der Antwort von
  `heartbeat` und `poll` ist maßgeblich.
- **Probebetrieb:** Ergebnis `skipped` mit `error_code = DRY_RUN` und
  `result.verified = false`. Keine Nachrichten, keine Kontaktakten.
- **`done`:** nur bei `result.verified === true` und nur von einem für den
  Echtbetrieb freigegebenen Worker (sonst `dry_run_mode`, HTTP 409).
- **Bot-Bindung:** Jeder Zugriff mit `bot_id` (session, events, messages,
  recipients, ip-report, unlock, result) prüft `worker_bots`; fremder Bot →
  HTTP 403 `forbidden`.
- **Abholen:** `claim_jobs` verlangt zusätzlich ein Lebenszeichen der letzten
  90 Sekunden, eine bestehende Worker-Bot-Zuordnung und das Arbeitszeitfenster
  des Bots (`active_from`/`active_to` in der Zeitzone des Bots).
- **Geheimnisse:** Cookies, Proxy-Passwörter und Antidetect-Schlüssel werden
  immer verschlüsselt gespeichert (AES-GCM, Schlüssel aus dem Secret-Management,
  `enc_key_id` für Rotation). Fehlt der Schlüssel → `server_error`, kein Klartext.
  Altbestand wird über den wiederholbaren Lauf **Alte Zugangsdaten verschlüsseln**
  auf der Worker-Seite nachgezogen.
- **Idempotenz:** Datenbank-Eindeutigkeit verhindert doppelte Nachrichten
  (`messages`) und doppelte Kontaktakten (`contact_events`) zum selben Auftrag.
- **Fehlerformat:** immer `{"error":{"code":"…","message":"…"}}`.
- **`follow_up`:** wird nicht mehr angelegt oder ausgeliefert; historische
  Datensätze bleiben lesbar.
