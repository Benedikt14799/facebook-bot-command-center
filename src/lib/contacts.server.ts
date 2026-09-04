/**
 * Kontaktakte (nur serverseitig).
 *
 * Zentrale Helfer, um Personen (recipients) anzulegen bzw. zu aktualisieren
 * und jede Aktion (Like, Kommentar, Welcome-DM, Follow-up, eingehende Antwort)
 * als Eintrag in der Zeitleiste zu speichern. Aus dieser Akte baut die KI
 * spaeter den Kontext fuer passende Folgeantworten.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { HistoryEntry } from "@/lib/ai.server";

type Admin = SupabaseClient<Database>;

/** Stufen im Kontaktverlauf, in dieser Reihenfolge. */
export const STAGES = ["new", "contacted", "replied", "offer_sent", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<string, string> = {
  new: "Neu",
  contacted: "Angeschrieben",
  replied: "Hat geantwortet",
  offer_sent: "Angebot gesendet",
  closed: "Abgeschlossen",
};

export const KIND_LABEL: Record<string, string> = {
  like: "Like vergeben",
  comment: "Kommentar geschrieben",
  welcome: "Welcome-Nachricht",
  follow_up: "Follow-up",
  reply_in: "Antwort erhalten",
  reply_out: "Antwort gesendet",
  offer: "Angebot platziert",
  scan: "Beim Scan gefunden",
};

/** Vorname aus einem vollen Namen ableiten. */
export function firstNameOf(name?: string | null) {
  if (!name) return null;
  const part = name.trim().split(/\s+/)[0] ?? "";
  return part.length > 1 ? part : null;
}

export type PersonInput = {
  userId: string;
  groupId?: string | null;
  botId?: string | null;
  fbUserId?: string | null;
  name?: string | null;
  profileUrl?: string | null;
  /** Zuletzt erkannter Text (Kommentar/Beitrag/Nachricht) */
  context?: string | null;
  source?: string;
};

/**
 * Person anlegen oder aktualisieren. Sucht zuerst ueber die Facebook-ID,
 * danach ueber Profil-URL bzw. Name innerhalb der Gruppe.
 */
export async function upsertRecipient(admin: Admin, input: PersonInput) {
  let existing: { id: string } | null = null;

  if (input.fbUserId) {
    const { data } = await admin
      .from("recipients")
      .select("id")
      .eq("user_id", input.userId)
      .eq("fb_user_id", input.fbUserId)
      .maybeSingle();
    existing = data ?? null;
  }
  if (!existing && input.profileUrl) {
    const { data } = await admin
      .from("recipients")
      .select("id")
      .eq("user_id", input.userId)
      .eq("profile_url", input.profileUrl)
      .maybeSingle();
    existing = data ?? null;
  }
  if (!existing && input.name && input.groupId) {
    const { data } = await admin
      .from("recipients")
      .select("id")
      .eq("user_id", input.userId)
      .eq("group_id", input.groupId)
      .eq("name", input.name)
      .maybeSingle();
    existing = data ?? null;
  }

  const patch: Record<string, unknown> = {
    name: input.name ?? undefined,
    first_name: firstNameOf(input.name) ?? undefined,
    profile_url: input.profileUrl ?? undefined,
    fb_user_id: input.fbUserId ?? undefined,
    group_id: input.groupId ?? undefined,
    bot_id: input.botId ?? undefined,
  };
  if (input.context) {
    patch["last_context"] = input.context;
    patch["context_updated_at"] = new Date().toISOString();
  }
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];

  if (existing) {
    await admin.from("recipients").update(patch as never).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("recipients")
    .insert({
      user_id: input.userId,
      source: input.source ?? "worker",
      stage: "new",
      ...patch,
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export type ContactLog = {
  userId: string;
  recipientId: string;
  botId?: string | null;
  groupId?: string | null;
  jobId?: string | null;
  kind: keyof typeof KIND_LABEL | string;
  direction?: "in" | "out";
  body?: string | null;
  meta?: Record<string, unknown>;
};

/** Einen Eintrag in die Zeitleiste der Person schreiben. */
export async function logContact(admin: Admin, entry: ContactLog) {
  await admin.from("contact_events").insert({
    user_id: entry.userId,
    recipient_id: entry.recipientId,
    bot_id: entry.botId ?? null,
    group_id: entry.groupId ?? null,
    job_id: entry.jobId ?? null,
    kind: entry.kind,
    direction: entry.direction ?? "out",
    body: entry.body ?? null,
    meta: (entry.meta ?? {}) as never,
  } as never);
}

/**
 * Stufe einer Person weiterschalten. Es geht nur vorwaerts, damit eine
 * spaetere Aktion die erreichte Stufe nicht wieder zuruecksetzt.
 */
export async function advanceStage(admin: Admin, recipientId: string, stage: Stage) {
  const { data } = await admin
    .from("recipients")
    .select("stage")
    .eq("id", recipientId)
    .maybeSingle();
  const current = STAGES.indexOf((data?.stage ?? "new") as Stage);
  const next = STAGES.indexOf(stage);
  if (next <= current) return;
  const patch: Record<string, unknown> = { stage };
  if (stage === "offer_sent") patch["offer_sent_at"] = new Date().toISOString();
  await admin.from("recipients").update(patch as never).eq("id", recipientId);
}

/** Bisherigen Gespraechsverlauf einer Person fuer die KI aufbereiten. */
export async function conversationHistory(
  admin: Admin,
  recipientId: string,
  limit = 12,
): Promise<HistoryEntry[]> {
  const { data } = await admin
    .from("messages")
    .select("direction, body, created_at")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .reverse()
    .map((m) => ({ direction: m.direction === "in" ? "in" : "out", body: m.body, at: m.created_at }));
}

/**
 * Entscheidet, ob in dieser Antwort das Angebot des Bots platziert wird.
 * `offer_step` legt fest, ob das schon in der ersten oder erst in der zweiten
 * Antwort nach der Rueckmeldung der Person passiert.
 */
export function shouldPlaceOffer(
  bot: { offer_text?: string | null; offer_step?: number | null },
  recipient: { reply_count?: number | null; offer_sent_at?: string | null },
) {
  if (!bot.offer_text) return false;
  if (recipient.offer_sent_at) return false;
  const step = bot.offer_step === 1 ? 1 : 2;
  return (recipient.reply_count ?? 0) >= step;
}
