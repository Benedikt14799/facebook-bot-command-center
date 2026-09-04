/**
 * Worker-API: Lebenszeichen des Workers (Version + Online-Status).
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

export const Route = createFileRoute("/api/public/worker/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => ({}))) as { version?: string };
        await ctx.admin
          .from("workers")
          .update({ version: body.version ?? null, status: "online" })
          .eq("id", ctx.workerId);
        return json({ ok: true, worker_id: ctx.workerId });
      },
    },
  },
});
