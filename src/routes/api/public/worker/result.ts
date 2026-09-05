/**
 * Worker-API: Ergebnis eines Auftrags zurueckmelden (done/failed/skipped).
 *
 * Verbindliche Regeln:
 * - Ein Ergebnis wird nur fuer Auftraege im Zustand "running" angenommen und
 *   nur von genau dem Worker, der den Auftrag abgeholt hat.
 * - "done" verlangt result.verified === true (exakt der boolesche Wert).
 * - Wiederholte identische Meldungen sind unschaedlich (idempotent) — auch die
 *   Nebenwirkungen (Kontaktakte, Stufen) werden nicht doppelt geschrieben.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { validateJob } from "@/lib/job-validation";
import { advanceStage, logContact, upsertRecipient } from "@/lib/contacts.server";
import { REPORTABLE_STATUSES, TERMINAL_STATUSES, computeEffectiveMode } from "@/lib/worker-contract";

/** Auftragstyp -> Art des Eintrags in der Kontaktakte. */
const KIND_BY_TYPE: Record<string, string> = {
  like: "like",
  like_posts: "like",
  comment: "comment",
  comment_post: "comment",
  dm_new_member: "welcome",
  reply_message: "reply_out",
};

/** Kanonische Serialisierung: Reihenfolge der Schluessel spielt keine Rolle. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function fail(code: string, message: string, status: number, extra?: Record<string, unknown>) {
  return json({ error: { code, message, ...(extra ?? {}) } }, status);
}

export const Route = createFileRoute("/api/public/worker/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          job_id?: string;
          status?: string;
          result?: unknown;
          error?: string;
          error_code?: string;
          error_stage?: string;
          error_retryable?: boolean;
          executor_version?: string;
          recipient_name?: string;
          recipient_fb_id?: string;
          recipient_profile_url?: string;
          context?: string;
          sent_text?: string;
        } | null;

        if (!body?.job_id || typeof body.job_id !== "string")
          return fail("invalid_payload", "job_id required", 400);

        const requested = body.status ?? "";
        if (!REPORTABLE_STATUSES.includes(requested as (typeof REPORTABLE_STATUSES)[number])) {
          return fail(
            "invalid_payload",
            "Ungültiger Status. Erlaubt sind: done, failed, skipped.",
            400,
          );
        }

        // "done" nur mit ausdruecklicher Verifikation.
        const resultObj =
          body.result && typeof body.result === "object" && !Array.isArray(body.result)
            ? (body.result as Record<string, unknown>)
            : null;
        if (requested === "done" && resultObj?.["verified"] !== true) {
          return fail(
            "verification_required",
            "Für done muss result.verified exakt true sein.",
            400,
          );
        }

        // Echtbetrieb: "done" nur von einem serverseitig freigegebenen Worker.
        if (requested === "done") {
          const { data: workerRow } = await ctx.admin
            .from("workers")
            .select("mode, live_enabled")
            .eq("id", ctx.workerId)
            .maybeSingle();
          if (computeEffectiveMode(workerRow) !== "live") {
            return fail(
              "dry_run_mode",
              "Der Worker ist nicht für den Echtbetrieb freigegeben. Erlaubt sind skipped oder failed.",
              409,
            );
          }
        }

        const { data: fullJob, error: loadErr } = await ctx.admin
          .from("jobs")
          .select("*")
          .eq("id", body.job_id)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (loadErr) return fail("server_error", loadErr.message, 500);
        if (!fullJob) return fail("not_found", "job not found", 404);

        // Abgeschlossene Auftraege: identische Wiederholung ist idempotent.
        if (TERMINAL_STATUSES.includes(fullJob.status as never)) {
          if (fullJob.status !== requested)
            return fail("status_mismatch", "job already finished", 409, {
              status: fullJob.status,
            });
          const sameResult = canonical(fullJob.result ?? null) === canonical(body.result ?? null);
          const sameError = (fullJob.error ?? null) === (body.error ?? null);
          if (!sameResult || !sameError)
            return fail("result_mismatch", "job already finished with a different result", 409, {
              status: fullJob.status,
            });
          return json({ ok: true, unchanged: true, status: fullJob.status });
        }

        // Ergebnisse nur fuer laufende Auftraege des abholenden Workers.
        if (fullJob.status !== "running")
          return fail("status_mismatch", "Auftrag läuft nicht (Status: " + fullJob.status + ").", 409, {
            status: fullJob.status,
          });
        if (fullJob.claimed_by !== ctx.workerId)
          return fail("forbidden", "Nur der abholende Worker darf das Ergebnis melden.", 403);

        // Ungueltige Auftraege duerfen nie als done gemeldet werden.
        const validation = validateJob(
          fullJob.type,
          fullJob.group_id,
          fullJob.recipient_id,
          fullJob.payload,
          fullJob.generated_text,
        );
        const status = requested === "done" && !validation.valid ? "failed" : requested;
        const errorText =
          requested === "done" && !validation.valid
            ? validation.errors.join("; ")
            : (body.error ?? null);

        const { data: job, error } = await ctx.admin
          .from("jobs")
          .update({
            status,
            result: (body.result ?? null) as never,
            error: errorText,
            error_code: body.error_code ?? (status === "failed" ? "worker_error" : null),
            error_message: errorText,
            error_stage: body.error_stage ?? null,
            error_retryable: typeof body.error_retryable === "boolean" ? body.error_retryable : null,
            executor_version: body.executor_version ?? null,
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.job_id)
          .eq("user_id", ctx.userId)
          .eq("status", "running")
          .eq("claimed_by", ctx.workerId)
          .select("id, type, bot_id, group_id, recipient_id, generated_text")
          .maybeSingle();
        if (error) return fail("server_error", error.message, 500);
        if (!job) return fail("conflict", "job already finished", 409);

        if (status === "done") {
          let recipientId = job.recipient_id;
          if (
            !recipientId &&
            (body.recipient_name || body.recipient_fb_id || body.recipient_profile_url)
          ) {
            recipientId = await upsertRecipient(ctx.admin, {
              userId: ctx.userId,
              groupId: job.group_id,
              botId: job.bot_id,
              fbUserId: body.recipient_fb_id ?? null,
              name: body.recipient_name ?? null,
              profileUrl: body.recipient_profile_url ?? null,
              context: body.context ?? null,
            });
            if (recipientId) {
              await ctx.admin
                .from("jobs")
                .update({ recipient_id: recipientId } as never)
                .eq("id", job.id);
            }
          }

          if (recipientId) {
            // Nebenwirkungen nur einmal je Auftrag schreiben.
            const { data: existing } = await ctx.admin
              .from("contact_events")
              .select("id")
              .eq("job_id", job.id)
              .limit(1);
            if (!existing?.length) {
              await logContact(ctx.admin, {
                userId: ctx.userId,
                recipientId,
                botId: job.bot_id,
                groupId: job.group_id,
                jobId: job.id,
                kind: KIND_BY_TYPE[job.type] ?? job.type,
                direction: "out",
                body: body.sent_text ?? job.generated_text ?? null,
              });
              if (["dm_new_member", "reply_message"].includes(job.type)) {
                await advanceStage(ctx.admin, recipientId, "contacted");
                await ctx.admin
                  .from("recipients")
                  .update({ last_contacted_at: new Date().toISOString() } as never)
                  .eq("id", recipientId);
              }
            }
          }
        }

        return json({ ok: true, status });
      },
    },
  },
});
