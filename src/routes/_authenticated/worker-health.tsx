/**
 * Worker-Health: Zustand aller Worker, aktuelle Fehler, letzte Auftragslaeufe
 * und ein Wiederholen-Knopf fuer fehlgeschlagene Auftraege.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, fmt, type Job } from "@/lib/db";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/worker-health")({
  head: () => ({
    meta: [
      { title: "Worker-Health — FB/Control" },
      {
        name: "description",
        content:
          "Zustand der Worker, aktuelle Fehler, letzte Auftragsläufe und Wiederholen fehlgeschlagener Aufträge.",
      },
      { property: "og:title", content: "Worker-Health — FB/Control" },
      {
        property: "og:description",
        content: "Worker-Status, Fehler und letzte Läufe auf einen Blick.",
      },
    ],
  }),
  component: WorkerHealthPage,
});

/** Ein Worker gilt als offline, wenn er sich >5 Minuten nicht gemeldet hat. */
const OFFLINE_AFTER_MS = 5 * 60 * 1000;

function isOffline(lastSeen: string | null) {
  if (!lastSeen) return true;
  return Date.now() - new Date(lastSeen).getTime() > OFFLINE_AFTER_MS;
}

function WorkerHealthPage() {
  const qc = useQueryClient();

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () => selectAll("workers"),
    refetchInterval: 30_000,
  });

  const jobs = useQuery({
    queryKey: ["jobs", "health"],
    queryFn: () =>
      selectAll("jobs", (q) =>
        q.order("updated_at", { ascending: false }).limit(100),
      ),
    refetchInterval: 30_000,
  });

  const errors = useQuery({
    queryKey: ["events", "health"],
    queryFn: () =>
      selectAll("events", (q) =>
        q
          .in("level", ["warn", "error"])
          .order("created_at", { ascending: false })
          .limit(20),
      ),
    refetchInterval: 30_000,
  });

  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const botName = (id: string | null) =>
    (bots.data ?? []).find((b) => b.id === id)?.name ?? "—";

  const failed = (jobs.data ?? []).filter((j) => j.status === "failed");
  const recentRuns = (jobs.data ?? [])
    .filter((j) => ["done", "failed", "claimed", "running"].includes(j.status))
    .slice(0, 20);

  /** Auftrag zurueck in die Warteschlange legen (Fehler und Zuweisung loeschen). */
  const retry = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "pending",
          error: null,
          claimed_by: null,
          claimed_at: null,
          finished_at: null,
          scheduled_for: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Auftrag erneut eingeplant" : `${n} Aufträge erneut eingeplant`);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const online = (workers.data ?? []).filter((w) => !isOffline(w.last_seen_at));

  return (
    <AppShell
      title="Worker-Health"
      hint="Überblick über die Gesundheit deiner Ausführungs-Worker: Wer ist online, welche Fehler gab es zuletzt, welche Aufträge liefen — und fehlgeschlagene Aufträge lassen sich hier direkt wiederholen."
      subtitle="Status, Fehler und letzte Läufe"
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              workers.refetch();
              jobs.refetch();
              errors.refetch();
            }}
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Aktualisieren
          </Button>
          <Button
            size="sm"
            disabled={failed.length === 0 || retry.isPending}
            onClick={() => retry.mutate(failed.map((j) => j.id))}
          >
            Alle {failed.length > 0 ? `${failed.length} ` : ""}Fehlschläge wiederholen
          </Button>
        </div>
      }
    >
      {/* Kennzahlen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Worker online"
          value={`${online.length} / ${(workers.data ?? []).length}`}
          hint="Ein Worker gilt als online, wenn sein letzter Heartbeat weniger als 5 Minuten her ist."
        />
        <Metric
          label="Fehlgeschlagene Aufträge"
          value={String(failed.length)}
          hint="Aufträge, die der Worker mit Fehler zurückgemeldet hat. Sie können hier wiederholt werden."
        />
        <Metric
          label="Fehler/Warnungen"
          value={String((errors.data ?? []).length)}
          hint="Die letzten Warnungen und Fehler aus dem Ereignisprotokoll."
        />
      </div>

      {/* Worker-Status */}
      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          Worker-Status
          <InfoHint text="Zeigt Version und letzten Heartbeat jedes Workers. Offline heißt: Das Skript läuft nicht oder hat keine Verbindung." />
        </h2>
        <div className="space-y-2">
          {(workers.data ?? []).map((w) => {
            const off = isOffline(w.last_seen_at);
            return (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.version ?? "unbekannte Version"} · Heartbeat {fmt(w.last_seen_at)}
                  </p>
                </div>
                <StatusBadge value={off ? "offline" : "online"} />
              </div>
            );
          })}
          {(workers.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Noch kein Worker registriert.</p>
          )}
        </div>
      </section>

      {/* Aktuelle Fehler */}
      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          Aktuelle Fehler
          <InfoHint text="Warnungen und Fehler der letzten Läufe — z. B. Login-Probleme, Sperren oder Zeitüberschreitungen." />
        </h2>
        <div className="space-y-2">
          {(errors.data ?? []).map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">{e.message}</span>
                <StatusBadge value={e.level} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {e.type} · {botName(e.bot_id)} · {fmt(e.created_at)}
              </p>
            </div>
          ))}
          {(errors.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Fehler gemeldet.</p>
          )}
        </div>
      </section>

      {/* Letzte Laeufe */}
      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          Letzte Läufe
          <InfoHint text="Die zuletzt bearbeiteten Aufträge mit Ergebnis. Fehlgeschlagene lassen sich einzeln erneut einplanen." />
        </h2>
        <div className="space-y-2">
          {recentRuns.map((j: Job) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {j.type} · {botName(j.bot_id)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({j.source === "auto" ? "auto" : "manuell"})
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmt(j.finished_at ?? j.updated_at)} · Versuche {j.attempts}
                  {j.error ? ` · ${j.error}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={j.status} />
                {j.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate([j.id])}
                  >
                    Wiederholen
                  </Button>
                )}
              </div>
            </div>
          ))}
          {recentRuns.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Läufe vorhanden.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label} <InfoHint text={hint} />
      </p>
      <p className="mt-1 font-mono text-2xl text-foreground">{value}</p>
    </div>
  );
}
