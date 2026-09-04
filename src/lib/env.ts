/**
 * Pruefung der benoetigten Umgebungsvariablen beim Start.
 *
 * Fehlt clientseitig etwas, bricht die App frueh mit einer klaren Meldung ab,
 * statt spaeter mit kryptischen Fehlern. Serverseitige Schluessel werden nur
 * geprueft, wenn der Code tatsaechlich auf dem Server laeuft.
 */

/** Im Browser-Bundle benoetigt (werden beim Build eingesetzt). */
const CLIENT_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
] as const;

/** Nur auf dem Server noetig (Serverfunktionen, Cron, KI). */
const SERVER_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/** Optional -- fehlt sie, faellt nur eine Funktion aus. */
const OPTIONAL_SERVER_VARS: Record<string, string> = {
  LOVABLE_API_KEY: "KI-Textgenerierung (Aufträge nutzen dann nur Vorlagen)",
};

export type EnvCheck = {
  ok: boolean;
  missingClient: string[];
  missingServer: string[];
  missingOptional: string[];
};

export function checkEnv(): EnvCheck {
  const clientEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const isServer = typeof window === "undefined";
  const serverEnv =
    (isServer
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      : undefined) ?? {};

  const missingClient = CLIENT_VARS.filter((k) => !clientEnv[k] && !serverEnv[k]);
  const missingServer = isServer ? SERVER_VARS.filter((k) => !serverEnv[k] && !clientEnv[k]) : [];
  const missingOptional = isServer
    ? Object.keys(OPTIONAL_SERVER_VARS).filter((k) => !serverEnv[k])
    : [];

  return {
    ok: missingClient.length === 0 && missingServer.length === 0,
    missingClient,
    missingServer,
    missingOptional,
  };
}

/**
 * Beim Start aufrufen. Fehlende Pflichtwerte werden deutlich protokolliert;
 * im Browser wird zusaetzlich ein Fehler geworfen, weil ohne diese Werte
 * keine Verbindung zur Datenbank moeglich ist.
 */
export function validateEnv() {
  const result = checkEnv();

  for (const key of result.missingOptional) {
    console.warn(`[env] Optionale Variable ${key} fehlt — betroffen: ${OPTIONAL_SERVER_VARS[key]}`);
  }

  if (result.ok) return result;

  const missing = [...result.missingClient, ...result.missingServer];
  const message =
    `[env] Es fehlen benötigte Umgebungsvariablen: ${missing.join(", ")}. ` +
    `Lege sie in einer .env-Datei an (Vorlage: .env.example).`;

  console.error(message);
  if (result.missingClient.length > 0) throw new Error(message);
  return result;
}
