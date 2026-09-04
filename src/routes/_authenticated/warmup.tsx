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
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, type Bot } from "@/lib/db";
import {
  WARMUP_PRESETS,
  warmupInfo,
  parsePlan,
  parseWeights,
  type WarmupPreset,
  type WarmupStage,
  type WarmupWeights,
} from "@/lib/warmup";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

/**
 * Editor fuer das Warmup-Profil eines Bots: Stufen (ab Tag / Tagesmengen),
 * Gesamtdauer-Verlaengerung und Gewichte fuer Aktionstypen und KI-Textanteil.
 * Aenderungen werden erst beim Speichern uebernommen.
 */
function ProfileEditor({
  bot,
  activeStageIndex,
  onSave,
  saving,
}: {
  bot: Bot;
  activeStageIndex: number;
  onSave: (values: Partial<Bot>) => void;
  saving: boolean;
}) {
  const [stages, setStages] = useState<WarmupStage[]>(() => parsePlan(bot.warmup_plan));
  const [weights, setWeights] = useState<WarmupWeights>(() =>
    parseWeights((bot as { warmup_weights?: unknown }).warmup_weights),
  );
  const [extraDays, setExtraDays] = useState<number>(bot.warmup_extra_days ?? 0);

  // Nach dem Speichern (oder externem Preset-Wechsel) die Werte neu uebernehmen.
  useEffect(() => {
    setStages(parsePlan(bot.warmup_plan));
    setWeights(parseWeights((bot as { warmup_weights?: unknown }).warmup_weights));
    setExtraDays(bot.warmup_extra_days ?? 0);
  }, [
    bot.warmup_plan,
    bot.warmup_extra_days,
    (bot as { warmup_weights?: unknown }).warmup_weights,
  ]);

  function setStage(index: number, key: keyof WarmupStage, value: number) {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: Math.max(0, value || 0) } : s)),
    );
  }

  function addStage() {
    const last = stages[stages.length - 1];
    setStages([
      ...stages,
      {
        day: (last?.day ?? 0) + 3,
        likes: (last?.likes ?? 2) * 2,
        comments: (last?.comments ?? 0) + 1,
        dms: (last?.dms ?? 0) + 1,
      },
    ]);
  }

  return (
    <div className="mt-4 rounded-md border border-border/60 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        Warmup-Profil
        <InfoHint text="Eigenes Profil für diesen Bot: Stufen bestimmen, ab welchem Tag welche Tagesmengen gelten. Die Gewichte legen fest, welche Aktionsart bevorzugt geplant wird und wie viele Texte die KI schreibt." />
      </h3>

      <table className="mt-2 w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-normal">ab Tag</th>
            <th className="py-1 text-left font-normal">Likes</th>
            <th className="py-1 text-left font-normal">Kommentare</th>
            <th className="py-1 text-left font-normal">Nachrichten</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {stages.map((stage, i) => (
            <tr key={i} className={i === activeStageIndex ? "text-primary" : "text-foreground"}>
              {(["day", "likes", "comments", "dms"] as const).map((key) => (
                <td key={key} className="py-1 pr-2">
                  <Input
                    type="number"
                    min={key === "day" ? 1 : 0}
                    className="h-7 w-20 text-xs"
                    value={stage[key]}
                    onChange={(e) => setStage(i, key, Number(e.target.value))}
                  />
                </td>
              ))}
              <td className="py-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Stufe entfernen"
                  disabled={stages.length <= 1}
                  onClick={() => setStages(stages.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={addStage}>
          <Plus className="mr-1 size-3.5" /> Stufe hinzufügen
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Dauer verlängern (Tage)
          <Input
            type="number"
            min={0}
            className="h-7 w-20 text-xs"
            value={extraDays}
            onChange={(e) => setExtraDays(Math.max(0, Number(e.target.value) || 0))}
          />
          <InfoHint text="Zusätzliche Tage nach der letzten Stufe, bevor der Bot live geht." />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <WeightSlider
          label="Gewicht Likes"
          hint="Wie stark Likes gegenüber anderen Aktionen bevorzugt geplant werden. 0 = keine Likes planen."
          value={weights.like}
          max={10}
          onChange={(v) => setWeights({ ...weights, like: v })}
        />
        <WeightSlider
          label="Gewicht Kommentare"
          hint="Wie stark Kommentare bevorzugt werden. 0 = keine Kommentare planen."
          value={weights.comment}
          max={10}
          onChange={(v) => setWeights({ ...weights, comment: v })}
        />
        <WeightSlider
          label="Gewicht Nachrichten"
          hint="Wie stark Direktnachrichten an neue Mitglieder bevorzugt werden. 0 = keine Nachrichten planen."
          value={weights.dm}
          max={10}
          onChange={(v) => setWeights({ ...weights, dm: v })}
        />
        <WeightSlider
          label="KI-Textanteil (%)"
          hint="Anteil der Texte, die von der KI geschrieben werden. Der Rest kommt aus deinen Vorlagen. Wirkt nur, wenn der Bot im KI-Textmodus läuft."
          value={weights.ai}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => setWeights({ ...weights, ai: v })}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave({
              warmup_preset: "eigen",
              warmup_plan: [...stages].sort((a, b) => a.day - b.day) as never,
              warmup_extra_days: extraDays,
              warmup_weights: weights as never,
            } as Partial<Bot>)
          }
        >
          Profil speichern
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setStages(parsePlan(bot.warmup_plan));
            setWeights(parseWeights((bot as { warmup_weights?: unknown }).warmup_weights));
            setExtraDays(bot.warmup_extra_days ?? 0);
          }}
        >
          Zurücksetzen
        </Button>
      </div>
    </div>
  );
}

function WeightSlider({
  label,
  hint,
  value,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label} <InfoHint text={hint} />
        <span className="ml-auto font-mono text-foreground">
          {value}
          {suffix}
        </span>
      </p>
      <Slider
        className="mt-2"
        min={0}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </div>
  );
}
