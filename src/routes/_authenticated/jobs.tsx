/**
 * Auftragsverwaltung: geplante Aktionen der Bots inkl. Freigabe-Queue,
 * Filtern, Abbrechen, erneutem Versuch — und Bearbeiten bestehender Aufträge.
 *
 * Ein Klick auf eine Zeile öffnet den Bearbeiten-Dialog:
 *  - offene Aufträge lassen sich komplett ändern
 *  - fehlgeschlagene lassen sich ändern und neu einplanen
 *  - erledigte lassen sich als neuen Auftrag duplizieren
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { TextPreview } from "@/components/TextPreview";
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
import { JOB_TYPES, jobTypeInfo, jobTypeLabel, readTypoSettings, type JobTypoSettings } from "@/lib/job-types";
import { TypoControls } from "@/components/TypoControls";
import type { Job } from "@/lib/db";
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

/** Erklärungsbox zur gewählten Aktion inkl. Beispiel-Input und -Output. */
function TypeHelp({ value }: { value: string }) {
  const info = jobTypeInfo(value);
  if (!info) return null;
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{info.label}: </span>
        {info.long}
      </p>
      <div>
        <p className="font-medium text-foreground">Braucht: {info.inputLabel}</p>
        <pre className="mt-1 overflow-x-auto rounded bg-background/70 p-2 font-mono text-[11px]">
          {info.exampleInput}
        </pre>
      </div>
      <div>
        <p className="font-medium text-foreground">Ergibt: {info.outputLabel}</p>
        <p className="mt-1 rounded bg-background/70 p-2 italic">{info.exampleOutput}</p>
      </div>
    </div>
  );
}

/** Nachschlagewerk: alle Aktionen mit Beispiel-Input und -Output. */
function ActionGuide() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-4 rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        Was machen die einzelnen Aktionen?
        <span className="text-xs text-muted-foreground">{open ? "einklappen" : "anzeigen"}</span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
          {JOB_TYPES.map((t) => (
            <div key={t.value} className="space-y-1 rounded-md border border-border/60 p-3">
              <p className="text-sm font-medium text-foreground">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.long}</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Beispiel-Input: </span>
                <code className="font-mono">{t.exampleInput}</code>
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Beispiel-Output: </span>
                {t.exampleOutput}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function JobsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [botId, setBotId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [type, setType] = useState("like_posts");
  const [when, setWhen] = useState("");
  const [text, setText] = useState("");
  const [payload, setPayload] = useState("{}");
  const [typo, setTypo] = useState<JobTypoSettings>({ rate: 0.12, kinds: [] });
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Job | null>(null);

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
      if (text.trim()) parsed["text"] = text.trim();
      // Tippfehler-Steuerung dieses Auftrags in der Payload ablegen
      parsed["typo"] = { rate: typo.rate, kinds: typo.kinds };
      const bot = bots.data?.find((b) => b.id === botId);
      const { error } = await supabase.from("jobs").insert({
        bot_id: botId,
        group_id: groupId || null,
        type,
        payload: parsed as never,
        generated_text: text.trim() || null,
        needs_approval: !!bot?.require_approval,
        scheduled_for: when ? new Date(when).toISOString() : new Date().toISOString(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auftrag eingeplant");
      setOpen(false);
      setText("");
      setPayload("{}");
      setTypo({ rate: 0.12, kinds: [] });
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
      hint="Die Warteschlange: jeder Auftrag ist eine Aktion für einen Bot zu einer geplanten Zeit. Der Worker holt sich fällige Aufträge ab, führt sie aus und meldet das Ergebnis zurück. Klick auf eine Zeile, um einen Auftrag zu bearbeiten."
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
                  <Label className="flex items-center gap-2">Aktion <InfoHint text="Was der Bot konkret tun soll. Die Erklärung darunter beschreibt die gewählte Aktion." /></Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex flex-col">
                            <span>{t.label}</span>
                            <span className="text-xs text-muted-foreground">{t.short}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <TypeHelp value={type} />
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
                  <Label className="flex items-center gap-2">Text (optional) <InfoHint text="Fester Text für diese Aktion. Leer lassen, damit die KI den Text anhand von Person, Kommentar und Verlauf schreibt. {{vorname}} wird ersetzt." /></Label>
                  <Textarea
                    rows={3}
                    value={text}
                    placeholder="Hallo {{vorname}}, …"
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">Payload (JSON) <InfoHint text="Zusatzdaten für den Worker, z. B. Ziel-Profil oder Beitrags-ID. Leer lassen, wenn nicht nötig." /></Label>
                  <Textarea
                    rows={3}
                    className="font-mono text-xs"
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Natürlichkeit / Tippfehler
                    <InfoHint text="Nur relevant für KI-Texte: begrenzt, wie viele Vertipper höchstens eingestreut werden und welche Fehlerarten dafür infrage kommen." />
                  </Label>
                  <TypoControls value={typo} onChange={setTypo} />
                </div>
                {botId ? (
                  <TextPreview
                    botId={botId}
                    type={type}
                    groupId={groupId || null}
                    typoRate={typo.rate}
                    typoKinds={typo.kinds}
                    onUse={(t) => setText(t)}
                  />
                ) : null}
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
      <ActionGuide />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Aktion</th>
              <th className="px-4 py-2">Bot</th>
              <th className="px-4 py-2">Gruppe</th>
              <th className="px-4 py-2">Geplant</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr
                key={j.id}
                onClick={() => setEditing(j)}
                className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
              >
                <td className="px-4 py-2 text-xs text-foreground">
                  {jobTypeLabel(j.type)}
                  <span
                    className="ml-2 rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                    title={
                      j.source === "auto"
                        ? "Automatisch vom Planer erzeugt"
                        : "Manuell von dir angelegt"
                    }
                  >
                    {j.source === "auto" ? "auto" : "manuell"}
                  </span>
                </td>
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
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
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
                    <Button size="sm" variant="ghost" onClick={() => setEditing(j)}>
                      Bearbeiten
                    </Button>
                    {j.status !== "cancelled" && j.status !== "done" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch.mutate({ id: j.id, values: { status: "cancelled" } })}
                      >
                        Abbrechen
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

      {editing ? (
        <EditJobDialog
          job={editing}
          bots={bots.data ?? []}
          groups={groups.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["jobs"] });
          }}
        />
      ) : null}
    </AppShell>
  );
}

