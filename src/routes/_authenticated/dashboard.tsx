/**
 * Dashboard: Kennzahlen-Uebersicht ueber Bots, Jobs, Nachrichten und Ereignisse.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { selectAll, fmt } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Cockpit — FB/Control" },
      { name: "description", content: "Live-Übersicht über Bots, Aufträge und Ereignisse." },
      { property: "og:title", content: "Cockpit — FB/Control" },
      { property: "og:description", content: "Live-Übersicht über Bots, Aufträge und Ereignisse." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const jobs = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: () =>
      selectAll("jobs", (q) => q.order("scheduled_for", { ascending: false }).limit(30)),
  });
  const events = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () =>
      selectAll("events", (q) => q.order("created_at", { ascending: false }).limit(20)),
  });
  const messages = useQuery({
    queryKey: ["messages", "recent"],
    queryFn: () =>
      selectAll("messages", (q) => q.order("created_at", { ascending: false }).limit(10)),
  });

  // Automatik-Status (wird bei KI-/Guthaben-Problemen serverseitig pausiert)
  const automation = useQuery({
    queryKey: ["automation_state"],
    queryFn: async () => {
      const { data } = await supabase.from("automation_state").select("*").maybeSingle();
      return data;
    },
  });
  const workers = useQuery({ queryKey: ["workers"], queryFn: () => selectAll("workers") });

  const botList = bots.data ?? [];
  const jobList = jobs.data ?? [];
  const pending = jobList.filter((j) => j.status === "pending").length;
  const failed = jobList.filter((j) => j.status === "failed").length;
  const approvals = jobList.filter((j) => j.needs_approval && j.status === "pending").length;

  const stats = [
    { label: "Bots aktiv", value: botList.filter((b) => !b.paused).length },
    { label: "Offene Aufträge", value: pending },
    { label: "Freigaben nötig", value: approvals },
    { label: "Fehlgeschlagen", value: failed },
  ];

  return (
    <AppShell title="Cockpit"
      hint="Überblick über alle Bots, geplante Aufträge, Systemereignisse und den Nachrichtenverlauf. Die eigentliche Ausführung übernimmt dein Worker, der sich hier die Aufträge abholt." subtitle="Was gerade läuft">
      {/* Hinweis auf die geführte Inbetriebnahme, solange die Basis fehlt */}
      {(() => {
        const workerOnline = (workers.data ?? []).some((w) => w.status === "online");
        const sessionOk = botList.some((b) => b.session_status === "valid" && !b.manual_mode);
        const setupDone = botList.length > 0 && workerOnline && sessionOk;
        if (setupDone) return null;
        return (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Einrichtung noch nicht abgeschlossen</p>
              <p className="text-xs text-muted-foreground">
                Die geführte Inbetriebnahme bringt dich Schritt für Schritt bis zum ersten Auftrag,
                den dein Worker ausführt.
              </p>
            </div>
            <Link
              to="/inbetriebnahme"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Inbetriebnahme öffnen
            </Link>
          </div>
        );
      })()}

      {(() => {
        const alerts: string[] = [];
        if (automation.data?.paused) {
          alerts.push(`Automatik pausiert: ${automation.data.paused_reason ?? "unbekannter Grund"}`);
        }
        const offline = (workers.data ?? []).filter((w) => w.status !== "online").length;
        if (offline > 0) alerts.push(`${offline} Worker offline — Aufträge bleiben liegen.`);
        const blocked = botList.filter((b) => b.status === "blocked").length;
        if (blocked > 0) alerts.push(`${blocked} Bot(s) von Facebook eingeschränkt.`);
        if (failed > 0) alerts.push(`${failed} Aufträge fehlgeschlagen.`);
        if (alerts.length === 0) return null;
        return (
          <div className="mb-4 space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              Warnungen
              <InfoHint text="Sammelt automatisch erkannte Probleme: pausierte Automatik, offline gegangene Worker, gesperrte Bots und fehlgeschlagene Aufträge." />
            </p>
            {alerts.map((a) => (
              <p key={a} className="text-xs text-muted-foreground">
                {a}
              </p>
            ))}
          </div>
        );
      })()}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-2 font-mono text-3xl text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Bots <InfoHint text="Deine Facebook-Profile. Status zeigt, ob ein Profil live ist, sich aufwärmt, pausiert oder von Facebook blockiert wurde." /></h2>
          <div className="space-y-2">
            {botList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Bots.{" "}
                <Link to="/bots" className="text-primary underline">
                  Jetzt anlegen
                </Link>
              </p>
            ) : (
              botList.map((b) => (
                <Link
                  key={b.id}
                  to="/bots/$botId"
                  params={{ botId: b.id }}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-secondary/50"
                >
                  <span className="text-foreground">{b.name}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge value={b.session_status} />
                    <StatusBadge value={b.paused ? "paused" : b.status} />
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Letzte Aufträge <InfoHint text="Einzelne Aktionen (DM, Like, Kommentar, Antwort), die zu einer geplanten Zeit vom Worker ausgeführt werden." /></h2>
          <div className="space-y-2">
            {jobList.slice(0, 8).map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{j.type}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmt(j.scheduled_for)}</span>
                  <StatusBadge value={j.status} />
                </span>
              </div>
            ))}
            {jobList.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Aufträge geplant.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Ereignisse <InfoHint text="Protokoll des Workers: Logins, Warnungen, Fehler und Sperr-Hinweise von Facebook." /></h2>
          <div className="space-y-1.5 font-mono text-xs">
            {(events.data ?? []).map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="text-muted-foreground">{fmt(e.created_at)}</span>
                <StatusBadge value={e.level} />
                <span className="min-w-0 flex-1 truncate text-foreground">{e.message}</span>
              </div>
            ))}
            {(events.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Noch keine Ereignisse.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">Letzte Nachrichten <InfoHint text="Backlog aller ein- und ausgehenden Nachrichten und Kommentare deiner Bots." /></h2>
          <div className="space-y-2">
            {(messages.data ?? []).map((m) => (
              <div key={m.id} className="rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge value={m.direction === "in" ? "pending" : "ok"} />
                  {m.channel} · {fmt(m.created_at)}
                </div>
                <p className="mt-1 line-clamp-2 text-foreground">{m.body}</p>
              </div>
            ))}
            {(messages.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Noch keine Nachrichten.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
