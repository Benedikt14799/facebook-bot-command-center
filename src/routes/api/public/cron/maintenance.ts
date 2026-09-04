/**
 * Cron-Route: Wartung. Erkennt offline gegangene Worker und haengende Jobs,
 * pausiert Bots bei Fehlerhaeufung und arbeitet Jobs im Simulationsmodus ab.
 */
import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/public/cron/maintenance")({
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
