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
import { selectAll } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Vorlagen — FB/Control" },
      { name: "description", content: "Textvorlagen und Variationen für DMs, Antworten und Kommentare." },
      { property: "og:title", content: "Vorlagen — FB/Control" },
      { property: "og:description", content: "Textvorlagen und Variationen für DMs, Antworten und Kommentare." },
    ],
  }),
  component: TemplatesPage,
});

const KINDS = [
  { value: "dm_intro", label: "DM: Erstkontakt" },
  { value: "dm_followup", label: "DM: Nachfassen" },
  { value: "reply", label: "Antwort auf Nachricht" },
  { value: "comment", label: "Gruppen-Kommentar" },
];

function TemplatesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("dm_intro");
  const [body, setBody] = useState("");
  const [variations, setVariations] = useState("");
  const [botId, setBotId] = useState("");
  const [groupId, setGroupId] = useState("");

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => selectAll("templates") });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("templates").insert({
        name,
        kind,
        body,
        variations: variations
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        bot_id: botId || null,
        group_id: groupId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vorlage gespeichert");
      setOpen(false);
      setName("");
      setBody("");
      setVariations("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("templates").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  return (
    <AppShell
      title="Vorlagen"
      hint="Textbausteine für DMs, Antworten und Kommentare. Mit Variationen (eine pro Zeile) wirken Nachrichten weniger automatisiert."
      subtitle="Snippets mit Variationen — Platzhalter: {name}, {gruppe}"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Vorlage anlegen</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Neue Vorlage</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">Name <InfoHint text="Interne Bezeichnung der Vorlage, z. B. „Begrüßung neue Mitglieder“." /></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">Typ <InfoHint text="Wofür die Vorlage genutzt wird: DM, Antwort auf Nachrichten oder Gruppen-Kommentar." /></Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">Text <InfoHint text="Grundtext. Platzhalter wie {name} werden vom Worker ersetzt." /></Label>
                <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">Variationen (eine pro Zeile) <InfoHint text="Alternative Formulierungen. Pro Aktion wird zufällig eine gewählt, damit nicht immer derselbe Text rausgeht." /></Label>
                <Textarea
                  rows={4}
                  value={variations}
                  onChange={(e) => setVariations(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Nur für Bot <InfoHint text="Vorlage auf ein Profil beschränken, z. B. wenn ein Bot einen eigenen Tonfall hat." /></Label>
                  <Select value={botId} onValueChange={setBotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="alle" />
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
                  <Label className="flex items-center gap-2">Nur für Gruppe <InfoHint text="Vorlage nur in dieser Gruppe verwenden — passend zu Thema und Zielgruppe." /></Label>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger>
                      <SelectValue placeholder="alle" />
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
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!name || !body || create.isPending}>
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {(templates.data ?? []).map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{t.kind}</p>
              </div>
              <StatusBadge value={t.active ? "active" : "paused"} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
            {t.variations.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t.variations.length} Variationen
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggle.mutate({ id: t.id, active: !t.active })}
              >
                {t.active ? "Deaktivieren" : "Aktivieren"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                Löschen
              </Button>
            </div>
          </div>
        ))}
        {(templates.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Vorlagen.</p>
        )}
      </div>
    </AppShell>
  );
}
