# Worker-Schnellstart

In zehn Minuten vom leeren Rechner zum laufenden Worker.

## 1. Worker im Cockpit anlegen

1. Menü **Worker** öffnen, Namen eingeben, **Anlegen**.
2. **Neuen Schlüssel erzeugen** klicken. Der Schlüssel (`fbc_…`) wird genau
   einmal angezeigt — sofort kopieren.
3. **Worker-Skript herunterladen** — das Skript enthält **keinen** Schlüssel.
4. Bot im Cockpit dem Worker zuordnen. Ohne Zuordnung bekommt der Worker weder
   Aufträge noch Sitzungsdaten (`forbidden`).
5. Standard ist **Probebetrieb**. Erst mit **Echtbetrieb freigeben** darf der
   Worker echte Aktionen ausführen und `done` melden.

Schlüsselwechsel: erst einen neuen Schlüssel erzeugen und lokal eintragen, dann
den alten **Widerrufen**. So sperrst du dich nie aus.

## 2. Voraussetzungen lokal

```bash
pip install requests playwright
playwright install chromium

export FB_CONTROL_BASE_URL="https://project--<projekt-id>.lovable.app"
export FB_CONTROL_WORKER_TOKEN="<Schlüssel aus dem Cockpit>"
export FB_CONTROL_BOT_ID="<optional>"
export FB_CONTROL_MODE="dry_run"       # dry_run (Standard) oder live

python fbcontrol_worker.py
```

Der Schlüssel steht ausschließlich in der Umgebung, nie im Skript, nie im Repo.

## 3. Verbindung testen

```bash
BASE=https://project--<projekt-id>.lovable.app
curl -s -X POST "$BASE/api/public/worker/heartbeat" \
  -H "x-worker-token: fbc_…" -H "content-type: application/json" \
  -d '{"version":"3.0.0","contract_version":"1.0","capabilities":["like"]}'
```

Erwartet: `{"ok":true,…}`. Bei `{"error":{"code":"unauthorized"…}}` stimmt der
Schlüssel nicht oder er wurde widerrufen.

Wichtig: Die Vorschauadresse (`id-preview--…`) ist geschützt. Für Worker immer
`https://project--<projekt-id>.lovable.app` oder die veröffentlichte Adresse
verwenden.

## 4. Abnahme mit Testdaten

1. Menü **Testdaten** → **26 Testaufträge anlegen**.
2. Worker laufen lassen oder manuell abholen:
   `POST /poll {"limit":25}` → höchstens 25 Aufträge, `limit` und `max_limit`
   stehen in der Antwort.
3. Im Probebetrieb meldet der Worker `{"status":"skipped","error_code":"DRY_RUN",
   "result":{"verified":false}}` — es passiert nichts auf der Plattform.
4. Erst nach Freigabe: `{"job_id":"…","status":"done","result":{"verified":true}}`.
4. Danach **Aufräumen** klicken — es werden ausschließlich die Daten dieser
   Testreihe gelöscht.

## 5. Typische Fehler

| Antwort                           | Ursache                                        |
| --------------------------------- | ---------------------------------------------- |
| `unauthorized`                    | Schlüssel falsch, widerrufen oder Worker gelöscht |
| `verification_required`           | `result.verified` fehlt oder ist nicht `true`  |
| `status_mismatch` / `conflict`    | Auftrag läuft nicht mehr oder gehört anderem Worker |
| `invalid_payload` bei `limit`     | `limit` ist keine ganze Zahl von 1 bis 25      |
| `invalid_json`                    | Body ist kein JSON-Objekt                      |
| `forbidden`                       | Bot ist diesem Worker nicht zugeordnet         |
| `dry_run_mode`                    | `done` ohne Freigabe für den Echtbetrieb       |
| `server_error` beim Speichern     | Verschlüsselung nicht eingerichtet             |

Ein Lebenszeichen älter als 90 Sekunden gilt als offline — dann werden keine
Aufträge mehr vergeben.

Alle Details stehen in `WORKER_CONTRACT.md`.
