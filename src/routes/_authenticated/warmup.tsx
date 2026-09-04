/**
 * Aufwaermphasen-Verwaltung: zeigt fuer jeden Bot die aktuelle Stufe,
 * die heute geltenden Tagesmengen, den Fortschritt und das voraussichtliche
 * Live-Datum. Presets, Pause, Verlaengerung und "sofort live" sind manuell
 * steuerbar -- die Automatik haelt sich an genau diese Werte.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, type Bot } from "@/lib/db";
import { WARMUP_PRESETS, warmupInfo, type WarmupPreset } from "@/lib/warmup";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warmup")({
  head: () => ({
    meta: [
      { title: "Aufwärmphase — FB/Control" },
      {
        name: "description",
        content: "Aufwärmpläne, Tagesmengen und Fortschritt aller Bot-Profile steuern.",
      },
      { property: "og:title", content: "Aufwärmphase — FB/Control" },
      {
        property: "og:description",
        content: "Aufwärmpläne, Tagesmengen und Fortschritt aller Bot-Profile steuern.",
      },
    ],
  }),
  component: WarmupPage,
});

function WarmupPage() {
  const qc = useQueryClient();
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<Bot> }) => {
      const { error } = await supabase.from("bots").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aufwärmphase aktualisiert");
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = bots.data ?? [];

  return (
    <AppShell
      title="Aufwärmphase"
      subtitle="Neue Profile langsam hochfahren"
      hint="Frische Profile dürfen nur wenige Aktionen pro Tag machen. Der Aufwärmplan steigert die Mengen stufenweise, bis der Bot live geht. Die Automatik plant nie mehr als die hier gezeigten Tagesmengen."
    >
      <div className="grid gap-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Bots angelegt.</p>
        ) : null}

        {list.map((bot) => {
          const info = warmupInfo(bot);
          const preset = (bot.warmup_preset ?? "normal") as WarmupPreset;
          return (
            <section key={bot.id} className="rounded-lg border border-border bg-card p-4">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">{bot.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {info.active
                      ? `Tag ${info.day} von ${info.totalDays}`
                      : "Aufwärmphase abgeschlossen — normale Tages-Caps gelten"}
                    {bot.warmup_paused ? " · pausiert" : ""}
                    {info.liveDate && info.active ? ` · live ab ${info.liveDate}` : ""}
                  </p>
                </div>
                <StatusBadge value={bot.paused ? "paused" : bot.status} />
              </header>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(info.progress * 100)}%` }}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Metric label="Likes heute" value={info.limits.likes} />
                <Metric label="Kommentare heute" value={info.limits.comments} />
                <Metric label="Nachrichten heute" value={info.limits.dms} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Kurve
                  <InfoHint text="Vorsichtig = sehr langsame Steigerung (sicherste Variante), normal = ausgewogen, zügig = schnell auf volle Mengen (höheres Sperrrisiko)." />
                </span>
                {(["vorsichtig", "normal", "zuegig"] as const).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    onClick={() =>
                      patch.mutate({
                        id: bot.id,
                        values: {
                          warmup_preset: p,
                          warmup_plan: WARMUP_PRESETS[p] as never,
                          warmup_start: bot.warmup_start ?? new Date().toISOString().slice(0, 10),
                          status: "warmup",
                        },
                      })
                    }
                  >
                    {p === "zuegig" ? "zügig" : p}
                  </Button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch.mutate({ id: bot.id, values: { warmup_paused: !bot.warmup_paused } })
                  }
                >
                  {bot.warmup_paused ? "Aufwärmen fortsetzen" : "Aufwärmen pausieren"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch.mutate({
                      id: bot.id,
                      values: { warmup_extra_days: (bot.warmup_extra_days ?? 0) + 3 },
                    })
                  }
                >
                  +3 Tage verlängern
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch.mutate({ id: bot.id, values: { status: "live" } })}
                >
                  Sofort live schalten
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patch.mutate({
                      id: bot.id,
                      values: {
                        status: "warmup",
                        warmup_paused: false,
                        warmup_extra_days: 0,
                        warmup_start: new Date().toISOString().slice(0, 10),
                      },
                    })
                  }
                >
                  Neu starten
                </Button>
                <InfoHint text="Sicherheitsnetz: Bei gehäuften Fehlern oder Sperrhinweisen pausiert das System den Bot automatisch und verlängert die Aufwärmphase um 3 Tage." />
              </div>

              <ProfileEditor
                bot={bot}
                activeStageIndex={info.active ? info.stageIndex : -1}
                onSave={(values) => patch.mutate({ id: bot.id, values })}
                saving={patch.isPending}
              />

            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
