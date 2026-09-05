# Worker-Schnellstart

In zehn Minuten vom leeren Rechner zum laufenden Worker.

## 1. Worker im Cockpit anlegen

1. Menü **Worker** öffnen, Namen eingeben, **Anlegen**.
2. **Neuen Schlüssel erzeugen** klicken. Der Schlüssel (`fbc_…`) wird genau
   einmal angezeigt — sofort kopieren.
3. Optional **Worker-Skript herunterladen** — es enthält Adresse und Schlüssel.

Schlüsselwechsel: erst einen neuen Schlüssel erzeugen und lokal eintragen, dann
den alten **Widerrufen**. So sperrst du dich nie aus.

## 2. Voraussetzungen lokal

```bash
pip install requests playwright
playwright install chromium
python fbcontrol_worker.py
```

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
3. Ergebnis melden: `{"job_id":"…","status":"done","result":{"verified":true}}`.
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

Alle Details stehen in `WORKER_CONTRACT.md`.