/** Bearbeiten / neu einplanen / duplizieren eines bestehenden Auftrags. */
function EditJobDialog({
  job,
  bots,
  groups,
  onClose,
  onSaved,
}: {
  job: Job;
  bots: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const payloadText = (job.payload as { text?: string } | null)?.text ?? "";
  const [type, setType] = useState(job.type);
  const [groupId, setGroupId] = useState(job.group_id ?? "");
  const [botId, setBotId] = useState(job.bot_id);
  const [when, setWhen] = useState(toLocalInput(job.scheduled_for));
  const [text, setText] = useState(
    (job as { generated_text?: string | null }).generated_text ?? payloadText,
  );
  const [payload, setPayload] = useState(JSON.stringify(job.payload ?? {}, null, 2));
  const [typo, setTypo] = useState<JobTypoSettings>(
    readTypoSettings(job.payload) ?? { rate: 0.12, kinds: [] },
  );

  const done = job.status === "done";
  const failed = job.status === "failed";

  const save = useMutation({
    mutationFn: async (mode: "save" | "requeue" | "duplicate") => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(payload || "{}");
      } catch {
        throw new Error("Payload muss gültiges JSON sein");
      }
      if (text.trim()) parsed["text"] = text.trim();
      parsed["typo"] = { rate: typo.rate, kinds: typo.kinds };
      const base = {
        bot_id: botId,
        group_id: groupId || null,
        type,
        payload: parsed as never,
        generated_text: text.trim() || null,
        scheduled_for: when ? new Date(when).toISOString() : new Date().toISOString(),
      };

      if (mode === "duplicate") {
        const { error } = await supabase.from("jobs").insert({
          ...base,
          recipient_id: job.recipient_id,
          status: "pending",
        } as never);
        if (error) throw error;
        return;
      }

      const values: Record<string, unknown> = { ...base };
      if (mode === "requeue") {
        Object.assign(values, {
          status: "pending",
          error: null,
          claimed_at: null,
          claimed_by: null,
          finished_at: null,
        });
      }
      const { error } = await supabase.from("jobs").update(values as never).eq("id", job.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auftrag gespeichert");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {done ? "Erledigter Auftrag" : failed ? "Fehlgeschlagener Auftrag" : "Auftrag bearbeiten"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {job.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {job.error}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Bot</Label>
            <Select value={botId} onValueChange={setBotId} disabled={done}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bots.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gruppe</Label>
            <Select value={groupId} onValueChange={setGroupId} disabled={done}>
              <SelectTrigger>
                <SelectValue placeholder="Gruppe wählen" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Aktion</Label>
            <Select value={type} onValueChange={setType} disabled={done}>
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
            <TypeHelp value={type} />
          </div>
          <div className="space-y-1.5">
            <Label>Startzeit</Label>
            <Input
              type="datetime-local"
              value={when}
              disabled={done}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">Text <InfoHint text="Der Text, den der Worker sendet. Leer lassen = die KI schreibt ihn beim Ausführen anhand von Person und Verlauf." /></Label>
            <Textarea rows={3} value={text} disabled={done} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payload (JSON)</Label>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              value={payload}
              disabled={done}
              onChange={(e) => setPayload(e.target.value)}
            />
          </div>
          {!done ? (
            <TextPreview
              botId={botId}
              type={type}
              groupId={groupId || null}
              recipientId={(job as { recipient_id?: string | null }).recipient_id ?? null}
              onUse={(t: string) => setText(t)}
            />
          ) : null}
        </div>
        <DialogFooter>
          {done ? (
            <Button onClick={() => save.mutate("duplicate")} disabled={save.isPending}>
              Als neuen Auftrag duplizieren
            </Button>
          ) : (
            <>
              {failed ? (
                <Button variant="outline" onClick={() => save.mutate("requeue")} disabled={save.isPending}>
                  Speichern & neu einplanen
                </Button>
              ) : null}
              <Button onClick={() => save.mutate("save")} disabled={save.isPending}>
                Speichern
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
