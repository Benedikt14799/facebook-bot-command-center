/**
 * Protokoll: technische Ereignisse der Worker (Info, Warnung, Fehler).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectAll, fmt } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Protokoll — FB/Control" },
      { name: "description", content: "Ereignisse, Warnungen und Fehler aller Bots und Worker." },
      { property: "og:title", content: "Protokoll — FB/Control" },
      { property: "og:description", content: "Ereignisse, Warnungen und Fehler aller Bots und Worker." },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const [level, setLevel] = useState("all");
  const events = useQuery({
    queryKey: ["events"],
    queryFn: () =>
      selectAll("events", (q) => q.order("created_at", { ascending: false }).limit(500)),
  });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });

  const list = (events.data ?? []).filter((e) => level === "all" || e.level === level);

  return (
    <AppShell
      title="Protokoll"
      hint="Technisches Ereignisprotokoll deiner Worker: Infos, Warnungen und Fehler — inklusive automatischer Sperr-Erkennung."
      subtitle="Ereignisse und Fehler"
      actions={
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warnung</SelectItem>
            <SelectItem value="error">Fehler</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {list.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 font-mono text-xs">
            <span className="text-muted-foreground">{fmt(e.created_at)}</span>
            <StatusBadge value={e.level} />
            <span className="text-muted-foreground">{e.type}</span>
            <span className="text-muted-foreground">
              {bots.data?.find((b) => b.id === e.bot_id)?.name ?? "system"}
            </span>
            <span className="min-w-0 flex-1 text-foreground">{e.message}</span>
          </div>
        ))}
        {list.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Keine Ereignisse.</p>
        )}
      </div>
    </AppShell>
  );
}
