/**
 * Cron-Route: laesst den Automatik-Planer laufen (Jobs + Texte erzeugen).
 * Aufruf nur mit gueltigem Cron-Token; jeder Lauf ist durch eine Sperre
 * gegen Parallellaeufe abgesichert.
 */
import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/public/cron/plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin0 = supabaseAdmin as never as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { token: string } | null }> };
            };
          };
        };

        // Zugangspruefung: Token kommt aus der internen Tabelle cron_tokens
        const provided = request.headers.get("x-cron-token") ?? "";
        const { data: row } = await admin0.from("cron_tokens").select("token").eq("name", "scheduler").maybeSingle();
        if (!row || !provided || provided !== row.token) {
          return new Response("Unauthorized", { status: 401 });
        }

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
