/**
 * Bot-Detailseite: Steuerung eines einzelnen Profils - Status, Aufwaermphase,
 * Arbeitszeiten, Jitter, Tages-Caps, Textmodus/Tonfall und Cookie-Session.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fmt, type Bot } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bots/$botId")({
  head: () => ({
    meta: [
      { title: "Bot-Details — FB/Control" },
      { name: "description", content: "Warmup, Zeitfenster, Limits, Tonfall und Cookie-Session eines Bots." },
      { property: "og:title", content: "Bot-Details — FB/Control" },
      { property: "og:description", content: "Warmup, Zeitfenster, Limits und Cookie-Session eines Bots." },
    ],
  }),
  component: BotDetail,
});

function BotDetail() {
  const { botId } = Route.useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Bot>>({});
  const [cookies, setCookies] = useState("");
  const [userAgent, setUserAgent] = useState("");

  const bot = useQuery({
    queryKey: ["bot", botId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bots").select("*").eq("id", botId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (bot.data) setForm(bot.data);
  }, [bot.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { id, user_id, created_at, updated_at, ...patch } = form as Bot;
      const { error } = await supabase.from("bots").update(patch).eq("id", botId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["bot", botId] });
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSession = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(cookies);
      } catch {
        throw new Error("Cookies müssen gültiges JSON sein (Array aus Cookie-Objekten).");
      }
      const { error } = await supabase
        .from("bot_sessions")
        .upsert(
          { bot_id: botId, cookies: parsed as never, user_agent: userAgent || null },
          { onConflict: "bot_id" },
        );
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("bots")
        .update({ session_status: "ok", session_updated_at: new Date().toISOString() })
        .eq("id", botId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Session hinterlegt");
      setCookies("");
      qc.invalidateQueries({ queryKey: ["bot", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bot_sessions").delete().eq("bot_id", botId);
      if (error) throw error;
      await supabase.from("bots").update({ session_status: "missing" }).eq("id", botId);
    },
    onSuccess: () => {
      toast.success("Session gelöscht");
      qc.invalidateQueries({ queryKey: ["bot", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!bot.data) {
    return (
      <AppShell title="Bot">
        <p className="text-sm text-muted-foreground">Lade…</p>
      </AppShell>
    );
  }

  const f = form as Bot;
  const set = (patch: Partial<Bot>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <AppShell
      title={bot.data.name}
      subtitle={`Session ${bot.data.session_status} · zuletzt gesehen ${fmt(bot.data.last_seen_at)}`}
      actions={
        <>
          <StatusBadge value={bot.data.paused ? "paused" : bot.data.status} />
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Profil <InfoHint text="Stammdaten des Bots: Name, Facebook-Profil, optionaler Proxy und Notizen." /></h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="FB-Profilname" hint="Der Name, wie er auf Facebook angezeigt wird — hilft beim Zuordnen von Nachrichten.">
              <Input
                value={f.fb_profile_name ?? ""}
                onChange={(e) => set({ fb_profile_name: e.target.value })}
              />
            </Field>
            <Field label="Profil-URL">
              <Input
                value={f.profile_url ?? ""}
                onChange={(e) => set({ profile_url: e.target.value })}
              />
            </Field>
            <Field label="Proxy" hint="Optionale Proxy-Adresse, damit jedes Profil über eine eigene IP arbeitet. Reduziert das Risiko, dass Facebook Profile verknüpft.">
              <Input value={f.proxy ?? ""} onChange={(e) => set({ proxy: e.target.value })} />
            </Field>
            <Field label="Status" hint="live = arbeitet normal, warmup = eingeschränkter Aufwärmbetrieb, paused = pausiert, blocked = von Facebook eingeschränkt.">
              <Select value={f.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["warmup", "live", "paused", "blocked"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Warmup-Start" hint="Startdatum der Aufwärmphase. Je jünger, desto vorsichtiger arbeitet der Bot (weniger Aktionen pro Tag).">
              <Input
                type="date"
                value={f.warmup_start ?? ""}
                onChange={(e) => set({ warmup_start: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="text-sm text-foreground">Not-Aus (pausiert)</span>
            <Switch checked={!!f.paused} onCheckedChange={(v) => set({ paused: v })} />
          </div>
          <div className="mt-2 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="text-sm text-foreground">Texte vor Versand freigeben</span>
            <Switch
              checked={!!f.require_approval}
              onCheckedChange={(v) => set({ require_approval: v })}
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Zeitplan & Limits <InfoHint text="Arbeitsfenster, Zufalls-Jitter, Wochenendfaktor und Tages-Caps. So verhält sich der Bot menschlich und wird seltener von Facebook gesperrt." /></h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Aktiv von" hint="Beginn des täglichen Arbeitsfensters, z. B. 08:00 — außerhalb passiert nichts.">
              <Input
                type="time"
                value={(f.active_from ?? "").slice(0, 5)}
                onChange={(e) => set({ active_from: `${e.target.value}:00` })}
              />
            </Field>
            <Field label="Aktiv bis" hint="Ende des Arbeitsfensters, z. B. 22:00.">
              <Input
                type="time"
                value={(f.active_to ?? "").slice(0, 5)}
                onChange={(e) => set({ active_to: `${e.target.value}:00` })}
              />
            </Field>
            <Field label="Zeitzone" hint="Zeitzone, in der die Arbeitszeiten gelten (z. B. Europe/Berlin).">
              <Input value={f.timezone ?? ""} onChange={(e) => set({ timezone: e.target.value })} />
            </Field>
            <Field label="Jitter (Minuten)" hint="Zufällige Verschiebung jeder Aktion in Minuten, damit kein maschinelles Muster entsteht.">
              <Input
                type="number"
                value={f.jitter_minutes ?? 0}
                onChange={(e) => set({ jitter_minutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Wochenend-Faktor" hint="Multiplikator für Wochenenden, z. B. 0.6 = 40 % weniger Aktionen.">
              <Input
                type="number"
                step="0.1"
                value={String(f.weekend_factor ?? 0.5)}
                onChange={(e) => set({ weekend_factor: Number(e.target.value) })}
              />
            </Field>
            <Field label="Cap Likes / Tag" hint="Maximale Likes pro Tag für dieses Profil.">
              <Input
                type="number"
                value={f.cap_likes ?? 0}
                onChange={(e) => set({ cap_likes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Cap Kommentare / Tag" hint="Maximale Kommentare pro Tag für dieses Profil.">
              <Input
                type="number"
                value={f.cap_comments ?? 0}
                onChange={(e) => set({ cap_comments: Number(e.target.value) })}
              />
            </Field>
            <Field label="Cap DMs / Tag" hint="Maximale Direktnachrichten pro Tag. Bei neuen Profilen niedrig halten.">
              <Input
                type="number"
                value={f.cap_dms ?? 0}
                onChange={(e) => set({ cap_dms: Number(e.target.value) })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Textgenerierung <InfoHint text="Vorlagen, KI oder beides. Der Tonfall steuert, wie die Texte klingen — damit sie nicht nach KI wirken." /></h2>
          <div className="grid gap-3">
            <Field label="Modus" hint="Vorlagen = feste Textbausteine, KI = generierte Texte, beides = Vorlage als Grundlage, KI variiert sie.">
              <Select value={f.text_mode} onValueChange={(v) => set({ text_mode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Nur Vorlagen</SelectItem>
                  <SelectItem value="ai">Nur KI</SelectItem>
                  <SelectItem value="both">Beides gemischt</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tonfall / Schreibstil" hint="Beschreibe, wie der Bot schreiben soll — knapp, locker, ohne Emojis usw. Wichtig, damit es nicht nach KI klingt.">
              <Textarea
                rows={4}
                value={f.tone ?? ""}
                placeholder="locker, kurze Sätze, keine Emojis, Du-Form…"
                onChange={(e) => set({ tone: e.target.value })}
              />
            </Field>
            <Field label="Notizen">
              <Textarea
                rows={3}
                value={f.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">Cookie-Session <InfoHint text="Du meldest dich manuell bei Facebook an, exportierst die Cookies und fügst sie hier ein. Sie werden verschlüsselt gespeichert und nur vom Worker gelesen, nie im Browser angezeigt." /></h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Melde dich manuell im Browser an, exportiere die Facebook-Cookies als JSON-Array und
            füge sie hier ein. Aus Sicherheitsgründen können hinterlegte Cookies nicht wieder
            ausgelesen werden — nur dein Worker liest sie serverseitig.
          </p>
          <Field label="Cookies (JSON)" hint="Cookies aus deinem eingeloggten Browser exportieren und hier einfügen. Damit übernimmt der Worker deine Facebook-Sitzung, ohne Passwort.">
            <Textarea
              rows={7}
              className="font-mono text-xs"
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder='[{"name":"c_user","value":"…","domain":".facebook.com"}]'
            />
          </Field>
          <div className="mt-3">
            <Field label="User-Agent (optional)" hint="Browser-Kennung deines echten Browsers. Gleich lassen wie beim Cookie-Export, sonst wirkt der Login verdächtig.">
              <Input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => saveSession.mutate()}
              disabled={!cookies || saveSession.isPending}
            >
              Session speichern
            </Button>
            <Button size="sm" variant="outline" onClick={() => clearSession.mutate()}>
              Session löschen
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Stand: {fmt(bot.data.session_updated_at)}
          </p>
        </section>
      </div>
    </AppShell>
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
