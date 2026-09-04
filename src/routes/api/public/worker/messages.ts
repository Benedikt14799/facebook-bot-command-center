/**
 * Worker-API: gesendete oder empfangene Nachrichten ins Backlog schreiben.
 *
 * Zusaetzlich wird die Person (recipient) angelegt/aktualisiert, ein Eintrag
 * in ihrer Kontaktakte erzeugt und ihre Stufe fortgeschrieben — damit spaetere
 * Antworten den kompletten Verlauf als Kontext nutzen koennen.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { advanceStage, logContact, upsertRecipient } from "@/lib/contacts.server";

export const Route = createFileRoute("/api/public/worker/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          bot_id?: string;
          group_id?: string;
          recipient_id?: string;
          job_id?: string;
          direction?: string;
          channel?: string;
          body?: string;
          thread_ref?: string;
          external_id?: string;
          // Identitaet der Person, falls der Worker sie erkannt hat
          recipient_name?: string;
          recipient_fb_id?: string;
          recipient_profile_url?: string;
          kind?: string;
        } | null;

        if (!body?.body || !body.direction) {
          return json({ error: "direction and body required" }, 400);
        }

        const direction = body.direction === "in" ? "in" : "out";

        let recipientId = body.recipient_id ?? null;
        if (
          !recipientId &&
          (body.recipient_name || body.recipient_fb_id || body.recipient_profile_url)
        ) {
          recipientId = await upsertRecipient(ctx.admin, {
            userId: ctx.userId,
            groupId: body.group_id ?? null,
            botId: body.bot_id ?? null,
            fbUserId: body.recipient_fb_id ?? null,
            name: body.recipient_name ?? null,
            profileUrl: body.recipient_profile_url ?? null,
            context: direction === "in" ? body.body : null,
            // Kompletten Meldungs-Payload als Roh-Event sichern
            rawEvent: body as unknown as Record<string, unknown>,
          });
        } else if (recipientId && direction === "in") {
          await ctx.admin
            .from("recipients")
            .update({
              last_context: body.body,
              context_updated_at: new Date().toISOString(),
            } as never)
            .eq("id", recipientId);
        }

        const { error } = await ctx.admin.from("messages").insert({
          user_id: ctx.userId,
          bot_id: body.bot_id ?? null,
          group_id: body.group_id ?? null,
          recipient_id: recipientId,
          job_id: body.job_id ?? null,
          direction,
          channel: body.channel ?? "dm",
          body: body.body,
          thread_ref: body.thread_ref ?? null,
          external_id: body.external_id ?? null,
          source: "worker",
        });
        if (error) return json({ error: error.message }, 500);

        if (recipientId) {
          await logContact(ctx.admin, {
            userId: ctx.userId,
            recipientId,
            botId: body.bot_id ?? null,
            groupId: body.group_id ?? null,
            jobId: body.job_id ?? null,
            kind: body.kind ?? (direction === "in" ? "reply_in" : "reply_out"),
            direction,
            body: body.body,
          });

          if (direction === "in") {
            const { data: rec } = await ctx.admin
              .from("recipients")
              .select("reply_count")
              .eq("id", recipientId)
              .maybeSingle();
            await ctx.admin
              .from("recipients")
              .update({
                reply_count: (rec?.reply_count ?? 0) + 1,
                replied_at: new Date().toISOString(),
                last_context: body.body,
                context_updated_at: new Date().toISOString(),
              } as never)
              .eq("id", recipientId);
            await advanceStage(ctx.admin, recipientId, "replied");
          } else {
            await advanceStage(ctx.admin, recipientId, "contacted");
            await ctx.admin
              .from("recipients")
              .update({ last_contacted_at: new Date().toISOString() } as never)
              .eq("id", recipientId);
          }
        }

        return json({ ok: true, recipient_id: recipientId });
      },
    },
  },
});
