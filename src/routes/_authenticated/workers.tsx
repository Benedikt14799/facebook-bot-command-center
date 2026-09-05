/**
 * Worker-Verwaltung: Tokens erzeugen, Status pruefen, Anbindung dokumentieren.
 *
 * Der angezeigte Status wird aus dem letzten Heartbeat berechnet und ist
 * deshalb identisch mit der Worker-Health-Seite.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createWorkerToken, revokeWorkerToken } from "@/lib/worker-tokens.functions";
import { encryptLegacySecrets } from "@/lib/secret-backfill.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { selectAll, fmt } from "@/lib/db";
import { workerScript } from "@/lib/worker-script";
import { effectiveWorkerStatus } from "@/lib/worker-status";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workers")({
  head: () => ({
    meta: [
      { title: "Worker — FB/Control" },
      {
        name: "description",
        content: "Worker-Tokens verwalten und Anbindung des lokalen Playwright-Workers.",
      },
      { property: "og:title", content: "Worker — FB/Control" },
      {
        property: "og:description",
        content: "Worker-Tokens verwalten und Anbindung des lokalen Workers.",
      },
    ],
  }),
  component: WorkersPage,
});

/**
 * Adresse fuer externe Worker: die Vorschau-Adresse (id-preview--…) ist durch
 * einen vorgelagerten Zugriffsschutz gesperrt und liefert 401/403, bevor die
 * API-Route erreicht wird. Deshalb immer die stabile oeffentliche Adresse
 * project--<id>.lovable.app verwenden.
 */
function publicApiBase(origin: string) {
  const m = origin.match(/^https:\/\/(?:id-preview--|preview--)?([0-9a-f-]{36})(?:-dev)?\.lovable\.app$/i);
  return m ? `https://project--${m[1]}.lovable.app` : origin;
}

function WorkersPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [issuedFor, setIssuedFor] = useState<string | null>(null);
  const [showBinding, setShowBinding] = useState(false);
  const baseUrl = typeof window !== "undefined" ? publicApiBase(window.location.origin) : "";

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () => selectAll("workers"),
    refetchInterval: 30_000,
  });

  const tokens = useQuery({
    queryKey: ["worker_tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_tokens")
        .select("id, worker_id, token_prefix, label, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const issueToken = useServerFn(createWorkerToken);
  const issue = useMutation({
    mutationFn: async (workerId: string) => issueToken({ data: { worker_id: workerId } }),
    onSuccess: (res, workerId) => {
      setIssuedToken(res.token);
      setIssuedFor(workerId);
      toast.success("Neuer Schlüssel erzeugt");
      qc.invalidateQueries({ queryKey: ["worker_tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeToken = useServerFn(revokeWorkerToken);
  const revoke = useMutation({
    mutationFn: async (tokenId: string) => revokeToken({ data: { token_id: tokenId } }),
    onSuccess: () => {
      toast.success("Schlüssel widerrufen");
      qc.invalidateQueries({ queryKey: ["worker_tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



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

  // Freigabe fuer den Echtbetrieb — nur hier, nie durch den Worker selbst.
  const setLive = useMutation({
    mutationFn: async ({ id, live }: { id: string; live: boolean }) => {
      const { error } = await supabase
        .from("workers")
        .update({ live_enabled: live, mode: live ? "live" : "dry_run" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.live ? "Echtbetrieb freigegeben" : "Auf Probebetrieb gestellt");
      qc.invalidateQueries({ queryKey: ["workers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Altbestand nachträglich verschlüsseln (wiederholbar, überspringt Fertiges).
  const runBackfill = useServerFn(encryptLegacySecrets);
  const backfill = useMutation({
    mutationFn: async () => runBackfill({ data: {} as never }),
    onSuccess: (r) =>
      toast.success(
        `Verschlüsselt: ${r.sessions} Sitzungen, ${r.secrets} Zugangsdaten, ${r.skipped} bereits erledigt.`,
      ),
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
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 w-48"
            placeholder="Worker-Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={!name}>
            Anlegen
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
          >
            Alte Zugangsdaten verschlüsseln
          </Button>
          <InfoHint text="Prüft gespeicherte Anmeldedaten und Passwörter und verschlüsselt alles, was noch offen abgelegt war. Kann jederzeit wiederholt werden." />
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
              <StatusBadge value={effectiveWorkerStatus(w.status, w.last_seen_at)} />
            </div>

            <div className="mt-3 space-y-2">
              {(tokens.data ?? [])
                .filter((t) => t.worker_id === w.id)
                .map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <code className="rounded bg-secondary px-2 py-1 font-mono text-foreground">
                      {t.token_prefix}…
                    </code>
                    <span className="text-muted-foreground">
                      {t.revoked_at
                        ? `widerrufen ${fmt(t.revoked_at)}`
                        : `aktiv · zuletzt genutzt ${fmt(t.last_used_at)}`}
                    </span>
                    {!t.revoked_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revoke.mutate(t.id)}
                        disabled={revoke.isPending}
                      >
                        Widerrufen
                      </Button>
                    )}
                  </div>
                ))}
              {(tokens.data ?? []).filter((t) => t.worker_id === w.id && !t.revoked_at).length ===
                0 && (
                <p className="text-xs text-muted-foreground">
                  Kein aktiver Schlüssel — bitte einen neuen erzeugen.
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => issue.mutate(w.id)}
                disabled={issue.isPending}
              >
                Neuen Schlüssel erzeugen
              </Button>
              <InfoHint text="Der neue Schlüssel wird nur einmal angezeigt. Der alte bleibt gültig, bis du ihn widerrufst — so sperrst du dich nicht versehentlich aus." />
              <Button
                size="sm"
                variant={w.live_enabled ? "default" : "outline"}
                onClick={() => setLive.mutate({ id: w.id, live: !w.live_enabled })}
                disabled={setLive.isPending}
              >
                {w.live_enabled ? "Echtbetrieb freigegeben" : "Nur Probebetrieb"}
              </Button>
              <InfoHint text="Solange nur Probebetrieb aktiv ist, führt der Worker keine echten Aktionen aus und meldet jeden Auftrag als übersprungen. Erst mit deiner Freigabe sind echte Aktionen möglich." />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const blob = new Blob([workerScript(baseUrl)], { type: "text/x-python" });
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
              <InfoHint text="Das Skript enthält keinen Schlüssel. Vor dem Start setzt du FB_CONTROL_WORKER_TOKEN, optional FB_CONTROL_BOT_ID und FB_CONTROL_MODE (Standard: Probebetrieb)." />
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(w.id)}>
                Löschen
              </Button>
            </div>

            {issuedFor === w.id && issuedToken && (
              <div className="mt-3 rounded-md border border-border bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">
                  Neuer Schlüssel — jetzt kopieren, er wird nicht erneut angezeigt:
                </p>
                <code className="mt-1 block break-all font-mono text-xs text-foreground">
                  {issuedToken}
                </code>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(issuedToken);
                      toast.success("Schlüssel kopiert");
                    }}
                  >
                    Kopieren
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIssuedToken(null)}>
                    Ausblenden
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Der Schlüssel steht nie im heruntergeladenen Skript. Setze ihn vor dem Start als
                  Umgebungsvariable: <code>export FB_CONTROL_WORKER_TOKEN=…</code>
                </p>
              </div>
            )}

          </div>
        ))}


        {(workers.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch kein Worker registriert.</p>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            Anbindung
            <InfoHint text="So verbindest du deinen Worker: Token als Header mitschicken und die gezeigten Endpunkte abfragen. Details stehen in WORKER_INTEGRATION.md." />
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowBinding((s) => !s)}
            aria-label={showBinding ? "Anbindung einklappen" : "Anbindung ausklappen"}
          >
            {showBinding ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {showBinding && (
          <>
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
          </>
        )}
      </section>
    </AppShell>
  );
}
