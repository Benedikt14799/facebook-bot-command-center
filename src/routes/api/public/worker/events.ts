/**
 * Worker-API: Ereignisse protokollieren.
 *
 * Meldet der Worker einen Checkpoint, ein CAPTCHA, eine abgelaufene Sitzung
 * oder eine Sperre, wird der Bot sofort in den manuellen Modus gesetzt und
 * eine Benachrichtigung erzeugt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { apiError, assertBotAllowed, authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { enterManualMode, isManualTrigger } from "@/lib/alerts.server";

export const Route = createFileRoute("/api/public/worker/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          bot_id?: string;
          level?: string;
          type?: string;
          message?: string;
          meta?: unknown;
        } | null;

        if (!body?.message || !body.type)
          return apiError("invalid_payload", "type und message sind Pflichtfelder.", 400);
        if (body.bot_id) {
          const denied = assertBotAllowed(ctx, body.bot_id);
          if (denied) return denied;
        }

        const { error } = await ctx.admin.from("events").insert({
          user_id: ctx.userId,
          bot_id: body.bot_id ?? null,
          level: ["info", "warn", "error"].includes(body.level ?? "") ? body.level! : "info",
          type: body.type,
          message: body.message,
          meta: (body.meta ?? {}) as never,
        });
        if (error) return apiError("server_error", error.message, 500);

        // Checkpoint/CAPTCHA/Sperre/Login: sofort alles anhalten und melden.
        if (body.bot_id && isManualTrigger(body.type)) {
          const meta = (body.meta ?? {}) as { url?: string };
          await enterManualMode(ctx.admin, {
            userId: ctx.userId,
            botId: body.bot_id,
            trigger: body.type,
            message: body.message,
            url: meta.url ?? null,
          });
          return json({ ok: true, manual_mode: true });
        }
        return json({ ok: true });
      },
    },
  },
});
