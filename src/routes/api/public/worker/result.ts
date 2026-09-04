/**
 * Worker-API: Ergebnis eines Auftrags zurueckmelden (done/failed/skipped).
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

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
        } | null;

        if (!body?.job_id) return json({ error: "job_id required" }, 400);
        const status = ["done", "failed", "skipped"].includes(body.status ?? "")
          ? body.status!
          : "done";

        const { error } = await ctx.admin
          .from("jobs")
          .update({
            status,
            result: (body.result ?? null) as never,
            error: body.error ?? null,
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.job_id)
          .eq("user_id", ctx.userId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      },
    },
  },
});
