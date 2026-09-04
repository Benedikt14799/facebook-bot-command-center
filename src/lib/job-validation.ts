/**
 * Verbindliche Validierung von Auftraegen: sowohl fuer die Oberflaeche als
 * auch fuer Serverfunktion, Worker-Abholung und Datenbank-Trigger.
 *
 * Ziel: unvollstaendige Auftraege koennen nie als "pending" gespeichert oder
 * vom Worker ausgefuehrt werden.
 */

export type JobType =
  "dm_new_member" | "reply_message" | "like_posts" | "comment_post" | "scan_group" | "follow_up";

/** Pflichtfeld-Regeln fuer jeden Auftragstyp. */
export type JobRequirement =
  | { kind: "group"; message: string }
  | { kind: "recipient"; message: string }
  | { kind: "count"; min: number; max: number; message: string }
  | { kind: "post"; message: string }
  | { kind: "limit"; min: number; max: number; message: string };

const REQUIREMENTS: Record<JobType, JobRequirement[]> = {
  like_posts: [
    { kind: "group", message: "Für ‚Beiträge liken‘ muss eine Gruppe ausgewählt werden." },
    {
      kind: "count",
      min: 1,
      max: 20,
      message: "Für ‚Beiträge liken‘ muss die Anzahl der Likes zwischen 1 und 20 liegen.",
    },
  ],
  comment_post: [
    { kind: "group", message: "Für ‚Beitrag kommentieren‘ muss eine Gruppe ausgewählt werden." },
    {
      kind: "post",
      message: "Für ‚Beitrag kommentieren‘ muss post_url oder post_id angegeben werden.",
    },
  ],
  scan_group: [
    { kind: "group", message: "Für ‚Gruppe scannen‘ muss eine Gruppe ausgewählt werden." },
  ],
  dm_new_member: [
    {
      kind: "recipient",
      message:
        "Für ‚Neues Gruppenmitglied anschreiben‘ muss eine Person (recipient_id oder profile_url) angegeben werden.",
    },
  ],
  reply_message: [
    {
      kind: "recipient",
      message: "Für ‚Auf Nachricht antworten‘ muss eine Person (recipient_id) angegeben werden.",
    },
  ],
  follow_up: [
    {
      kind: "recipient",
      message: "Für ‚Follow-up-Nachricht‘ muss eine Person (recipient_id) angegeben werden.",
    },
  ],
};

/** Alle bekannten Auftragstypen, die validiert werden koennen. */
export const VALIDATED_JOB_TYPES = Object.keys(REQUIREMENTS) as JobType[];

/** Prueft, ob ein Auftragstyp ueberhaupt validiert wird. */
export function isKnownJobType(type: string): type is JobType {
  return type in REQUIREMENTS;
}

/** Rohe Payload als Objekt normalisieren (auch Json-Typ aus Supabase). */
function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

/** Einzelne Regel gegen einen Auftrag pruefen. */
function checkRequirement(
  req: JobRequirement,
  groupId: string | null | undefined,
  recipientId: string | null | undefined,
  payload: Record<string, unknown>,
): string | null {
  switch (req.kind) {
    case "group":
      return groupId ? null : req.message;
    case "recipient": {
      if (recipientId) return null;
      const p = asRecord(payload);
      if (p["recipient_id"] && typeof p["recipient_id"] === "string") return null;
      if (p["profile_url"] && typeof p["profile_url"] === "string") return null;
      return req.message;
    }
    case "count": {
      const p = asRecord(payload);
      const count = typeof p["count"] === "number" ? p["count"] : Number(p["count"]);
      if (Number.isFinite(count) && count >= req.min && count <= req.max) return null;
      return req.message;
    }
    case "post": {
      const p = asRecord(payload);
      if (p["post_url"] && typeof p["post_url"] === "string") return null;
      if (p["post_id"] && typeof p["post_id"] === "string") return null;
      return req.message;
    }
    case "limit": {
      const p = asRecord(payload);
      if (p["limit"] === undefined) return null; // optional
      const limit = typeof p["limit"] === "number" ? p["limit"] : Number(p["limit"]);
      if (Number.isFinite(limit) && limit >= req.min && limit <= req.max) return null;
      return req.message;
    }
  }
}

/** Validierungsergebnis. */
export type JobValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Validiert einen Auftrag gegen das verbindliche Schema.
 * Wird im Dialog, in Serverfunktionen, im Worker-Poll und im DB-Trigger genutzt.
 */
export function validateJob(
  type: string,
  groupId: string | null | undefined,
  recipientId: string | null | undefined,
  payload: unknown,
): JobValidationResult {
  if (!isKnownJobType(type)) {
    return { valid: false, errors: [`Unbekannter Auftragstyp: ${type}`] };
  }
  const errors: string[] = [];
  const normalizedPayload = asRecord(payload);
  for (const req of REQUIREMENTS[type]) {
    const err = checkRequirement(req, groupId, recipientId, normalizedPayload);
    if (err) errors.push(err);
  }
  if (errors.length) return { valid: false, errors };
  return { valid: true };
}

/** Kurzform, die direkt einen Fehler wirft. */
export function assertJobValid(
  type: string,
  groupId: string | null | undefined,
  recipientId: string | null | undefined,
  payload: unknown,
): void {
  const result = validateJob(type, groupId, recipientId, payload);
  if (!result.valid) throw new Error(result.errors.join(" "));
}
