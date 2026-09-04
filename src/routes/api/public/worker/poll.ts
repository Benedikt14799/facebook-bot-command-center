import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

export const Route = createFileRoute("/api/public/worker/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as {
          bot_id?: string;
          limit?: number;
        };
        const limit = Math.min(Math.max(body.limit ?? 5, 1), 25);

        let query = ctx.admin
          .from("jobs")
          .select("*")
          .eq("user_id", ctx.userId)
          .eq("status", "pending")
          .eq("needs_approval", false)
          .lte("scheduled_for", new Date().toISOString())
          .order("scheduled_for", { ascending: true })
          .limit(limit);
        if (body.bot_id) query = query.eq("bot_id", body.bot_id);

        const { data: candidates, error } = await query;
        if (error) return json({ error: error.message }, 500);

        const claimed = [];
        for (const job of candidates ?? []) {
          const { data, error: claimErr } = await ctx.admin
            .from("jobs")
            .update({
              status: "running",
              claimed_at: new Date().toISOString(),
              claimed_by: ctx.workerId,
              attempts: job.attempts + 1,
            })
            .eq("id", job.id)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();
          if (!claimErr && data) claimed.push(data);
        }

        // Bot-Kontext mitliefern, damit der Worker Limits und Zeitfenster kennt.
        const botIds = [...new Set(claimed.map((j) => j.bot_id))];
        const { data: bots } = botIds.length
          ? await ctx.admin.from("bots").select("*").in("id", botIds)
          : { data: [] };

        return json({ jobs: claimed, bots: bots ?? [] });
      },
    },
  },
});
