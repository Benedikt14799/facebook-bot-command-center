/**
 * Cron-Route: Wartung. Erkennt offline gegangene Worker und haengende Jobs,
 * pausiert Bots bei Fehlerhaeufung und arbeitet Jobs im Simulationsmodus ab.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { acquireLock, releaseLock, runMaintenance } = await import("@/lib/scheduler.server");
        const admin = supabaseAdmin as never;

        const got = await acquireLock(admin, "maintenance");
        if (!got) {
          return new Response(JSON.stringify({ skipped: "laeuft bereits" }), {
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const result = await runMaintenance(admin);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("Wartungs-Fehler:", err);
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        } finally {
          await releaseLock(admin, "maintenance");
        }
      },
    },
  },
});
