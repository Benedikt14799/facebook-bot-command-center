/**
 * Verwaltung der Worker-Zugangsschluessel.
 *
 * Der Klartext-Schluessel existiert nur einmal — direkt nach dem Erzeugen in
 * der Antwort. Gespeichert wird ausschliesslich ein SHA-256-Hash. Rotation ist
 * ueberlappend: der alte Schluessel bleibt gueltig, bis er ausdruecklich
 * widerrufen wird.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashWorkerToken } from "@/lib/worker-auth.server";

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `fbc_${hex}`;
}

/** Erzeugt einen neuen Schluessel fuer einen eigenen Worker. */
export const createWorkerToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { worker_id: string; label?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: worker, error } = await context.supabase
      .from("workers")
      .select("id")
      .eq("id", data.worker_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!worker) throw new Error("Worker nicht gefunden");

    const token = generateToken();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const insert = await supabaseAdmin.from("worker_tokens").insert({
      worker_id: data.worker_id,
      user_id: context.userId,
      token_hash: await hashWorkerToken(token),
      token_prefix: token.slice(0, 12),
      label: data.label?.trim() || null,
    });
    if (insert.error) throw new Error(insert.error.message);

    // Einmalige Rueckgabe des Klartexts.
    return { token };
  });

/** Widerruft einen Schluessel (der Worker verliert sofort den Zugang). */
export const revokeWorkerToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("worker_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.token_id)
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
