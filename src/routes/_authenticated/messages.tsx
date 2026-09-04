/**
 * Nachrichten-Backlog: alle ein- und ausgehenden DMs und Kommentare.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectAll, fmt } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Nachrichten — FB/Control" },
      {
        name: "description",
        content: "Backlog aller ein- und ausgehenden Nachrichten und Kommentare.",
      },
      { property: "og:title", content: "Nachrichten — FB/Control" },
      {
        property: "og:description",
        content: "Backlog aller ein- und ausgehenden Nachrichten und Kommentare.",
      },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("all");

  const messages = useQuery({
    queryKey: ["messages"],
    queryFn: () =>
      selectAll("messages", (b) => b.order("created_at", { ascending: false }).limit(500)),
  });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });

  const list = (messages.data ?? []).filter(
    (m) =>
      (dir === "all" || m.direction === dir) &&
      (!q || m.body.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <AppShell
      title="Nachrichten"
      hint="Vollständiges Backlog: jede gesendete und empfangene Nachricht sowie Kommentare. Durchsuchbar und nach Richtung filterbar."
      subtitle="Vollständiges Backlog"
      actions={
        <>
          <Input
            className="h-9 w-48"
            placeholder="Suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={dir} onValueChange={setDir}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="in">Eingehend</SelectItem>
              <SelectItem value="out">Ausgehend</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="space-y-2">
        {list.map((m) => (
          <div key={m.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge value={m.direction === "in" ? "pending" : "ok"} />
              <span className="font-mono">{m.channel}</span>
              <span>{bots.data?.find((b) => b.id === m.bot_id)?.name ?? "—"}</span>
              <span>{fmt(m.created_at)}</span>
              <span className="font-mono">{m.source}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Nachrichten gefunden.</p>
        )}
      </div>
    </AppShell>
  );
}
