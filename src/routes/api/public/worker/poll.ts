/**
 * Worker-API: faellige Auftraege konkurrenzsicher abholen.
 *
 * Das Sperren passiert in der Datenbank (claim_jobs mit FOR UPDATE SKIP
 * LOCKED). Zwei parallele Worker koennen denselben Auftrag deshalb niemals
 * bekommen. Ungueltige Auftraege werden vorher als "failed" markiert und nie
 * ausgeliefert. Berechtigungen (Benutzer, erlaubte Bots, Faehigkeiten, Modus)
 * ermittelt ausschliesslich der Server.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { validateJob } from "@/lib/job-validation";
import {
  BLOCKING_SESSION_STATES,
  CAPABILITY_BY_JOB_TYPE,
  CONTRACT_VERSION,
  computeEffectiveMode,
} from "@/lib/worker-contract";

const MAX_LIMIT = 25;

export const Route = createFileRoute("/api/public/worker/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as { bot_id?: unknown; limit?: unknown };

        // Nur ganze Zahlen von 1 bis MAX_LIMIT; ungueltige Werte -> 400.
        let limit = 5;
        if (body.limit !== undefined && body.limit !== null) {
          const n = body.limit;
          if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
            return json(
              {
                error: {
                  code: "invalid_payload",
                  message: `Ungültiges limit. Erlaubt ist eine ganze Zahl von 1 bis ${MAX_LIMIT}.`,
                },
              },
              400,
            );
          }
          limit = n;
        }

        // Wirksamer Modus kommt ausschliesslich vom Server.
        const { data: workerRow } = await ctx.admin
          .from("workers")
          .select("mode, live_enabled")
          .eq("id", ctx.workerId)
          .maybeSingle();
        const effectiveMode = computeEffectiveMode(workerRow);

        // Erlaubte Bots serverseitig bestimmen (Zuordnung im Cockpit).
        let allowedBotIds = ctx.allowedBotIds;
        if (typeof body.bot_id === "string" && body.bot_id) {
          if (!allowedBotIds.includes(body.bot_id)) {
            return json(
              { error: { code: "forbidden", message: "Bot ist diesem Worker nicht zugeordnet." } },
              403,
            );
          }
          allowedBotIds = [body.bot_id];
        }

        // Faehigkeiten -> erlaubte Auftragstypen.
        // Ohne serverseitig hinterlegte Faehigkeiten gibt es keine Auftraege.
        const capabilities = ctx.capabilities;
        const allowedTypes = Object.entries(CAPABILITY_BY_JOB_TYPE)
          .filter(([, cap]) => capabilities.includes(cap))
          .map(([type]) => type);
        if (!allowedTypes.length) {
          return json({
            contract_version: CONTRACT_VERSION,
            effective_mode: effectiveMode,
            jobs: [],
            bots: [],
            limit,
            max_limit: MAX_LIMIT,
            blocking_session_states: BLOCKING_SESSION_STATES,
          });
        }

        // Ungueltige faellige Auftraege vorab aussortieren (nie ausliefern).
        const { data: candidates } = await ctx.admin
          .from("jobs")
          .select("id, type, group_id, recipient_id, payload, generated_text")
          .eq("user_id", ctx.userId)
          .eq("status", "pending")
          .eq("needs_approval", false)
          .lte("scheduled_for", new Date().toISOString())
          .in("type", allowedTypes)
          .limit(MAX_LIMIT * 4);

        for (const job of candidates ?? []) {
          const validation = validateJob(
            job.type,
            job.group_id,
            job.recipient_id,
            job.payload,
            job.generated_text,
          );
          if (!validation.valid) {
            await ctx.admin
              .from("jobs")
              .update({
                status: "failed",
                error: validation.errors.join("; "),
                error_code: "invalid_payload",
                error_message: validation.errors.join("; "),
                finished_at: new Date().toISOString(),
              })
              .eq("id", job.id)
              .eq("status", "pending");
          }
        }

        // Atomares Abholen in der Datenbank.
        const { data: claimed, error } = await ctx.admin.rpc("claim_jobs", {
          p_user_id: ctx.userId,
          p_worker_id: ctx.workerId,
          p_bot_ids: (allowedBotIds.length ? allowedBotIds : null) as unknown as string[],
          p_types: allowedTypes,
          p_limit: limit,
        });
        if (error) return json({ error: { code: "server_error", message: error.message } }, 500);

        const jobs = (claimed ?? []).slice(0, limit);

        // Nur die fuer die Ausfuehrung noetigen Bot-Daten mitliefern.
        const botIds = [...new Set(jobs.map((j) => j.bot_id))];
        const { data: bots } = botIds.length
          ? await ctx.admin
              .from("bots")
              .select(
                "id, name, session_status, manual_mode, paused, browser_mode, active_from, active_to, timezone, cap_likes, cap_comments, cap_dms, jitter_minutes, warmup_preset",
              )
              .in("id", botIds)
              .eq("user_id", ctx.userId)
          : { data: [] };

        return json({
          contract_version: CONTRACT_VERSION,
          effective_mode: effectiveMode,
          jobs,
          bots: bots ?? [],
          limit,
          max_limit: MAX_LIMIT,
          blocking_session_states: BLOCKING_SESSION_STATES,
        });
      },
    },
  },
});
