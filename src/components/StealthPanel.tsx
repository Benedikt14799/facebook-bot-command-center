/**
 * Tarnung & Verhalten: Proxy-Verwaltung, Fingerprint-Profil, Browserstart
 * (Stealth oder Antidetect per CDP) und menschliche Verhaltensparameter.
 * Sensible Zugangsdaten laufen ueber Serverfunktionen und werden nie zurueckgelesen.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoHint } from "@/components/InfoHint";
import { toast } from "sonner";
import type { Bot } from "@/lib/db";
import { checkProxy, saveBotSecrets } from "@/lib/stealth.functions";
import {
  BEHAVIOR_PRESETS,
  FINGERPRINT_PRESETS,
  PROXY_TYPES,
  type Behavior,
  type Fingerprint,
  type ProxyCheck,
  fingerprintWarnings,
  normalizeAntidetect,
  normalizeBehavior,
  normalizeFingerprint,
  proxyRisk,
  stealthScore,
} from "@/lib/stealth";

type Props = {
  botId: string;
  form: Partial<Bot>;
  set: (patch: Partial<Bot>) => void;
};

const BEHAVIOR_FIELDS: { key: keyof Behavior; label: string; hint: string }[] = [
  { key: "type_delay_min", label: "Tippen min (ms)", hint: "Kürzeste Pause zwischen zwei Tastenanschlägen." },
  { key: "type_delay_max", label: "Tippen max (ms)", hint: "Längste Pause zwischen zwei Tastenanschlägen." },
  { key: "typo_chance", label: "Tippfehler-Rate", hint: "0.04 = bei etwa 4 % der Zeichen wird ein Fehler getippt und korrigiert." },
  { key: "pause_min", label: "Pause min (s)", hint: "Kürzeste Pause zwischen zwei Aktionen." },
  { key: "pause_max", label: "Pause max (s)", hint: "Längste Pause zwischen zwei Aktionen." },
  { key: "warmup_scroll_min", label: "Scroll min", hint: "Mindestanzahl Scroll-Schritte im Feed, bevor gehandelt wird." },
  { key: "warmup_scroll_max", label: "Scroll max", hint: "Höchstanzahl Scroll-Schritte vor der ersten Aktion." },
  { key: "idle_click_chance", label: "Leerlauf-Klick", hint: "Wahrscheinlichkeit für eine ziellose Mausbewegung (0–1)." },
  { key: "session_minutes_min", label: "Sitzung min (min)", hint: "Kürzeste Dauer einer Browsersitzung." },
  { key: "session_minutes_max", label: "Sitzung max (min)", hint: "Längste Dauer einer Browsersitzung." },
  { key: "break_minutes_min", label: "Pause min (min)", hint: "Kürzeste Pause zwischen zwei Sitzungen." },
  { key: "break_minutes_max", label: "Pause max (min)", hint: "Längste Pause zwischen zwei Sitzungen." },
  { key: "read_ms_per_char", label: "Lesezeit (ms/Zeichen)", hint: "Wartezeit vor dem Antworten, abhängig von der Textlänge." },
];

export function StealthPanel({ botId, form, set }: Props) {
  const f = form as Bot;
  const fp = normalizeFingerprint(f.fingerprint);
  const behavior = normalizeBehavior(f.behavior);
  const ad = normalizeAntidetect(f.antidetect);
  const risk = proxyRisk(f.proxy_type);
  const score = stealthScore(f);
  const check = (f.proxy_check ?? null) as ProxyCheck | null;
  const warnings = fingerprintWarnings(fp, f.proxy_country);

  const [proxyPassword, setProxyPassword] = useState("");
  const [antidetectKey, setAntidetectKey] = useState("");

  const saveSecrets = useServerFn(saveBotSecrets);
  const runCheck = useServerFn(checkProxy);

  const secrets = useMutation({
    mutationFn: () =>
      saveSecrets({
        data: {
          bot_id: botId,
          ...(proxyPassword ? { proxy_password: proxyPassword } : {}),
          ...(antidetectKey ? { antidetect_key: antidetectKey } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Zugangsdaten gespeichert");
      setProxyPassword("");
      setAntidetectKey("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const proxyCheck = useMutation({
    mutationFn: () => runCheck({ data: { bot_id: botId } }),
    onSuccess: (r) => {
      set({ proxy_check: r as never, proxy_checked_at: r.checked_at ?? null });
      toast.success(
        r.ok
          ? `${r.ip ?? "IP"} · ${r.country ?? "?"} · ${r.isp ?? ""}${r.hosting ? " · Rechenzentrum!" : ""}`
          : r.message || "Prüfung fehlgeschlagen",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFp = (patch: Partial<Fingerprint>) => set({ fingerprint: { ...fp, ...patch } as never });
  const setBehavior = (patch: Partial<Behavior>) =>
    set({ behavior: { ...behavior, ...patch } as never });

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          Netzwerk & Proxy
          <InfoHint text="Facebook bewertet die IP-Adresse. Server-IPs aus Rechenzentren führen fast immer zu Checkpoint oder Sperre. Nutze feste Anbieter-IPs (ISP) oder Mobilfunk-Proxys, passend zum Land des Accounts." />
        </h2>
        <p
          className={`mb-3 text-xs ${
            score.level === "kritisch"
              ? "text-destructive"
              : score.level === "mittel"
                ? "text-amber-500"
                : "text-emerald-500"
          }`}
        >
          Tarnstatus: {score.level}
          {score.reasons.length ? ` — ${score.reasons.join(" · ")}` : " — alles konsistent"}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proxy-Typ" hint={PROXY_TYPES.find((p) => p.value === f.proxy_type)?.hint ?? "Art des Proxys."}>
            <Select value={f.proxy_type ?? "none"} onValueChange={(v) => set({ proxy_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROXY_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Protokoll" hint="http oder socks5 — steht in den Zugangsdaten deines Proxy-Anbieters.">
            <Select value={f.proxy_protocol ?? "http"} onValueChange={(v) => set({ proxy_protocol: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["http", "https", "socks5"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Host" hint="Adresse des Proxy-Servers, z. B. de.isp-proxy.net.">
            <Input value={f.proxy_host ?? ""} onChange={(e) => set({ proxy_host: e.target.value })} />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={f.proxy_port ?? ""}
              onChange={(e) => set({ proxy_port: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Benutzer">
            <Input value={f.proxy_user ?? ""} onChange={(e) => set({ proxy_user: e.target.value })} />
          </Field>
          <Field label="Passwort" hint="Wird verschlüsselt gespeichert und nur vom Worker gelesen — es kann hier nie wieder angezeigt werden.">
            <Input
              type="password"
              value={proxyPassword}
              placeholder="•••••• (unverändert lassen)"
              onChange={(e) => setProxyPassword(e.target.value)}
            />
          </Field>
          <Field label="Land (ISO)" hint="Land, in dem die IP liegen soll — muss zum gewohnten Login-Ort des Accounts passen, z. B. DE.">
            <Input
              value={f.proxy_country ?? ""}
              placeholder="DE"
              onChange={(e) => set({ proxy_country: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Rotations-URL (optional)" hint="Bei Mobil-Proxys: Adresse, die einen IP-Wechsel auslöst. Wird nur zwischen Sitzungen aufgerufen, nie mitten in der Arbeit.">
            <Input
              value={f.proxy_rotate_url ?? ""}
              onChange={(e) => set({ proxy_rotate_url: e.target.value })}
            />
          </Field>
        </div>

        {risk === "high" ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Hohes Risiko: Ohne Proxy oder mit Rechenzentrums-IP erkennt Facebook den Zugriff sehr
            schnell. Empfohlen: Static Residential (ISP) oder Mobil-Proxy im Land des Accounts.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => secrets.mutate()} disabled={secrets.isPending || (!proxyPassword && !antidetectKey)}>
            Zugangsdaten speichern
          </Button>
          <Button size="sm" variant="outline" onClick={() => proxyCheck.mutate()} disabled={proxyCheck.isPending}>
            Proxy prüfen
          </Button>
          <span className="text-xs text-muted-foreground">
            {check
              ? `Letzte Prüfung (${check.source === "worker" ? "Worker" : "Cockpit"}): ${check.ip ?? "?"} · ${check.country ?? "?"} · ${check.isp ?? ""}${check.hosting ? " · Rechenzentrum" : ""}`
              : "Noch nicht geprüft"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Die Prüfung im Cockpit bewertet den Proxy-Endpunkt (Land, Anbieter, Hosting). Die echte
          Ausgangs-IP meldet zusätzlich der Worker bei jedem Sitzungsstart.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          Fingerprint & Browser
          <InfoHint text="Standard-Playwright verrät sich sofort (navigator.webdriver). Der Worker tarnt den Browser und nutzt für diesen Bot immer denselben Fingerprint — wechselnde Geräte-Merkmale wirken verdächtig." />
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorlage" hint="Setzt User-Agent, Plattform, Auflösung und Hardware in einem Rutsch auf eine stimmige Kombination.">
            <Select
              
              onValueChange={(v) => {
                const preset = FINGERPRINT_PRESETS.find((p) => p.id === v);
                if (preset) set({ fingerprint: preset.fp as never });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vorlage wählen…" />
              </SelectTrigger>
              <SelectContent>
                {FINGERPRINT_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Browserstart" hint="Stealth = getarntes Chromium des Workers. Antidetect = ein Profil aus AdsPower/Dolphin/GoLogin, das der Worker per CDP steuert.">
            <Select value={f.browser_mode ?? "stealth"} onValueChange={(v) => set({ browser_mode: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stealth">Stealth-Chromium</SelectItem>
                <SelectItem value="antidetect">Antidetect per CDP</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plattform">
            <Input value={fp.platform} onChange={(e) => setFp({ platform: e.target.value })} />
          </Field>
          <Field label="Sprache">
            <Input value={fp.locale} onChange={(e) => setFp({ locale: e.target.value })} />
          </Field>
          <Field label="Zeitzone" hint="Muss zum Proxy-Land passen — sonst fällt der Widerspruch auf.">
            <Input value={fp.timezone} onChange={(e) => setFp({ timezone: e.target.value })} />
          </Field>
          <Field label="Breite × Höhe">
            <div className="flex gap-2">
              <Input type="number" value={fp.width} onChange={(e) => setFp({ width: Number(e.target.value) })} />
              <Input type="number" value={fp.height} onChange={(e) => setFp({ height: Number(e.target.value) })} />
            </div>
          </Field>
          <Field label="RAM (GB)">
            <Input type="number" value={fp.device_memory} onChange={(e) => setFp({ device_memory: Number(e.target.value) })} />
          </Field>
          <Field label="CPU-Kerne">
            <Input
              type="number"
              value={fp.hardware_concurrency}
              onChange={(e) => setFp({ hardware_concurrency: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="User-Agent" hint="Muss exakt zu Plattform, Auflösung und Zeitzone passen.">
            <Input className="font-mono text-xs" value={fp.user_agent} onChange={(e) => setFp({ user_agent: e.target.value })} />
          </Field>
        </div>
        {warnings.length ? (
          <ul className="mt-3 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-emerald-500">Fingerprint ist in sich stimmig.</p>
        )}

        {f.browser_mode === "antidetect" ? (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Anbieter" hint="Antidetect-Tool, das lokal auf dem Worker-Rechner läuft.">
              <Select value={ad.provider} onValueChange={(v) => set({ antidetect: { ...ad, provider: v } as never })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adspower">AdsPower</SelectItem>
                  <SelectItem value="dolphin">Dolphin{"{anty}"}</SelectItem>
                  <SelectItem value="gologin">GoLogin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lokale API-URL" hint="Adresse der lokalen API des Tools, z. B. http://127.0.0.1:50325.">
              <Input value={ad.api_url} onChange={(e) => set({ antidetect: { ...ad, api_url: e.target.value } as never })} />
            </Field>
            <Field label="Profil-ID" hint="ID des Browserprofils im Antidetect-Tool, das zu diesem Bot gehört.">
              <Input value={ad.profile_id} onChange={(e) => set({ antidetect: { ...ad, profile_id: e.target.value } as never })} />
            </Field>
            <Field label="API-Schlüssel" hint="Nur bei Anbietern nötig, die einen Token verlangen. Wird serverseitig gespeichert.">
              <Input
                type="password"
                value={antidetectKey}
                placeholder="•••••• (unverändert lassen)"
                onChange={(e) => setAntidetectKey(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                Rückfall auf Stealth-Chromium
                <InfoHint text="Wenn das Antidetect-Profil nicht startet, arbeitet der Worker mit dem getarnten Chromium weiter statt den Auftrag scheitern zu lassen." />
              </span>
              <Switch
                checked={ad.fallback_stealth}
                onCheckedChange={(v) => set({ antidetect: { ...ad, fallback_stealth: v } as never })}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
          Menschliches Verhalten
          <InfoHint text="Der Worker nutzt ausschließlich Zufallswerte innerhalb dieser Bereiche: Tippgeschwindigkeit, Pausen, Scrollen, Sitzungslängen und Lesezeit. Feste Intervalle sind das deutlichste Bot-Signal." />
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(BEHAVIOR_PRESETS) as (keyof typeof BEHAVIOR_PRESETS)[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant="outline"
              onClick={() => set({ behavior: BEHAVIOR_PRESETS[key] as never })}
            >
              Preset: {key}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BEHAVIOR_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <Input
                type="number"
                step="any"
                value={behavior[field.key]}
                onChange={(e) => setBehavior({ [field.key]: Number(e.target.value) } as Partial<Behavior>)}
              />
            </Field>
          ))}
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {hint ? <InfoHint text={hint} /> : null}
      </Label>
      {children}
    </div>
  );
}
