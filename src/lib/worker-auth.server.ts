/**
 * Authentifizierung der externen Worker (lokaler Rechner / VPS mit Playwright).
 *
 * Der Worker schickt seinen Schluessel per Header. Gespeichert ist nur ein
 * nicht rueckrechenbarer SHA-256-Hash (Tabelle worker_tokens). Mehrere gueltige
 * Schluessel pro Worker sind moeglich (ueberlappende Rotation); widerrufene
 * Schluessel werden abgelehnt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type WorkerCtx = {
  admin: SupabaseClient<Database>;
  workerId: string;
  userId: string;
  /** Serverseitig ermittelt — niemals aus der Anfrage uebernommen. */
  capabilities: string[];
  mode: string;
  allowedBotIds: string[];
  tokenId: string;
};

/** SHA-256-Hex eines Schluessels (Web Crypto, laeuft auch im Worker-Runtime). */
export async function hashWorkerToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function authenticateWorker(request: Request): Promise<WorkerCtx | Response> {
  const token =
    request.headers.get("x-worker-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!token) return json({ error: { code: "unauthorized", message: "Missing worker token" } }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await hashWorkerToken(token);

  const { data: tokenRow, error } = await supabaseAdmin
    .from("worker_tokens")
    .select("id, worker_id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error) return json({ error: { code: "server_error", message: "Auth error" } }, 500);
  if (!tokenRow || tokenRow.revoked_at)
    return json({ error: { code: "unauthorized", message: "Invalid worker token" } }, 401);

  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("id, user_id, capabilities, mode, revoked_at")
    .eq("id", tokenRow.worker_id)
    .maybeSingle();

  if (!worker || worker.revoked_at)
    return json({ error: { code: "unauthorized", message: "Worker revoked" } }, 401);

  // Wichtig: Hier wird NICHT der Heartbeat/Online-Zustand gesetzt.
  // Nur /heartbeat aktualisiert last_seen_at und status.
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("worker_tokens").update({ last_used_at: nowIso }).eq("id", tokenRow.id);

  const { data: links } = await supabaseAdmin
    .from("worker_bots")
    .select("bot_id")
    .eq("worker_id", worker.id);

  return {
    admin: supabaseAdmin as unknown as SupabaseClient<Database>,
    workerId: worker.id,
    userId: worker.user_id,
    capabilities: worker.capabilities ?? [],
    mode: worker.mode ?? "dry_run",
    allowedBotIds: (links ?? []).map((l) => l.bot_id),
    tokenId: tokenRow.id,
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
    return json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body." } }, 400);
  }
  if (!raw.trim()) return {} as T;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body." } }, 400);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json({ error: { code: "invalid_json", message: "Ungültiger JSON-Body." } }, 400);
  }
  return parsed as T;
}

/** Einheitliches Fehlerformat fuer alle Worker-Endpunkte. */
export function apiError(code: string, message: string, status = 400) {
  return json({ error: { code, message } }, status);
}

/**
 * Prueft serverseitig, ob der Bot diesem Worker zugeordnet ist
 * (Tabelle worker_bots). Liefert eine Fehlerantwort oder null.
 */
export function assertBotAllowed(ctx: WorkerCtx, botId: string | null | undefined) {
  if (!botId) return apiError("invalid_payload", "bot_id fehlt.", 400);
  if (!ctx.allowedBotIds.includes(botId))
    return apiError("forbidden", "Bot ist diesem Worker nicht zugeordnet.", 403);
  return null;
}
