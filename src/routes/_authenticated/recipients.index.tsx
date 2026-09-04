/**
 * Kontakte: alle erkannten Personen mit Stufe im Gesprächsverlauf,
 * letzter erkannter Kontext und Zahl der Antworten.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { selectAll, fmt } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/contact-labels";

export const Route = createFileRoute("/_authenticated/recipients/")({
  head: () => ({
    meta: [
      { title: "Kontakte — FB/Control" },
      { name: "description", content: "Alle erkannten Personen mit Verlauf, Stufe und Antworten." },
      { property: "og:title", content: "Kontakte — FB/Control" },
      { property: "og:description", content: "Alle erkannten Personen mit Verlauf, Stufe und Antworten." },
    ],
  }),
  component: RecipientsPage,
});

function RecipientsPage() {
  const [search, setSearch] = useState("");
  const recipients = useQuery({
    queryKey: ["recipients"],
    queryFn: () => selectAll("recipients", (q) => q.order("updated_at", { ascending: false })),
  });
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });

  const list = (recipients.data ?? []).filter((r) =>
    search
      ? `${r.name ?? ""} ${r.fb_user_id ?? ""} ${r.last_context ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true,
  );

  return (
    <AppShell
      title="Kontakte"
      subtitle="Personen, ihre Historie und wo sie im Gespräch stehen"
      hint="Jede Person, die ein Bot erkannt, geliked, angeschrieben oder von der er eine Antwort erhalten hat. Aus dieser Akte baut die KI den Kontext für passende Folgeantworten."
      actions={
        <Input
          className="h-9 w-56"
          placeholder="Name oder Stichwort…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      }
    >
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Person</th>
              <th className="px-4 py-2">Gruppe</th>
              <th className="px-4 py-2">Stufe</th>
              <th className="px-4 py-2">Antworten</th>
              <th className="px-4 py-2">Letzter Kontext</th>
              <th className="px-4 py-2">Zuletzt</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
                <td className="px-4 py-2">
                  <Link
                    to="/recipients/$recipientId"
                    params={{ recipientId: r.id }}
                    className="text-foreground hover:underline"
                  >
                    {r.name ?? "Unbekannt"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {groups.data?.find((g) => g.id === r.group_id)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge value={STAGE_LABEL[r.stage ?? "new"] ?? r.stage ?? "new"} />
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.reply_count ?? 0}</td>
                <td className="max-w-sm truncate px-4 py-2 text-xs text-muted-foreground">
                  {r.last_context ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {fmt(r.last_contacted_at ?? r.updated_at)}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Noch keine Kontakte. Ein Gruppen-Scan legt sie automatisch an.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
