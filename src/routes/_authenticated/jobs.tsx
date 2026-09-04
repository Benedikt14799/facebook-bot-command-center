/**
 * Auftragsverwaltung: geplante Aktionen der Bots inkl. Freigabe-Queue,
 * Filtern, Abbrechen, erneutem Versuch — und Bearbeiten bestehender Aufträge.
 *
 * Ein Klick auf eine Zeile öffnet den Bearbeiten-Dialog:
 *  - offene Aufträge lassen sich komplett ändern
 *  - fehlgeschlagene lassen sich ändern und neu einplanen
 *  - erledigte lassen sich als neuen Auftrag duplizieren
 *
 * Alle Aufträge werden serverseitig validiert, bevor sie gespeichert werden.
 * Unvollständige Aufträge können daher nie als "pending" in die Datenbank.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import {
  JOB_TYPES,
  jobTypeLabel,
  readTypoSettings,
  type JobTypoSettings,
} from "@/lib/job-types";
import { TypoControls } from "@/components/TypoControls";
import { saveJob, updateJob } from "@/lib/jobs.functions";
import { useServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import type { Job } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Aufträge — FB/Control" },
      { name: "description", content: "Geplante Bot-Aktionen, Freigabe-Queue und Ergebnisse." },
      { property: "og:title", content: "Aufträge — FB/Control" },
      {
        property: "og:description",
        content: "Geplante Bot-Aktionen, Freigabe-Queue und Ergebnisse.",
      },
    ],
  }),
  component: JobsPage,
});

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function JobsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [botId, setBotId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [type, setType] = useState("like_posts");
  const [when, setWhen] = useState(nowLocalInput());
  const [text, setText] = useState("");
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [typo, setTypo] = useState<JobTypoSettings>({ rate: 0.12, kinds: [] });
  const [errors, setErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Job | null>(null);

  const doSaveJob = useServerFn(saveJob);

  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => selectAll("jobs", (q) => q.order("scheduled_for", { ascending: false })),
  });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => selectAll("groups") });

  // Beim Öffnen des Dialogs die aktuelle Uhrzeit als Standard setzen.
  useEffect(() => {
    if (open && !when) setWhen(nowLocalInput());
  }, [open, when]);

  function resetDialog() {
    setBotId("");
    setGroupId("");
    setType("like_posts");
    setWhen(nowLocalInput());
    setText("");
    setPayload({});
    setTypo({ rate: 0.12, kinds: [] });
    setErrors([]);
  }

  function buildPayload(): Record<string, unknown> {
    const base: Record<string, unknown> = { ...payload };
    if (text.trim()) base["text"] = text.trim();
    base["typo"] = { rate: typo.rate, kinds: typo.kinds };
    return base;
  }

  const create = useMutation({
    mutationFn: async () => {
      const bot = bots.data?.find((b) => b.id === botId);
      await doSaveJob({
        data: {
          bot_id: botId,
          group_id: groupId || null,
          type,
          payload: buildPayload() as unknown as import("@/integrations/supabase/types").Json,
          generated_text: text.trim() || null,
          scheduled_for: when ? new Date(when).toISOString() : new Date().toISOString(),
          needs_approval: !!bot?.require_approval,
          source: "manual",
        },
      });
    },
    onSuccess: () => {
      toast.success("Auftrag eingeplant");
      setOpen(false);
      resetDialog();
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setErrors([e.message]);
    },
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
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o) setWhen(nowLocalInput());
              else resetDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">Auftrag planen</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Neuer Auftrag</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Bot{" "}
                    <InfoHint text="Welches Profil die Aktion ausführt. Limits und Arbeitszeiten dieses Bots gelten dabei." />
                  </Label>
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
                  <Label className="flex items-center gap-2">
                    Gruppe{" "}
                    <InfoHint text="Bezugsgruppe der Aktion. Regeln und Tonfall der Gruppe werden dann angewendet." />
                  </Label>
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
                  <Label className="flex items-center gap-2">
                    Aktion{" "}
                    <InfoHint text="Was der Bot konkret tun soll. Kurze Erklärung beim Mouseover über das i neben dem Feld." />
                  </Label>
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
                <JobFields
                  type={type}
                  payload={payload}
                  onChange={setPayload}
                  groupId={groupId || null}
                  groups={groups.data ?? []}
                />
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Startzeit{" "}
                    <InfoHint text="Frühester Ausführungszeitpunkt. Der Worker verschiebt zusätzlich zufällig (Jitter), damit es natürlich wirkt." />
                  </Label>
                  <Input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Text (optional){" "}
                    <InfoHint text="Fester Text für diese Aktion. Leer lassen, damit die KI den Text anhand von Person, Kommentar und Verlauf schreibt. {{vorname}} wird ersetzt." />
                  </Label>
                  <Textarea
                    rows={3}
                    value={text}
                    placeholder="Hallo {{vorname}}, …"
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Natürlichkeit / Tippfehler
                    <InfoHint text="Nur relevant für KI-Texte: begrenzt, wie viele Vertipper höchstens eingestreut werden und welche Fehlerarten dafür infrage kommen." />
                  </Label>
                  <TypoControls value={typo} onChange={setTypo} />
                </div>
                {errors.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
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
                        onClick={() =>
                          patch.mutate({ id: j.id, values: { needs_approval: false } })
                        }
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

/** Aktions-spezifische Eingabefelder, die direkt in den Payload geschrieben werden. */
function JobFields({
  type,
  payload,
  onChange,
  groupId,
  groups,
}: {
  type: string;
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  groupId: string | null;
  groups: { id: string; name: string }[];
}) {
  const update = (key: string, value: unknown) => {
    const next = { ...payload };
    if (value === "" || value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  if (type === "like_posts") {
    return (
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">
          Anzahl Likes{" "}
          <InfoHint text="Wie viele Beiträge der Bot maximal liken soll. Werte von 1 bis 20." />
        </Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={typeof payload["count"] === "number" ? payload["count"] : ""}
          onChange={(e) => update("count", e.target.value === "" ? undefined : Number(e.target.value))}
          placeholder="z. B. 3"
        />
      </div>
    );
  }

  if (type === "comment_post") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Beitrags-Link{" "}
            <InfoHint text="URL des Facebook-Beitrags, unter dem der Bot kommentieren soll." />
          </Label>
          <Input
            type="url"
            value={typeof payload["post_url"] === "string" ? payload["post_url"] : ""}
            onChange={(e) => update("post_url", e.target.value || undefined)}
            placeholder="https://facebook.com/groups/.../posts/..."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Beitrags-ID{" "}
            <InfoHint text="Alternativ die interne Post-ID (wenn kein Link vorhanden ist)." />
          </Label>
          <Input
            value={typeof payload["post_id"] === "string" ? payload["post_id"] : ""}
            onChange={(e) => update("post_id", e.target.value || undefined)}
            placeholder="1234567890"
          />
        </div>
      </div>
    );
  }

  if (type === "scan_group") {
    return (
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">
          Scan-Tiefe (optional){" "}
          <InfoHint text="Wie viele Beiträge tief die Gruppe ausgelesen wird. Standard ist 20, maximal 100." />
        </Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={typeof payload["limit"] === "number" ? payload["limit"] : ""}
          onChange={(e) => update("limit", e.target.value === "" ? undefined : Number(e.target.value))}
          placeholder="20"
        />
      </div>
    );
  }

  if (type === "dm_new_member") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Person (Profil-Link){" "}
            <InfoHint text="Link zum Facebook-Profil des neuen Mitglieds." />
          </Label>
          <Input
            type="url"
            value={typeof payload["profile_url"] === "string" ? payload["profile_url"] : ""}
            onChange={(e) => update("profile_url", e.target.value || undefined)}
            placeholder="https://facebook.com/benedikt.mueller"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Oder bestehende Person{" "}
            <InfoHint text="Wenn die Person bereits in der Kontaktliste existiert, kannst du sie direkt auswählen." />
          </Label>
          <Select
            value={(payload["recipient_id"] as string) ?? ""}
            onValueChange={(v) => update("recipient_id", v || undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Person wählen" />
            </SelectTrigger>
            <SelectContent>
              {/* Recipient-Auswahl wäre hier; aktuell bleibt es bei der ID-Eingabe über payload */}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (type === "reply_message" || type === "follow_up") {
    return (
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2">
          Person{" "}
          <InfoHint text="Bestehende Person, der geantwortet werden soll. Der bisherige Verlauf wird automatisch geladen." />
        </Label>
        <Input
          value={typeof payload["recipient_id"] === "string" ? payload["recipient_id"] : ""}
          onChange={(e) => update("recipient_id", e.target.value || undefined)}
          placeholder="Recipient-ID"
        />
      </div>
    );
  }

  return null;
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
  const [payload, setPayload] = useState<Record<string, unknown>>(
    (job.payload as Record<string, unknown>) ?? {},
  );
  const [typo, setTypo] = useState<JobTypoSettings>(
    readTypoSettings(job.payload) ?? { rate: 0.12, kinds: [] },
  );
  const [errors, setErrors] = useState<string[]>([]);

  const doUpdateJob = useServerFn(updateJob);

  const done = job.status === "done";
  const failed = job.status === "failed";

  function buildPayload(): Record<string, unknown> {
    const base: Record<string, unknown> = { ...payload };
    if (text.trim()) base.text = text.trim();
    base.typo = { rate: typo.rate, kinds: typo.kinds };
    return base;
  }

  const save = useMutation({
    mutationFn: async (mode: "save" | "requeue" | "duplicate") => {
      const basePayload = buildPayload();
      const base = {
        bot_id: botId,
        group_id: groupId || null,
        type,
        payload: basePayload,
        generated_text: text.trim() || null,
        scheduled_for: when ? new Date(when).toISOString() : new Date().toISOString(),
      };

      if (mode === "duplicate") {
        await doUpdateJob({
          data: {
            ...base,
            recipient_id: (job as { recipient_id?: string | null }).recipient_id ?? null,
            status: "pending",
            source: "manual",
          },
        });
        return;
      }

      await doUpdateJob({
        data: {
          id: job.id,
          ...base,
          status: mode === "requeue" ? "pending" : undefined,
          error: mode === "requeue" ? null : undefined,
          claimed_at: mode === "requeue" ? null : undefined,
          claimed_by: mode === "requeue" ? null : undefined,
          finished_at: mode === "requeue" ? null : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Auftrag gespeichert");
      onSaved();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setErrors([e.message]);
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {done
              ? "Erledigter Auftrag"
              : failed
                ? "Fehlgeschlagener Auftrag"
                : "Auftrag bearbeiten"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1">
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
          </div>
          <JobFields type={type} payload={payload} onChange={setPayload} groupId={groupId || null} groups={groups} />
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
            <Label className="flex items-center gap-2">
              Text{" "}
              <InfoHint text="Der Text, den der Worker sendet. Leer lassen = die KI schreibt ihn beim Ausführen anhand von Person und Verlauf." />
            </Label>
            <Textarea
              rows={3}
              value={text}
              disabled={done}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Natürlichkeit / Tippfehler
              <InfoHint text="Nur relevant für KI-Texte: begrenzt, wie viele Vertipper höchstens eingestreut werden und welche Fehlerarten dafür infrage kommen." />
            </Label>
            <TypoControls value={typo} onChange={setTypo} disabled={done} />
          </div>
          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          {!done ? (
            <TextPreview
              botId={botId}
              type={type}
              groupId={groupId || null}
              recipientId={(job as { recipient_id?: string | null }).recipient_id ?? null}
              typoRate={typo.rate}
              typoKinds={typo.kinds}
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
                <Button
                  variant="outline"
                  onClick={() => save.mutate("requeue")}
                  disabled={save.isPending}
                >
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
