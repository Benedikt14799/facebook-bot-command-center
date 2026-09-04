import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

export const Route = createFileRoute("/api/public/worker/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const botId = new URL(request.url).searchParams.get("bot_id");
        if (!botId) return json({ error: "bot_id required" }, 400);

        const { data, error } = await ctx.admin
          .from("bot_sessions")
          .select("cookies, user_agent, updated_at")
          .eq("bot_id", botId)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "no session" }, 404);
        return json(data);
      },
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => null)) as {
          bot_id?: string;
          cookies?: unknown;
          user_agent?: string;
          status?: string;
        } | null;
        if (!body?.bot_id) return json({ error: "bot_id required" }, 400);

        if (body.cookies) {
          const { error } = await ctx.admin.from("bot_sessions").upsert(
            {
              bot_id: body.bot_id,
              user_id: ctx.userId,
              cookies: body.cookies as never,
              user_agent: body.user_agent ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "bot_id" },
          );
          if (error) return json({ error: error.message }, 500);
        }

        await ctx.admin
          .from("bots")
          .update({
            session_status: body.status ?? "ok",
            session_updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", body.bot_id)
          .eq("user_id", ctx.userId);

        return json({ ok: true });
      },
    },
  },
});
