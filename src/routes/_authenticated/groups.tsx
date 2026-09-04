/**
 * Gruppenverwaltung: Facebook-Gruppen anlegen, Bots zuweisen, Regeln,
 * Caps und Empfaengerlisten pflegen.
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
import { selectAll, type Group } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/groups")({
  head: () => ({
    meta: [
      { title: "Gruppen — FB/Control" },
      {
        name: "description",
        content: "Facebook-Gruppen verwalten: Regeln, Caps, Bots und Empfänger.",
      },
      { property: "og:title", content: "Gruppen — FB/Control" },
      {
        property: "og:description",
        content: "Facebook-Gruppen verwalten: Regeln, Caps, Bots und Empfänger.",
      },
    ],
  }),
  component: GroupsPage,
});

const ACTIONS = ["like", "comment", "dm"] as const;

function GroupsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [selected, setSelected] = useState<Group | null>(null);

  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const links = useQuery({ queryKey: ["bot_groups"], queryFn: () => selectAll("bot_groups") });
  const recipients = useQuery({ queryKey: ["recipients"], queryFn: () => selectAll("recipients") });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("groups")
        .insert({ name, url: url || null, topic: topic || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gruppe angelegt");
      setOpen(false);
      setName("");
      setUrl("");
      setTopic("");
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (g: Group) => {
      const { id, user_id, created_at, updated_at, ...patch } = g;
      const { error } = await supabase.from("groups").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gruppe gespeichert");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ groupId, botId }: { groupId: string; botId: string }) => {
      const { error } = await supabase
        .from("bot_groups")
        .insert({ group_id: groupId, bot_id: botId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot_groups"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bot_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot_groups"] }),
  });

  const botName = (id: string) => bots.data?.find((b) => b.id === id)?.name ?? "?";

  return (
    <AppShell
      title="Gruppen"
      hint="Verwalte alle Facebook-Gruppen: erlaubte Aktionen, eigene Tageslimits, Cooldown, Arbeitszeiten, Mindest-Score der Empfänger sowie welche Bots in der Gruppe aktiv sind."
      subtitle="Regeln, Caps und Empfänger je Gruppe"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Gruppe hinzufügen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neue Gruppe</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gruppen-URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Thema</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
                Anlegen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {(groups.data ?? []).map((g) => {
          const groupLinks = (links.data ?? []).filter((l) => l.group_id === g.id);
          const recs = (recipients.data ?? []).filter((r) => r.group_id === g.id);
          return (
            <div key={g.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{g.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {g.topic ?? "ohne Thema"} · {g.language ?? "—"} ·{" "}
                    {g.member_count ? `${g.member_count} Mitglieder` : "Größe unbekannt"}
                  </p>
                </div>
                <StatusBadge value={g.status} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {g.allowed_actions.map((a) => (
                  <span
                    key={a}
                    className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>

              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Caps: {g.cap_likes ?? "—"}/{g.cap_comments ?? "—"}/{g.cap_dms ?? "—"} · Cooldown{" "}
                {g.cooldown_minutes}min · Min-Score {g.min_score} · Empfänger {recs.length}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {groupLinks.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => unassign.mutate(l.id)}
                    className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    title="Zuweisung entfernen"
                  >
                    {botName(l.bot_id)} ×
                  </button>
                ))}
                <Select onValueChange={(botId) => assign.mutate({ groupId: g.id, botId })}>
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="Bot zuweisen" />
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

              <Button size="sm" variant="outline" className="mt-3" onClick={() => setSelected(g)}>
                Regeln bearbeiten
              </Button>
            </div>
          );
        })}
        {(groups.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Gruppen.</p>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Name">
                <Input
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                />
              </Row>
              <Row
                label="FB-Gruppen-ID"
                hint="Die Zahl aus der Gruppen-URL. Der Worker nutzt sie, um die Gruppe eindeutig anzusteuern."
              >
                <Input
                  value={selected.fb_group_id ?? ""}
                  onChange={(e) => setSelected({ ...selected, fb_group_id: e.target.value })}
                />
              </Row>
              <Row label="URL">
                <Input
                  value={selected.url ?? ""}
                  onChange={(e) => setSelected({ ...selected, url: e.target.value })}
                />
              </Row>
              <Row
                label="Sprache"
                hint="Sprache der Gruppe — bestimmt, in welcher Sprache Texte erzeugt werden."
              >
                <Input
                  value={selected.language ?? ""}
                  onChange={(e) => setSelected({ ...selected, language: e.target.value })}
                />
              </Row>
              <Row
                label="Mitglieder"
                hint="Ungefähre Gruppengröße, nur zur Einschätzung des Potenzials."
              >
                <Input
                  type="number"
                  value={selected.member_count ?? 0}
                  onChange={(e) =>
                    setSelected({ ...selected, member_count: Number(e.target.value) })
                  }
                />
              </Row>
              <Row
                label="Status"
                hint="active = Aktionen erlaubt, pending = Beitritt läuft, paused/blocked = keine Aktionen."
              >
                <Select
                  value={selected.status}
                  onValueChange={(v) => setSelected({ ...selected, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["active", "paused", "pending", "blocked"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row
                label="Erlaubte Aktionen"
                full
                hint="Welche Aktionstypen in dieser Gruppe überhaupt erlaubt sind — z. B. nur Likes und Kommentare, keine DMs."
              >
                <div className="flex gap-2">
                  {ACTIONS.map((a) => {
                    const on = selected.allowed_actions.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          setSelected({
                            ...selected,
                            allowed_actions: on
                              ? selected.allowed_actions.filter((x) => x !== a)
                              : [...selected.allowed_actions, a],
                          })
                        }
                        className={`rounded-md border px-3 py-1 text-xs ${
                          on
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </Row>
              <Row
                label="Cap Likes"
                hint="Tageslimit für Likes speziell in dieser Gruppe (zusätzlich zum Bot-Limit)."
              >
                <Input
                  type="number"
                  value={selected.cap_likes ?? 0}
                  onChange={(e) => setSelected({ ...selected, cap_likes: Number(e.target.value) })}
                />
              </Row>
              <Row label="Cap Kommentare" hint="Tageslimit für Kommentare in dieser Gruppe.">
                <Input
                  type="number"
                  value={selected.cap_comments ?? 0}
                  onChange={(e) =>
                    setSelected({ ...selected, cap_comments: Number(e.target.value) })
                  }
                />
              </Row>
              <Row
                label="Cap DMs"
                hint="Tageslimit für Direktnachrichten an Mitglieder dieser Gruppe."
              >
                <Input
                  type="number"
                  value={selected.cap_dms ?? 0}
                  onChange={(e) => setSelected({ ...selected, cap_dms: Number(e.target.value) })}
                />
              </Row>
              <Row
                label="Cooldown (min)"
                hint="Mindestpause zwischen zwei Aktionen in dieser Gruppe."
              >
                <Input
                  type="number"
                  value={selected.cooldown_minutes}
                  onChange={(e) =>
                    setSelected({ ...selected, cooldown_minutes: Number(e.target.value) })
                  }
                />
              </Row>
              <Row
                label="Aktiv von"
                hint="Frühester Zeitpunkt, zu dem in dieser Gruppe gearbeitet wird."
              >
                <Input
                  type="time"
                  value={(selected.active_from ?? "").slice(0, 5)}
                  onChange={(e) =>
                    setSelected({ ...selected, active_from: `${e.target.value}:00` })
                  }
                />
              </Row>
              <Row label="Aktiv bis" hint="Spätester Zeitpunkt für Aktionen in dieser Gruppe.">
                <Input
                  type="time"
                  value={(selected.active_to ?? "").slice(0, 5)}
                  onChange={(e) => setSelected({ ...selected, active_to: `${e.target.value}:00` })}
                />
              </Row>
              <Row
                label="Min-Score"
                hint="Mindestbewertung eines Empfängers, damit er angeschrieben wird — filtert uninteressante Profile heraus."
              >
                <Input
                  type="number"
                  value={selected.min_score}
                  onChange={(e) => setSelected({ ...selected, min_score: Number(e.target.value) })}
                />
              </Row>
              <Row
                label="Tonfall"
                full
                hint="Schreibstil speziell für diese Gruppe, überschreibt den Bot-Tonfall."
              >
                <Textarea
                  rows={3}
                  value={selected.tone ?? ""}
                  onChange={(e) => setSelected({ ...selected, tone: e.target.value })}
                />
              </Row>
              <Row
                label="Notizen"
                full
                hint="Freie Notizen, z. B. Gruppenregeln oder was in dieser Gruppe gut funktioniert."
              >
                <Textarea
                  rows={2}
                  value={selected.notes ?? ""}
                  onChange={(e) => setSelected({ ...selected, notes: e.target.value })}
                />
              </Row>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => selected && save.mutate(selected)} disabled={save.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({
  label,
  children,
  full,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {hint ? <InfoHint text={hint} /> : null}
      </Label>
      {children}
    </div>
  );
}
