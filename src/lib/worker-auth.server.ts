/**
 * Authentifizierung der externen Worker (lokaler Rechner / VPS mit Playwright).
 * Der Worker schickt sein Token per Header, wir pruefen es serverseitig gegen die
 * workers-Tabelle, aktualisieren den Heartbeat und geben einen Admin-Client zurueck.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type WorkerCtx = {
  admin: SupabaseClient<Database>;
  workerId: string;
  userId: string;
};

export async function authenticateWorker(request: Request): Promise<WorkerCtx | Response> {
  const token =
    request.headers.get("x-worker-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!token) return new Response("Missing worker token", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (error) return new Response("Auth error", { status: 500 });
  if (!data) return new Response("Invalid worker token", { status: 401 });

  await supabaseAdmin
    .from("workers")
    .update({ last_seen_at: new Date().toISOString(), status: "online" })
    .eq("id", data.id);

  return {
    admin: supabaseAdmin as unknown as SupabaseClient<Database>,
    workerId: data.id,
    userId: data.user_id,
  };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Einheitliches Einlesen des Anfragekoerpers fuer alle Worker-Endpunkte.
 *
 * - leerer Body           -> {} (erlaubt)
 * - kaputtes JSON         -> HTTP 400
 * - Liste/Zahl/Text/null  -> HTTP 400
 */
export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T | Response> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Ungültiger JSON-Body." }, 400);
  }
  if (!raw.trim()) return {} as T;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: "Ungültiger JSON-Body." }, 400);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json({ error: "Ungültiger JSON-Body." }, 400);
  }
  return parsed as T;
}
