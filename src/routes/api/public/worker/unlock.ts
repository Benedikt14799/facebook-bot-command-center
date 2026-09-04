/**
 * Worker-API: visuelle Freischaltung.
 *
 * Ablauf:
 *  1. Du klickst im Cockpit auf „Fenster öffnen“ -> unlock_state = "requested".
 *  2. Der Worker fragt hier per GET, welche Bots freigeschaltet werden sollen,
 *     und oeffnet fuer jeden ein sichtbares Browserfenster (gleiches Profil,
 *     gleicher Proxy, gleicher Fingerprint).
 *  3. Der Worker meldet per POST "open", du loest Login/CAPTCHA von Hand,
 *     danach speichert der Worker die Cookies ueber /worker/session und meldet
 *     hier "done" - der manuelle Modus wird aufgehoben.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { clearManualMode, notify } from "@/lib/alerts.server";

export const Route = createFileRoute("/api/public/worker/unlock")({
  server: {
    handlers: {
      // Offene Freischalt-Anfragen abholen
      GET: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;

        const { data, error } = await ctx.admin
          .from("bots")
          .select("id, name, unlock_state, unlock_requested_at, manual_reason")
          .eq("user_id", ctx.userId)
          .in("unlock_state", ["requested"]);
        if (error) return json({ error: error.message }, 500);
        return json({ requests: data ?? [] });
      },

      // Fortschritt melden: open | done | failed | cancelled
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          bot_id?: string;
          state?: string;
          note?: string;
        } | null;
        if (!body?.bot_id || !body.state) return json({ error: "bot_id and state required" }, 400);

        if (body.state === "done") {
          await clearManualMode(ctx.admin, {
            userId: ctx.userId,
            botId: body.bot_id,
            note: body.note ?? null,
          });
          return json({ ok: true });
        }

        const allowed = ["open", "failed", "cancelled"];
        if (!allowed.includes(body.state)) return json({ error: "unknown state" }, 400);

        await ctx.admin
          .from("bots")
          .update({
            unlock_state: body.state === "open" ? "open" : "needed",
            unlock_note: body.note ?? null,
          } as never)
          .eq("id", body.bot_id)
          .eq("user_id", ctx.userId);

        if (body.state === "open") {
          await notify(ctx.admin, {
            userId: ctx.userId,
            botId: body.bot_id,
            level: "warn",
            type: "unlock_open",
            title: "Browserfenster ist offen — bitte anmelden",
            body: "Der Worker hat ein sichtbares Fenster geöffnet. Melde dich an bzw. löse die Sicherheitsabfrage.",
          });
        }
        return json({ ok: true });
      },
    },
  },
});
