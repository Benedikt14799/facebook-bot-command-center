/**
 * Worker-API: Lebenszeichen des Workers.
 *
 * Der Worker meldet Version, Vertragsversion, Faehigkeiten, gewuenschten Modus
 * und optional den gerade bearbeiteten Bot. Wirksam sind ausschliesslich die
 * serverseitig hinterlegten Werte: ein Worker kann sich nicht selbst
 * freischalten (Modus "live" muss im Cockpit gesetzt sein).
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { ALL_CAPABILITIES, CONTRACT_VERSION } from "@/lib/worker-contract";

export const Route = createFileRoute("/api/public/worker/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          version?: unknown;
          contract_version?: unknown;
          capabilities?: unknown;
          mode?: unknown;
          status?: unknown;
          bot_id?: unknown;
          message?: unknown;
        };

        const asText = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

        // Nur bekannte Faehigkeiten uebernehmen.
        const capabilities = Array.isArray(body.capabilities)
          ? [...new Set(body.capabilities.filter((c): c is string => typeof c === "string"))].filter(
              (c) => ALL_CAPABILITIES.includes(c),
            )
          : null;

        // Bot-Zuordnung nur, wenn der Bot wirklich dem Benutzer gehoert.
        let botId: string | null = null;
        const reportedBot = asText(body.bot_id);
        if (reportedBot) {
          const { data: bot } = await ctx.admin
            .from("bots")
            .select("id")
            .eq("id", reportedBot)
            .eq("user_id", ctx.userId)
            .maybeSingle();
          botId = bot?.id ?? null;
        }

        const nowIso = new Date().toISOString();
        await ctx.admin
          .from("workers")
          .update({
            version: asText(body.version),
            contract_version: asText(body.contract_version),
            status: "online",
            last_seen_at: nowIso,
            last_event_at: nowIso,
            last_error: asText(body.message),
            ...(capabilities ? { capabilities } : {}),
            ...(botId ? { bot_id: botId } : {}),
          })
          .eq("id", ctx.workerId);

        // Wirksame Werte kommen immer vom Server zurueck.
        const { data: worker } = await ctx.admin
          .from("workers")
          .select("capabilities, mode")
          .eq("id", ctx.workerId)
          .maybeSingle();

        return json({
          ok: true,
          worker_id: ctx.workerId,
          contract_version: CONTRACT_VERSION,
          server_time: nowIso,
          effective_mode: worker?.mode ?? "dry_run",
          effective_capabilities: worker?.capabilities ?? [],
          allowed_bot_ids: ctx.allowedBotIds,
        });
      },
    },
  },
});
