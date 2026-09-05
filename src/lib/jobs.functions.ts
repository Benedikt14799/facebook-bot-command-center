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

import { JOB_STATUSES } from "@/lib/worker-contract";

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
  const payload = { ...((input.payload ?? {}) as Record<string, unknown>) };
  if (input.generated_text) payload["text"] = input.generated_text;

  const validation = validateJob(
    input.type,
    groupId,
    recipientId,
    payload,
    input.generated_text ?? null,
  );
  if (!validation.valid) throw new Error(validation.errors.join(" "));

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
    status: (JOB_STATUSES as readonly string[]).includes(input.status ?? "")
      ? input.status!
      : "pending",
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

/**
 * Wiederholt fehlgeschlagene Auftraege (Variante A):
 * Der Ursprungsauftrag bleibt unveraendert "failed" inkl. Fehlertext; es
 * entsteht ein neuer, sauberer Auftrag mit Verweis auf den Ursprung.
 *
 * Wird sowohl vom Auftrags-Dialog (einzeln) als auch von der Worker-Health-
 * Seite (Sammelwiederholung) genutzt. Existiert bereits eine offene
 * Wiederholung, wird der Auftrag uebersprungen — keine Duplikate.
 */
export const retryJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { ids: string[]; overrides?: Partial<JobInput>; scheduled_for?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const ids = [...new Set(data.ids)].filter(Boolean);
    if (!ids.length) return { created: 0, skipped: 0 };

    const { data: sources, error: loadErr } = await context.supabase
      .from("jobs")
      .select("*")
      .in("id", ids)
      .eq("user_id", context.userId);
    if (loadErr) throw new Error(loadErr.message);

    // Bereits vorhandene, noch nicht abgeschlossene Wiederholungen ermitteln.
    const { data: existing } = await context.supabase
      .from("jobs")
      .select("id, retried_from_job_id, status")
      .in("retried_from_job_id", ids)
      .eq("user_id", context.userId)
      .in("status", ["pending", "running"]);
    const alreadyRetried = new Set(
      (existing ?? []).map((j) => j.retried_from_job_id).filter(Boolean) as string[],
    );

    let created = 0;
    let skipped = 0;
    for (const src of sources ?? []) {
      if (src.status !== "failed") {
        skipped++;
        continue;
      }
      if (alreadyRetried.has(src.id)) {
        skipped++;
        continue;
      }

      const o = data.overrides ?? {};
      const values = normalize({
        bot_id: o.bot_id ?? src.bot_id,
        group_id: o.group_id !== undefined ? o.group_id : src.group_id,
        recipient_id: o.recipient_id !== undefined ? o.recipient_id : src.recipient_id,
        type: o.type ?? src.type,
        payload: (o.payload ?? src.payload) as Json,
        generated_text: o.generated_text !== undefined ? o.generated_text : src.generated_text,
        scheduled_for: data.scheduled_for ?? new Date().toISOString(),
        needs_approval: src.needs_approval,
        status: "pending",
        source: src.source,
      });

      const { error } = await context.supabase.from("jobs").insert({
        ...values,
        user_id: context.userId,
        retried_from_job_id: src.id,
        error: null,
        error_code: null,
        error_message: null,
        error_stage: null,
        error_retryable: null,
        result: null,
        attempts: 0,
        claimed_at: null,
        claimed_by: null,
        started_at: null,
        finished_at: null,
      });
      // Doppelklick/Parallelaufruf: die Datenbank laesst nur eine offene
      // Wiederholung je Ursprungsauftrag zu.
      if (error && error.code === "23505") {
        skipped++;
        continue;
      }
      if (error) throw new Error(error.message);
      alreadyRetried.add(src.id);
      created++;
    }

    return { created, skipped };
  });
