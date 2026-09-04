/**
 * Benachrichtigungen und manueller Modus.
 *
 * Wenn Facebook einen Checkpoint, ein CAPTCHA oder einen erneuten Login
 * verlangt, darf der Bot auf keinen Fall weiterarbeiten - jeder weitere
 * automatische Klick erhoeht das Sperrrisiko. Deshalb wird der Bot sofort
 * in den manuellen Modus gesetzt und eine Benachrichtigung erzeugt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Ereignisarten, die immer den manuellen Modus ausloesen. */
export const MANUAL_TRIGGER_TYPES = [
  "checkpoint",
  "captcha",
  "blocked",
  "login_required",
  "session_expired",
  "two_factor",
] as const;

export type ManualTrigger = (typeof MANUAL_TRIGGER_TYPES)[number];

/** Menschliche Beschriftung je Ausloeser. */
export const MANUAL_TRIGGER_LABEL: Record<string, string> = {
  checkpoint: "Facebook-Checkpoint",
  captcha: "CAPTCHA / Sicherheitsabfrage",
  blocked: "Konto gesperrt oder eingeschränkt",
  login_required: "Erneuter Login nötig",
  session_expired: "Sitzung abgelaufen",
  two_factor: "Zwei-Faktor-Bestätigung nötig",
};

/** Prueft, ob eine Ereignisart den manuellen Modus ausloesen muss. */
export function isManualTrigger(type?: string | null): type is ManualTrigger {
  return !!type && (MANUAL_TRIGGER_TYPES as readonly string[]).includes(type);
}

/** Legt eine Benachrichtigung an (erscheint in der Glocke oben rechts). */
export async function notify(
  admin: SupabaseClient,
  input: {
    userId: string;
    botId?: string | null;
    level?: "info" | "warn" | "error";
    type: string;
    title: string;
    body?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  await admin.from("notifications").insert({
    user_id: input.userId,
    bot_id: input.botId ?? null,
    level: input.level ?? "info",
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    meta: (input.meta ?? {}) as never,
  } as never);
}

/**
 * Setzt einen Bot sofort in den manuellen Modus: Automatik aus, Grund
 * festhalten, Freischaltung anstossen und den Betreiber benachrichtigen.
 */
export async function enterManualMode(
  admin: SupabaseClient,
  input: {
    userId: string;
    botId: string;
    trigger: string;
    message?: string | null;
    url?: string | null;
  },
) {
  const label = MANUAL_TRIGGER_LABEL[input.trigger] ?? input.trigger;
  const hard = input.trigger === "blocked";

  await admin
    .from("bots")
    .update({
      // Automatik komplett anhalten, damit kein weiterer Klick passiert
      paused: true,
      autopilot: false,
      manual_mode: true,
      manual_reason: `${label}${input.message ? `: ${input.message}` : ""}`,
      manual_since: new Date().toISOString(),
      session_status: hard ? "blocked" : "needs_login",
      // Freischaltung wartet auf dich - der Worker oeffnet auf Wunsch ein Fenster
      unlock_state: "needed",
      ...(hard ? { status: "blocked" } : {}),
    } as never)
    .eq("id", input.botId)
    .eq("user_id", input.userId);

  await notify(admin, {
    userId: input.userId,
    botId: input.botId,
    level: "error",
    type: input.trigger,
    title: `${label} erkannt — Bot im manuellen Modus`,
    body:
      input.message ??
      "Der Bot hat alle automatischen Aktionen gestoppt. Schalte ihn unter „Freischaltung“ wieder frei.",
    meta: input.url ? { url: input.url } : {},
  });
}

/**
 * Hebt den manuellen Modus auf, nachdem die Sitzung wieder gueltig ist.
 * Die Automatik bleibt bewusst aus - du entscheidest, wann es weitergeht.
 */
export async function clearManualMode(
  admin: SupabaseClient,
  input: { userId: string; botId: string; note?: string | null },
) {
  await admin
    .from("bots")
    .update({
      manual_mode: false,
      manual_reason: null,
      manual_since: null,
      session_status: "ok",
      unlock_state: "idle",
      unlock_requested_at: null,
      unlock_note: input.note ?? null,
    } as never)
    .eq("id", input.botId)
    .eq("user_id", input.userId);

  await notify(admin, {
    userId: input.userId,
    botId: input.botId,
    level: "info",
    type: "unlocked",
    title: "Bot wieder freigeschaltet",
    body: "Die Sitzung wurde gespeichert. Automatik kannst du auf der Bot-Seite wieder einschalten.",
  });
}
