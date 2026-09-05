/**
 * Verschluesselung von Geheimnissen (Cookies, Sitzungsdaten, Proxy-Passwoerter).
 *
 * - Verfahren: AES-256-GCM, Schluessel ausschliesslich aus dem Secret-Management.
 * - Der Schluessel liegt nie in der Datenbank oder im Repository.
 * - Jeder Datensatz merkt sich die Schluesselkennung (enc_key_id), damit ein
 *   spaeterer Schluesselwechsel moeglich ist (V1 -> V2 …).
 *
 * Abgrenzung: Worker-Zugangsschluessel werden NICHT verschluesselt, sondern
 * als nicht rueckrechenbarer Hash gespeichert (siehe worker-auth.server.ts).
 */

const KEY_ENV_PREFIX = "WORKER_SECRETS_KEY_";

/** Aktuelle Schluesselkennung fuer neue Verschluesselungen. */
export function activeKeyId(): string | null {
  return process.env[`${KEY_ENV_PREFIX}V1`] ? "V1" : null;
}

async function importKey(keyId: string): Promise<CryptoKey | null> {
  const raw = process.env[`${KEY_ENV_PREFIX}${keyId}`];
  if (!raw) return null;
  // Schluesselmaterial deterministisch auf 32 Byte bringen.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Verschluesselt beliebige JSON-Daten. Gibt null zurueck, wenn kein Schluessel gesetzt ist. */
export async function encryptSecret(
  value: unknown,
): Promise<{ ciphertext: string; keyId: string } | null> {
  const keyId = activeKeyId();
  if (!keyId) return null;
  const key = await importKey(keyId);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value ?? null));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { ciphertext: `${toBase64(iv)}.${toBase64(new Uint8Array(buf))}`, keyId };
}

/** Entschluesselt zuvor abgelegte Daten. Gibt null zurueck, wenn es nicht moeglich ist. */
export async function decryptSecret<T = unknown>(
  ciphertext: string | null | undefined,
  keyId: string | null | undefined,
): Promise<T | null> {
  if (!ciphertext || !keyId) return null;
  const key = await importKey(keyId);
  if (!key) return null;
  const [ivPart, dataPart] = ciphertext.split(".");
  if (!ivPart || !dataPart) return null;
  try {
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivPart) },
      key,
      fromBase64(dataPart),
    );
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    return null;
  }
}
