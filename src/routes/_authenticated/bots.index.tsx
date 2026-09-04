/**
 * Bot-Uebersicht: alle Profile mit Status, Aufwaermphase und Schnellaktionen.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, fmt } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bots/")({
  head: () => ({
    meta: [
      { title: "Bots — FB/Control" },
      { name: "description", content: "Facebook-Profile anlegen, pausieren und Sessions prüfen." },
      { property: "og:title", content: "Bots — FB/Control" },
      { property: "og:description", content: "Facebook-Profile anlegen, pausieren und Sessions prüfen." },
    ],
  }),
  component: BotsPage,
});

function BotsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");

  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bots").insert({ name, profile_url: profileUrl || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bot angelegt");
      setOpen(false);
      setName("");
      setProfileUrl("");
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePause = useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const { error } = await supabase.from("bots").update({ paused }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bots"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Bots"
      hint="Jeder Bot ist ein Facebook-Profil. Du hinterlegst pro Bot Arbeitszeiten, Tageslimits, Tonfall und die Cookie-Session für die Anmeldung."
      subtitle="Profile, Warmup und Sessions"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Bot anlegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuer Bot</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bot-name" className="flex items-center gap-2">Name <InfoHint text="Interner Name zur Unterscheidung, z. B. der Profilname oder die Rolle des Profils." /></Label>
                <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bot-url" className="flex items-center gap-2">Profil-URL (optional) <InfoHint text="Link zum Facebook-Profil. Dient nur der Zuordnung und dem schnellen Nachschauen." /></Label>
                <Input
                  id="bot-url"
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                />
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(bots.data ?? []).map((b) => (
          <div key={b.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to="/bots/$botId"
                  params={{ botId: b.id }}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {b.name}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {b.active_from.slice(0, 5)}–{b.active_to.slice(0, 5)} · {b.timezone}
                </p>
              </div>
              <StatusBadge value={b.paused ? "paused" : b.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs text-muted-foreground">
              <div>
                <dt>Likes</dt>
                <dd className="text-foreground">{b.cap_likes}</dd>
              </div>
              <div>
                <dt>Kommentare</dt>
                <dd className="text-foreground">{b.cap_comments}</dd>
              </div>
              <div>
                <dt>DMs</dt>
                <dd className="text-foreground">{b.cap_dms}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Session <StatusBadge value={b.session_status} />
              </span>
              <span className="text-xs text-muted-foreground">{fmt(b.last_seen_at)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant={b.paused ? "default" : "outline"}
                onClick={() => togglePause.mutate({ id: b.id, paused: !b.paused })}
              >
                {b.paused ? "Fortsetzen" : "Pausieren"}
              </Button>
              <Link to="/bots/$botId" params={{ botId: b.id }}>
                <Button size="sm" variant="ghost">
                  Details
                </Button>
              </Link>
            </div>
          </div>
        ))}
        {(bots.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Bots angelegt.</p>
        )}
      </div>
    </AppShell>
  );
}
