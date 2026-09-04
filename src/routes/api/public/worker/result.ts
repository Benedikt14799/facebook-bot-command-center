/**
 * Worker-API: Ergebnis eines Auftrags zurueckmelden (done/failed/skipped).
 *
 * Bei erfolgreichen Auftraegen wird zusaetzlich ein Eintrag in der Kontaktakte
 * der betroffenen Person angelegt (Like, Kommentar, Welcome-DM, Follow-up).
 *
 * Ungueltige Auftraege koennen niemals als done gemeldet werden; der Server
 * zwingt stattdessen den Status failed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";
import { validateJob } from "@/lib/job-validation";
import { advanceStage, logContact, upsertRecipient } from "@/lib/contacts.server";

/** Auftragstyp -> Art des Eintrags in der Kontaktakte. */
const KIND_BY_TYPE: Record<string, string> = {
  like: "like",
  like_posts: "like",
  comment: "comment",
  comment_post: "comment",
  dm_new_member: "welcome",
  follow_up: "follow_up",
  reply_message: "reply_out",
};

export const Route = createFileRoute("/api/public/worker/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => null)) as {
          job_id?: string;
          status?: string;
          result?: unknown;
          error?: string;
          // optional: vom Worker erkannte Person
          recipient_name?: string;
          recipient_fb_id?: string;
          recipient_profile_url?: string;
          context?: string;
          sent_text?: string;
        } | null;

        if (!body?.job_id) return json({ error: "job_id required" }, 400);

        // Strikte Statuspruefung: kein Fallback auf "done".
        const ALLOWED = ["done", "failed", "skipped"] as const;
        const requested = body.status ?? "";
        if (!ALLOWED.includes(requested as (typeof ALLOWED)[number])) {
          return json({ error: "Ungültiger Status. Erlaubt sind: done, failed, skipped." }, 400);
        }

        // Vollstaendigen Auftrag laden, um ihn validieren zu koennen.
        const { data: fullJob, error: loadErr } = await ctx.admin
          .from("jobs")
          .select("*")
          .eq("id", body.job_id)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (loadErr) return json({ error: loadErr.message }, 500);
        if (!fullJob) return json({ error: "job not found" }, 404);

        // Bereits abgeschlossene Auftraege duerfen nicht mehr veraendert werden.
        const TERMINAL = ["done", "failed", "skipped", "cancelled"];
        if (TERMINAL.includes(fullJob.status)) {
          if (fullJob.status === requested) return json({ ok: true, unchanged: true });
          return json({ error: "job already finished", status: fullJob.status }, 409);
        }

        // Ergebnis nur vom Worker akzeptieren, der den Auftrag uebernommen hat.
        if (fullJob.claimed_by && fullJob.claimed_by !== ctx.workerId) {
          return json({ error: "job claimed by another worker" }, 409);
        }

        // Ungueltige Auftraege duerfen nie als done gemeldet werden.
        const validation = validateJob(
          fullJob.type,
          fullJob.group_id,
          fullJob.recipient_id,
          fullJob.payload,
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
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.job_id)
          .eq("user_id", ctx.userId)
          .select("id, type, bot_id, group_id, recipient_id, generated_text")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);

        if (status === "done" && job) {
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
            if (["dm_new_member", "follow_up", "reply_message"].includes(job.type)) {
              await advanceStage(ctx.admin, recipientId, "contacted");
              await ctx.admin
                .from("recipients")
                .update({ last_contacted_at: new Date().toISOString() } as never)
                .eq("id", recipientId);
            }
          }
        }

        return json({ ok: true });
      },
    },
  },
});
