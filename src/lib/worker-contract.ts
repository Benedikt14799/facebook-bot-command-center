/**
 * Zentrale Vertragsspezifikation zwischen Cockpit und Worker.
 *
 * Alles, was Oberflaeche, Serverfunktionen, Worker-API und Dokumentation
 * gemeinsam brauchen, steht hier — damit die Regeln nicht auseinanderlaufen.
 * Technische Werte sind immer englisch; deutsche Begriffe nur in der Anzeige.
 */

export const CONTRACT_VERSION = "1.0";

/** Kanonische Auftragszustaende. "claimed" gibt es fachlich nicht. */
export const JOB_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Endzustaende — danach ist ein Auftrag unveraenderlich. */
export const TERMINAL_STATUSES: JobStatus[] = ["done", "failed", "skipped", "cancelled"];

/** Zustaende, die ein Worker melden darf. */
export const REPORTABLE_STATUSES = ["done", "failed", "skipped"] as const;

/** Sicherheitszustand einer Bot-Sitzung. */
export const SESSION_STATES = [
  "missing",
  "ok",
  "expired",
  "needs_login",
  "checkpoint",
  "captcha",
  "revoked",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Sitzungszustaende, bei denen keine Auftraege ausgeliefert werden. */
export const BLOCKING_SESSION_STATES: string[] = [
  "expired",
  "needs_login",
  "checkpoint",
  "captcha",
  "revoked",
];

/** Faehigkeit, die ein Worker fuer einen Auftragstyp mitbringen muss. */
export const CAPABILITY_BY_JOB_TYPE: Record<string, string> = {
  like_posts: "like",
  comment_post: "comment",
  scan_group: "scan",
  dm_new_member: "dm",
  reply_message: "reply",
};

export const ALL_CAPABILITIES = [...new Set(Object.values(CAPABILITY_BY_JOB_TYPE))];

/** Betriebsmodi eines Workers. */
export const WORKER_MODES = ["dry_run", "live"] as const;

/** Deutsche Anzeige der technischen Zustaende (nur Oberflaeche). */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Offen",
  running: "Läuft",
  done: "Erledigt",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
  cancelled: "Abgebrochen",
};

/** Einheitliches Fehlerformat aller Worker-Endpunkte. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_json"
  | "invalid_payload"
  | "not_found"
  | "conflict"
  | "status_mismatch"
  | "result_mismatch"
  | "verification_required"
  | "dry_run_mode"
  | "server_error";

/**
 * Wirksamer Betriebsmodus eines Workers — zentral und ueberall identisch.
 * Nur eine serverseitige Freigabe (live_enabled) zusammen mit mode = "live"
 * ergibt "live"; alles andere bleibt "dry_run".
 */
export function computeEffectiveMode(worker: {
  mode?: string | null;
  live_enabled?: boolean | null;
} | null | undefined): "dry_run" | "live" {
  return worker?.live_enabled === true && worker?.mode === "live" ? "live" : "dry_run";
}
