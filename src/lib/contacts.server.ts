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

export { STAGES, STAGE_LABEL, KIND_LABEL } from "@/lib/contact-labels";
import { STAGES, type Stage } from "@/lib/contact-labels";
export type { Stage };

/** Titel/Zusaetze, die nie ein Vorname sind. */
const TITLES = new Set([
  "dr",
  "dr.",
  "prof",
  "prof.",
  "med",
  "dipl",
  "ing",
  "herr",
  "frau",
  "mr",
  "mrs",
  "ms",
]);

/** Namensteile, die nur Beiwerk sind. */
const PARTICLES = new Set(["von", "van", "de", "del", "di", "der", "den", "zu", "la", "le"]);

/** Grossschreibung normalisieren: "benedikt" -> "Benedikt", "anna-lena" -> "Anna-Lena". */
function capitalize(word: string) {
  return word
    .split(/([-'’])/)
    .map((p) => (/^[-'’]$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join("");
}

/** Emojis, Klammerzusaetze, Rollen-Suffixe und Satzzeichen entfernen. */
function cleanName(raw: string) {
  return raw
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[·|•]/g, " ")
    .replace(/\s*[-–—]\s*(Admin|Moderator|Gruppenadmin|Autor)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type ParsedName = {
  /** Aufgeraeumter voller Name */
  name: string | null;
  /** Vorname fuer die Anrede */
  firstName: string | null;
  /** Woraus der Name stammt: name | reversed | profile_url | text */
  source: string | null;
};

/**
 * Robustes Namens-Parsing aus dem, was der Worker meldet.
 * Beruecksichtigt: "Müller, Benedikt", Titel ("Dr. Anna-Lena Schmidt"),
 * Emojis/Zusaetze, Kleinschreibung, Satzeinleitungen ("Kommentar von …")
 * und als letzten Ausweg den Slug der Profil-URL.
 */
export function parseName(input: {
  name?: string | null;
  profileUrl?: string | null;
  text?: string | null;
}): ParsedName {
  let source: string | null = null;
  let full: string | null = null;

  const raw = input.name ? cleanName(input.name) : "";
  if (raw) {
    source = "name";
    // "Müller, Benedikt" -> "Benedikt Müller"
    if (raw.includes(",")) {
      const [last, first] = raw.split(",").map((s) => s.trim());
      if (first && last) {
        full = `${first} ${last}`;
        source = "reversed";
      }
    }
    // "Kommentar von Benedikt Müller" / "Nachricht von …"
    const via = raw.match(/\bvon\s+([\p{L}][\p{L}'’-]+(?:\s+[\p{L}][\p{L}'’-]+){0,2})$/u);
    if (!full && via?.[1] && /^(kommentar|nachricht|beitrag|antwort)/i.test(raw)) {
      full = via[1];
      source = "text";
    }
    full = full ?? raw;
  }

  // Fallback: Slug der Profil-URL, z. B. /benedikt.mueller oder /profile.php?id=…
  if (!full && input.profileUrl) {
    const slug = input.profileUrl
      .split("?")[0]!
      .replace(/\/+$/, "")
      .split("/")
      .pop();
    if (slug && !/^profile\.php$/i.test(slug) && /[a-zA-Z]/.test(slug)) {
      const parts = slug
        .replace(/-\d+$/, "")
        .split(/[._-]/)
        .filter((p) => p.length > 1 && !/^\d+$/.test(p));
      if (parts.length) {
        full = parts.map(capitalize).join(" ");
        source = "profile_url";
      }
    }
  }

  if (!full) return { name: null, firstName: null, source: null };

  const tokens = full
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}.'’-]+$/gu, ""))
    .filter(Boolean);

  const nameTokens = tokens.map((t) => (t === t.toUpperCase() || t === t.toLowerCase() ? capitalize(t) : t));

  const firstToken = nameTokens.find(
    (t) =>
      !TITLES.has(t.toLowerCase().replace(/\.$/, "")) &&
      !PARTICLES.has(t.toLowerCase()) &&
      t.replace(/[^\p{L}]/gu, "").length > 1,
  );

  return {
    name: nameTokens.join(" ") || null,
    firstName: firstToken ? firstToken.replace(/[.,]$/, "") : null,
    source,
  };
}

/** Vorname aus einem vollen Namen ableiten. */
export function firstNameOf(name?: string | null) {
  if (!name) return null;
  return parseName({ name }).firstName;
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
  /** Unveraenderte Rohdaten des Worker-Events (zur Nachvollziehbarkeit) */
  rawEvent?: Record<string, unknown> | null;
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
  kind: string;
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
