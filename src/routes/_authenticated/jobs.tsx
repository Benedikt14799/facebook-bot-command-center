/**
 * Auftragsverwaltung: geplante Aktionen der Bots inkl. Freigabe-Queue,
 * Filtern, Abbrechen und erneutem Versuch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, fmt } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Aufträge — FB/Control" },
      { name: "description", content: "Geplante Bot-Aktionen, Freigabe-Queue und Ergebnisse." },
      { property: "og:title", content: "Aufträge — FB/Control" },
      { property: "og:description", content: "Geplante Bot-Aktionen, Freigabe-Queue und Ergebnisse." },
    ],
  }),
  component: JobsPage,
});

const JOB_TYPES = [
  { value: "dm_new_member", label: "Neues Gruppenmitglied anschreiben" },
  { value: "reply_message", label: "Auf Nachricht antworten" },
  { value: "like_posts", label: "Beiträge liken" },
  { value: "comment_post", label: "Beitrag kommentieren" },
  { value: "scan_group", label: "Gruppe scannen" },
];

function JobsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [botId, setBotId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [type, setType] = useState("like_posts");
  const [when, setWhen] = useState("");
  const [payload, setPayload] = useState("{}");
  const [filter, setFilter] = useState("all");

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => selectAll("jobs", (q) => q.order("scheduled_for", { ascending: false })),
  });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });

  const create = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(payload || "{}");
      } catch {
        throw new Error("Payload muss gültiges JSON sein");
      }
      const bot = bots.data?.find((b) => b.id === botId);
      const { error } = await supabase.from("jobs").insert({
        bot_id: botId,
        group_id: groupId || null,
        type,
        payload: parsed as never,
        needs_approval: !!bot?.require_approval,
        scheduled_for: when ? new Date(when).toISOString() : new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auftrag eingeplant");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("jobs").update(values as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (jobs.data ?? []).filter((j) => {
    if (filter === "all") return true;
    if (filter === "approval") return j.needs_approval && j.status === "pending";
    return j.status === filter;
  });

  return (
    <AppShell
      title="Aufträge"
      hint="Die Warteschlange: jeder Auftrag ist eine Aktion für einen Bot zu einer geplanten Zeit. Der Worker holt sich fällige Aufträge ab, führt sie aus und meldet das Ergebnis zurück."
      subtitle="Warteschlange, Freigaben und Ergebnisse"
      actions={
        <>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="approval">Freigabe nötig</SelectItem>
              <SelectItem value="pending">Offen</SelectItem>
              <SelectItem value="running">Läuft</SelectItem>
              <SelectItem value="done">Erledigt</SelectItem>
              <SelectItem value="failed">Fehlgeschlagen</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Auftrag planen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neuer Auftrag</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Bot <InfoHint text="Welches Profil die Aktion ausführt. Limits und Arbeitszeiten dieses Bots gelten dabei." /></Label>
                  <Select value={botId} onValueChange={setBotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Bot wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(bots.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Gruppe (optional) <InfoHint text="Bezugsgruppe der Aktion. Regeln und Tonfall der Gruppe werden dann angewendet." /></Label>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Gruppe wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groups.data ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Typ <InfoHint text="Art der Aktion: neue Mitglieder anschreiben, auf Nachrichten antworten, Likes verteilen, Kommentare beantworten oder eine Gruppe scannen." /></Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Startzeit <InfoHint text="Frühester Ausführungszeitpunkt. Der Worker verschiebt zusätzlich zufällig (Jitter), damit es natürlich wirkt." /></Label>
                  <Input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Payload (JSON) <InfoHint text="Zusatzdaten für den Worker, z. B. Ziel-Profil, Beitrags-ID oder ein fertiger Text. Leer lassen, wenn nicht nötig." /></Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!botId || create.isPending}>
                  Einplanen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Typ</th>
              <th className="px-4 py-2">Bot</th>
              <th className="px-4 py-2">Gruppe</th>
              <th className="px-4 py-2">Geplant</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} className="border-b border-border/50">
                <td className="px-4 py-2 font-mono text-xs text-foreground">{j.type}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {bots.data?.find((b) => b.id === j.bot_id)?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {groups.data?.find((g) => g.id === j.group_id)?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmt(j.scheduled_for)}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1">
                    <StatusBadge value={j.status} />
                    {j.needs_approval && j.status === "pending" ? (
                      <StatusBadge value="warmup" className="normal-case" />
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {j.needs_approval && j.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patch.mutate({ id: j.id, values: { needs_approval: false } })}
                      >
                        Freigeben
                      </Button>
                    )}
                    {j.status !== "cancelled" && j.status !== "done" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch.mutate({ id: j.id, values: { status: "cancelled" } })}
                      >
                        Abbrechen
                      </Button>
                    )}
                    {j.status === "failed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch.mutate({
                            id: j.id,
                            values: { status: "pending", error: null, claimed_by: null },
                          })
                        }
                      >
                        Erneut
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Keine Aufträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
