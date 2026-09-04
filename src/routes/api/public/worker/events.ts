/**
 * Worker-API: Ereignisse protokollieren.
 *
 * Meldet der Worker einen Checkpoint, ein CAPTCHA, eine abgelaufene Sitzung
 * oder eine Sperre, wird der Bot sofort in den manuellen Modus gesetzt und
 * eine Benachrichtigung erzeugt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";
import { enterManualMode, isManualTrigger } from "@/lib/alerts.server";

export const Route = createFileRoute("/api/public/worker/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => null)) as {
          bot_id?: string;
          level?: string;
          type?: string;
          message?: string;
          meta?: unknown;
        } | null;

        if (!body?.message || !body.type) return json({ error: "type and message required" }, 400);

        const { error } = await ctx.admin.from("events").insert({
          user_id: ctx.userId,
          bot_id: body.bot_id ?? null,
          level: ["info", "warn", "error"].includes(body.level ?? "") ? body.level! : "info",
          type: body.type,
          message: body.message,
          meta: (body.meta ?? {}) as never,
        });
        if (error) return json({ error: error.message }, 500);

        if (body.bot_id && body.level === "error" && body.type === "blocked") {
          await ctx.admin.from("bots").update({ status: "blocked", paused: true }).eq("id", body.bot_id);
        }
        return json({ ok: true });
      },
    },
  },
});
