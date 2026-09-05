/**
 * Nachträgliche Verschlüsselung von Altbestand (Cookies, Proxy-Passwörter,
 * Antidetect-Schlüssel).
 *
 * - Läuft nur für den angemeldeten Benutzer.
 * - Bereits verschlüsselte Datensätze werden übersprungen.
 * - Klartext wird erst geleert, nachdem die Verschlüsselung erfolgreich war.
 * - Die Zusammenfassung nennt ausschließlich Anzahlen, niemals Inhalte.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const encryptLegacySecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireEncryptSecret } = await import("@/lib/secret-crypto.server");
    const supabase = context.supabase;

    let sessions = 0;
    let secrets = 0;
    let skipped = 0;

    const { data: sessionRows } = await supabase
      .from("bot_sessions")
      .select("bot_id, cookies, cookies_enc")
      .eq("user_id", context.userId);

    for (const row of sessionRows ?? []) {
      if (row.cookies_enc) {
        skipped++;
        continue;
      }
      const cookies = row.cookies as unknown;
      if (!Array.isArray(cookies) || cookies.length === 0) {
        skipped++;
        continue;
      }
      const enc = await requireEncryptSecret(cookies);
      const { error } = await supabase
        .from("bot_sessions")
        .update({ cookies_enc: enc.ciphertext, enc_key_id: enc.keyId, cookies: [] as never })
        .eq("bot_id", row.bot_id)
        .eq("user_id", context.userId);
      if (!error) sessions++;
    }

    const { data: secretRows } = await supabase
      .from("bot_secrets")
      .select("bot_id, proxy_password, proxy_password_enc, antidetect_key, antidetect_key_enc")
      .eq("user_id", context.userId);

    for (const row of secretRows ?? []) {
      const patch: Record<string, unknown> = {};
      let keyId: string | null = null;
      if (row.proxy_password && !row.proxy_password_enc) {
        const enc = await requireEncryptSecret(row.proxy_password);
        patch["proxy_password_enc"] = enc.ciphertext;
        patch["proxy_password"] = null;
        keyId = enc.keyId;
      }
      if (row.antidetect_key && !row.antidetect_key_enc) {
        const enc = await requireEncryptSecret(row.antidetect_key);
        patch["antidetect_key_enc"] = enc.ciphertext;
        patch["antidetect_key"] = null;
        keyId = enc.keyId;
      }
      if (!Object.keys(patch).length) {
        skipped++;
        continue;
      }
      if (keyId) patch["enc_key_id"] = keyId;
      const { error } = await supabase
        .from("bot_secrets")
        .update(patch as never)
        .eq("bot_id", row.bot_id)
        .eq("user_id", context.userId);
      if (!error) secrets++;
    }

    return { sessions, secrets, skipped };
  });
