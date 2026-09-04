/**
 * Serverseitige Auftragsverwaltung mit verbindlicher Validierung.
 *
 * Alle Schreiboperationen fuer Auftraege laufen hier durch, damit die
 * Pflichtfeldpruefung nicht durch direkte Client-Inserts umgangen werden kann.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateJob } from "@/lib/job-validation";
import type { Json } from "@/integrations/supabase/types";

const JOB_STATUSES = ["pending", "running", "done", "failed", "cancelled", "claimed"];

/** Gemeinsame Eingabe fuer Anlegen und Aendern. */
type JobInput = {
  id?: string;
  bot_id: string;
  group_id?: string | null;
  recipient_id?: string | null;
  type: string;
  payload: Json;
  generated_text?: string | null;
  scheduled_for?: string;
  needs_approval?: boolean;
  status?: string;
  source?: string;
  error?: string | null;
  claimed_at?: string | null;
  claimed_by?: string | null;
  finished_at?: string | null;
};

function normalize(input: JobInput) {
  const groupId = input.group_id ?? null;
  const recipientId = input.recipient_id ?? null;
  const validation = validateJob(input.type, groupId, recipientId, input.payload);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (input.generated_text) payload["text"] = input.generated_text;

  return {
    bot_id: input.bot_id,
    group_id: groupId,
    recipient_id: recipientId,
    type: input.type,
    payload: payload as Json,
    generated_text: input.generated_text?.trim() || null,
    scheduled_for: input.scheduled_for
      ? new Date(input.scheduled_for).toISOString()
      : new Date().toISOString(),
    needs_approval: !!input.needs_approval,
    status: JOB_STATUSES.includes(input.status ?? "") ? input.status! : "pending",
    source: input.source ?? "manual",
  };
}

/** Legt einen neuen Auftrag an — nur mit gueltigem Payload. */
export const saveJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: JobInput) => input)
  .handler(async ({ data, context }) => {
    const values = normalize(data);
    const { error } = await context.supabase.from("jobs").insert({
      ...values,
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Aendert einen bestehenden Auftrag. Erledigte Auftraege werden nicht ueberschrieben. */
export const updateJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: JobInput & { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const existing = await context.supabase
      .from("jobs")
      .select("id, status, user_id")
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) throw new Error("Auftrag nicht gefunden");
    if (existing.data.user_id !== context.userId) throw new Error("Nicht berechtigt");
    if (existing.data.status === "done")
      throw new Error("Erledigte Aufträge können nicht bearbeitet werden");

    const values = normalize(rest);
    const { error } = await context.supabase.from("jobs").update(values).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Markiert einen Auftrag fuer den Worker als fehlgeschlagen (z. B. ungueltig). */
export const failJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "failed",
        error: data.reason,
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
