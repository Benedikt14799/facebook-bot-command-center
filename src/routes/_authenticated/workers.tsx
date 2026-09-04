/**
 * Worker-Verwaltung: Tokens erzeugen, Status pruefen, Anbindung dokumentieren.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, fmt } from "@/lib/db";
import { workerScript } from "@/lib/worker-script";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({
    meta: [
      { title: "Worker — FB/Control" },
      { name: "description", content: "Worker-Tokens verwalten und Anbindung des lokalen Playwright-Workers." },
      { property: "og:title", content: "Worker — FB/Control" },
      { property: "og:description", content: "Worker-Tokens verwalten und Anbindung des lokalen Workers." },
    ],
  }),
  component: WorkersPage,
});

function WorkersPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const workers = useQuery({ queryKey: ["workers"], queryFn: () => selectAll("workers") });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("workers").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      toast.success("Worker angelegt");
      qc.invalidateQueries({ queryKey: ["workers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workers"] }),
  });

  return (
    <AppShell
      title="Worker"
      hint="Worker sind deine eigenen Ausführungsprogramme (z. B. Python/Playwright auf PC oder VPS). Sie melden sich mit dem Token an, holen Aufträge ab und führen sie auf Facebook aus."
      subtitle="Deine Ausführungs-Clients"
      actions={
        <div className="flex gap-2">
          <Input
            className="h-9 w-48"
            placeholder="Worker-Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={!name}>
            Anlegen
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {(workers.data ?? []).map((w) => (
          <div key={w.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{w.name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.version ?? "unbekannte Version"} · zuletzt {fmt(w.last_seen_at)}
                </p>
              </div>
              <StatusBadge value={w.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-secondary px-2 py-1 font-mono text-xs text-foreground">
                {w.token}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(w.token);
                  toast.success("Token kopiert");
                }}
              >
                Token kopieren
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Fertiges Startskript mit Token und Basis-URL herunterladen
                  const blob = new Blob([workerScript(baseUrl, w.token)], {
                    type: "text/x-python",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "fbcontrol_worker.py";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Worker-Skript herunterladen
              </Button>
              <InfoHint text="Lädt ein fertiges Python-Skript mit deinem Token herunter. Nur noch 'pip install requests playwright' ausführen und starten — dann holt sich dieser Worker automatisch Aufträge." />
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(w.id)}>
                Löschen
              </Button>
            </div>
          </div>
        ))}
        {(workers.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch kein Worker registriert.</p>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">Anbindung <InfoHint text="So verbindest du deinen Worker: Token als Header mitschicken und die gezeigten Endpunkte abfragen. Details stehen in WORKER_INTEGRATION.md." /></h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Dein lokaler Worker spricht die API mit dem Header{" "}
          <code className="font-mono">x-worker-token</code> an.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-secondary p-3 font-mono text-xs text-foreground">
{`POST ${baseUrl}/api/public/worker/heartbeat   { "version": "1.0.0" }
POST ${baseUrl}/api/public/worker/poll        { "bot_id": "optional", "limit": 5 }
POST ${baseUrl}/api/public/worker/result      { "job_id": "...", "status": "done", "result": {} }
POST ${baseUrl}/api/public/worker/messages    { "bot_id": "...", "direction": "in", "body": "..." }
POST ${baseUrl}/api/public/worker/events      { "level": "info", "type": "login", "message": "..." }
GET  ${baseUrl}/api/public/worker/session?bot_id=...`}
        </pre>
      </section>
    </AppShell>
  );
}
