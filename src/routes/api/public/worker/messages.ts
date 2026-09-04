/**
 * Worker-API: gesendete oder empfangene Nachrichten ins Backlog schreiben.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

export const Route = createFileRoute("/api/public/worker/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => null)) as {
          bot_id?: string;
          group_id?: string;
          recipient_id?: string;
          job_id?: string;
          direction?: string;
          channel?: string;
          body?: string;
          thread_ref?: string;
          external_id?: string;
        } | null;

        if (!body?.body || !body.direction) {
          return json({ error: "direction and body required" }, 400);
        }

        const { error } = await ctx.admin.from("messages").insert({
          user_id: ctx.userId,
          bot_id: body.bot_id ?? null,
          group_id: body.group_id ?? null,
          recipient_id: body.recipient_id ?? null,
          job_id: body.job_id ?? null,
          direction: body.direction === "in" ? "in" : "out",
          channel: body.channel ?? "dm",
          body: body.body,
          thread_ref: body.thread_ref ?? null,
          external_id: body.external_id ?? null,
          source: "worker",
        });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      },
    },
  },
});
