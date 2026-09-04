/**
 * Freischaltung: Bots, die wegen Checkpoint, CAPTCHA, Sperre oder abgelaufener
 * Sitzung im manuellen Modus stehen, wieder startklar machen.
 *
 * Zwei Wege:
 *  A) Worker-Fenster: der Worker oeffnet ein sichtbares Browserfenster mit
 *     demselben Profil/Proxy, du meldest dich an, danach speichert der Worker
 *     die Cookies automatisch zurueck.
 *  B) Cookies einspielen: du exportierst die Cookies aus deinem eigenen
 *     Browser und fuegst sie hier ein.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/db";
import {
  cancelUnlock,
  releaseManualMode,
  requestUnlock,
  saveSessionCookies,
} from "@/lib/unlock.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/unlock")({
  head: () => ({
    meta: [
      { title: "Freischaltung — FB/Control" },
      {
        name: "description",
        content: "Bots nach Checkpoint, CAPTCHA oder abgelaufener Sitzung wieder freischalten.",
      },
      { property: "og:title", content: "Freischaltung — FB/Control" },
      {
        property: "og:description",
        content: "Bots nach Checkpoint, CAPTCHA oder abgelaufener Sitzung wieder freischalten.",
      },
    ],
  }),
  component: UnlockPage,
});

const UNLOCK_LABEL: Record<string, string> = {
  idle: "nichts zu tun",
  needed: "Freischaltung nötig",
  requested: "Fenster angefordert",
  open: "Fenster offen — bitte anmelden",
};

function UnlockPage() {
  const qc = useQueryClient();

  const bots = useQuery({
    queryKey: ["unlock-bots"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bots")
        .select("*")
        .order("manual_since", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = (bots.data ?? []) as Record<string, unknown>[];
  const needing = list.filter(
    (b) => b["manual_mode"] === true || b["session_status"] === "needs_login",
  );
  const rest = list.filter((b) => !needing.includes(b));

  return (
    <AppShell
      title="Freischaltung"
      subtitle="Sitzungen wiederherstellen und Bots aus dem manuellen Modus holen"
      hint="Sobald Facebook einen Checkpoint, ein CAPTCHA oder einen neuen Login verlangt, stoppt der Bot automatisch alle Aktionen. Hier meldest du dich einmal von Hand an — danach werden die Cookies wieder gespeichert und der Bot kann weiterarbeiten."
    >
      <div className="space-y-4">
        {needing.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Aktuell steht kein Bot im manuellen Modus. Alles läuft.
          </p>
        ) : (
          needing.map((b) => (
            <BotUnlockCard key={String(b["id"])} bot={b} onDone={() => qc.invalidateQueries()} />
          ))
        )}

        {rest.length > 0 ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              Weitere Bots
              <InfoHint text="Diese Bots laufen normal. Du kannst trotzdem vorsorglich neue Cookies einspielen." />
            </h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {rest.map((b) => (
                <li key={String(b["id"])} className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{String(b["name"])}</span>
                  <span>Sitzung: {String(b["session_status"] ?? "unbekannt")}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function BotUnlockCard({
  bot,
  onDone,
}: {
  bot: Record<string, unknown>;
  onDone: () => void;
}) {
  const botId = String(bot["id"]);
  const state = String(bot["unlock_state"] ?? "needed");
  const [cookies, setCookies] = useState("");
  const [ua, setUa] = useState("");

  const ask = useServerFn(requestUnlock);
  const stop = useServerFn(cancelUnlock);
  const save = useServerFn(saveSessionCookies);
  const release = useServerFn(releaseManualMode);

  const wrap = <T,>(fn: (v: T) => Promise<unknown>, msg: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(msg);
        onDone();
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const mAsk = wrap(() => ask({ data: { botId } }), "Der Worker öffnet das Fenster beim nächsten Durchlauf.");
  const mStop = wrap(() => stop({ data: { botId } }), "Anforderung zurückgenommen.");
  const mSave = wrap(
    () => save({ data: { botId, cookiesJson: cookies, userAgent: ua || null } }),
    "Cookies gespeichert — Bot ist wieder freigeschaltet.",
  );
  const mRelease = wrap(() => release({ data: { botId } }), "Manueller Modus aufgehoben.");

  return (
    <section className="rounded-lg border border-destructive/40 bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{String(bot["name"])}</h2>
          <p className="text-xs text-muted-foreground">
            {String(bot["manual_reason"] ?? "Sitzung abgelaufen")} · seit {fmt(bot["manual_since"] as string)}
          </p>
        </div>
        <StatusBadge value={UNLOCK_LABEL[state] ?? state} />
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Weg A: sichtbares Worker-Fenster */}
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-foreground">
            A) Worker öffnet ein Fenster
            <InfoHint text="Der Worker startet den Browser sichtbar — mit demselben Profil, Proxy und Fingerprint wie im Automatikbetrieb. Du meldest dich an oder löst die Sicherheitsabfrage, der Worker speichert die Cookies danach automatisch." />
          </p>
          <p className="text-xs text-muted-foreground">
            {state === "requested"
              ? "Angefordert — der Worker öffnet das Fenster beim nächsten Durchlauf."
              : state === "open"
                ? "Das Fenster ist offen. Melde dich dort an; danach speichert der Worker die Sitzung."
                : "Startet ein sichtbares Browserfenster auf deinem Worker-Rechner."}
          </p>
          {bot["unlock_note"] ? (
            <p className="text-xs text-muted-foreground">Hinweis vom Worker: {String(bot["unlock_note"])}</p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => mAsk.mutate(undefined as never)} disabled={mAsk.isPending}>
              Fenster öffnen
            </Button>
            {state === "requested" ? (
              <Button size="sm" variant="ghost" onClick={() => mStop.mutate(undefined as never)}>
                Abbrechen
              </Button>
            ) : null}
          </div>
        </div>

        {/* Weg B: Cookies von Hand */}
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-foreground">
            B) Cookies selbst einspielen
            <InfoHint text="Melde dich in deinem eigenen Browser bei Facebook an, exportiere die Cookies als JSON (z. B. mit einer Cookie-Editor-Erweiterung) und füge sie hier ein. Der Browser kann gespeicherte Cookies nie wieder auslesen." />
          </p>
          <Textarea
            rows={4}
            className="font-mono text-xs"
            placeholder='[{"name":"c_user","value":"…","domain":".facebook.com","path":"/"}]'
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
          />
          <div className="space-y-1">
            <Label className="text-xs">User-Agent (optional, aber empfohlen)</Label>
            <Input
              className="text-xs"
              placeholder="Mozilla/5.0 …"
              value={ua}
              onChange={(e) => setUa(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => mSave.mutate(undefined as never)}
              disabled={!cookies.trim() || mSave.isPending}
            >
              Cookies speichern & freischalten
            </Button>
            <Button size="sm" variant="ghost" onClick={() => mRelease.mutate(undefined as never)}>
              Nur freigeben
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
