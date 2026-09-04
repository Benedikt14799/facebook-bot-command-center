/**
 * Cron-Route: laesst den Automatik-Planer laufen (Jobs + Texte erzeugen).
 * Aufruf nur mit gueltigem Cron-Token; jeder Lauf ist durch eine Sperre
 * gegen Parallellaeufe abgesichert.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { acquireLock, releaseLock, runPlanner } = await import("@/lib/scheduler.server");
        const admin = supabaseAdmin as never;

        const got = await acquireLock(admin, "planner");
        if (!got) {
          return new Response(JSON.stringify({ skipped: "laeuft bereits" }), {
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const result = await runPlanner(admin);
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("Planer-Fehler:", err);
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        } finally {
          await releaseLock(admin, "planner");
        }
      },
    },
  },
});
