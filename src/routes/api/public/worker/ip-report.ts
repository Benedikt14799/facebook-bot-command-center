/**
 * Worker-API: Der Worker meldet die tatsaechliche Ausgangs-IP seiner Sitzung.
 * Bei Hosting-IP oder abweichendem Land wird ein Warn-Ereignis erzeugt und der
 * Bot optional pausiert.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json } from "@/lib/worker-auth.server";

export const Route = createFileRoute("/api/public/worker/ip-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const body = (await request.json().catch(() => null)) as {
          bot_id?: string;
          ip?: string;
          country?: string;
          isp?: string;
          org?: string;
          asn?: string;
          hosting?: boolean;
          type?: string;
          latency_ms?: number;
        } | null;
        if (!body?.bot_id) return json({ error: "bot_id required" }, 400);

        const { data: bot } = await ctx.admin
          .from("bots")
          .select("id, proxy_country, paused")
          .eq("id", body.bot_id)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (!bot) return json({ error: "bot not found" }, 404);

        const checkedAt = new Date().toISOString();
        const check = { ...body, ok: true, source: "worker", checked_at: checkedAt };

        const warnings: string[] = [];
        if (body.hosting || body.type === "datacenter")
          warnings.push("Ausgangs-IP ist eine Rechenzentrums-IP — hohes Sperr-Risiko.");
        if (
          bot.proxy_country &&
          body.country &&
          bot.proxy_country.toUpperCase() !== body.country.toUpperCase()
        )
          warnings.push(
            `Ausgangs-IP liegt in ${body.country}, erwartet war ${bot.proxy_country.toUpperCase()}.`,
          );

        await ctx.admin
          .from("bots")
          .update({
            proxy_check: check as never,
            proxy_checked_at: checkedAt,
            ...(body.hosting ? { paused: true } : {}),
          })
          .eq("id", body.bot_id)
          .eq("user_id", ctx.userId);

        if (warnings.length) {
          await ctx.admin.from("events").insert({
            user_id: ctx.userId,
            bot_id: body.bot_id,
            level: "warn",
            type: "proxy_warning",
            message: warnings.join(" "),
            data: check as never,
          });
        }

        return json({ ok: true, warnings, paused: !!body.hosting });
      },
    },
  },
});
