/**
 * Gemeinsame Worker-Status-Logik fuer Cockpit und Worker-Health.
 *
 * Der gespeicherte Wert in workers.status wird nur so lange verwendet, wie
 * der letzte Heartbeat nicht aelter als 5 Minuten ist. Danach gilt der Worker
 * als offline — unabhaengig vom Datenbankfeld. So zeigen alle Seiten denselben
 * effektiven Zustand.
 */

/** Ein Worker gilt als offline, wenn sein letzter Heartbeat aelter ist. */
export const WORKER_OFFLINE_AFTER_MS = 5 * 60 * 1000;

/** Effektiver Status eines Workers anhand von last_seen_at berechnen. */
export function effectiveWorkerStatus(
  status: string,
  lastSeenAt: string | null,
): "online" | "offline" | "unknown" {
  if (!lastSeenAt) return "offline";
  const age = Date.now() - new Date(lastSeenAt).getTime();
  if (age > WORKER_OFFLINE_AFTER_MS) return "offline";
  if (status === "online" || status === "offline") return status as "online" | "offline";
  return "online";
}

/** Kurzform: true, wenn der Worker effektiv offline ist. */
export function isWorkerOffline(lastSeenAt: string | null): boolean {
  return effectiveWorkerStatus("online", lastSeenAt) === "offline";
}
