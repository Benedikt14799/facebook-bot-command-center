/**
 * Worker-API: Facebook-Cookies je Bot lesen und speichern.
 * Cookies sind fuer den Browser nicht lesbar - nur Worker/Service-Rolle.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateWorker, json, readJsonBody } from "@/lib/worker-auth.server";
import { normalizeAntidetect, normalizeBehavior, normalizeFingerprint } from "@/lib/stealth";
import { clearManualMode } from "@/lib/alerts.server";
import { decryptSecret, requireEncryptSecret } from "@/lib/secret-crypto.server";
import { SESSION_STATES } from "@/lib/worker-contract";

export const Route = createFileRoute("/api/public/worker/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const botId = new URL(request.url).searchParams.get("bot_id");
        if (!botId)
          return json({ error: { code: "invalid_payload", message: "bot_id fehlt." } }, 400);
        if (!ctx.allowedBotIds.includes(botId))
          return json(
            { error: { code: "forbidden", message: "Bot ist diesem Worker nicht zugeordnet." } },
            403,
          );

        // Tarnprofil: Proxy, Fingerprint, Verhalten und Antidetect-Konfiguration.
        const { data: bot, error: botError } = await ctx.admin
          .from("bots")
          .select(
            "proxy_type, proxy_protocol, proxy_host, proxy_port, proxy_user, proxy_country, proxy_rotate_url, fingerprint, behavior, browser_mode, antidetect",
          )
          .eq("id", botId)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (botError) return json({ error: { code: "server_error", message: botError.message } }, 500);
        if (!bot) return json({ error: { code: "not_found", message: "Bot nicht gefunden." } }, 404);

        const { data: sessionData, error: sessionError } = await ctx.admin
          .from("bot_sessions")
          .select("cookies_enc, enc_key_id, user_agent, updated_at")
          .eq("bot_id", botId)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (sessionError) return json({ error: { code: "server_error", message: sessionError.message } }, 500);

        const { data: secrets } = await ctx.admin
          .from("bot_secrets")
          .select("proxy_password_enc, antidetect_key_enc, enc_key_id")
          .eq("bot_id", botId)
          .eq("user_id", ctx.userId)
          .maybeSingle();

        // Nur verschluesselt abgelegte Geheimnisse werden ausgeliefert.
        // Kein Klartext-Fallback: schlaegt die Entschluesselung fehl, endet
        // die Anfrage mit einem strukturierten Fehler.
        const cookies = sessionData?.cookies_enc
          ? await decryptSecret<unknown[]>(sessionData.cookies_enc, sessionData.enc_key_id)
          : [];
        if (cookies === null)
          return json(
            {
              error: {
                code: "server_error",
                message: "Sitzungscookies konnten nicht entschlüsselt werden.",
              },
            },
            500,
          );

        let proxyPassword: string | null = null;
        if (secrets?.proxy_password_enc) {
          proxyPassword = await decryptSecret<string>(secrets.proxy_password_enc, secrets.enc_key_id);
          if (proxyPassword === null)
            return json(
              {
                error: {
                  code: "server_error",
                  message: "Proxy-Passwort konnte nicht entschlüsselt werden.",
                },
              },
              500,
            );
        }

        let antidetectKey: string | null = null;
        if (secrets?.antidetect_key_enc) {
          antidetectKey = await decryptSecret<string>(secrets.antidetect_key_enc, secrets.enc_key_id);
          if (antidetectKey === null)
            return json(
              {
                error: {
                  code: "server_error",
                  message: "Antidetect-Schlüssel konnte nicht entschlüsselt werden.",
                },
              },
              500,
            );
        }

        const fingerprint = normalizeFingerprint(bot.fingerprint);
        return json({
          cookies,
          user_agent: sessionData?.user_agent ?? fingerprint.user_agent ?? null,
          updated_at: sessionData?.updated_at ?? null,
          proxy: bot.proxy_host
            ? {
                type: bot.proxy_type,
                server: `${bot.proxy_protocol ?? "http"}://${bot.proxy_host}:${bot.proxy_port ?? 8080}`,
                username: bot.proxy_user ?? null,
                password: proxyPassword,
                country: bot.proxy_country ?? null,
                rotate_url: bot.proxy_rotate_url ?? null,
              }
            : null,
          fingerprint,
          behavior: normalizeBehavior(bot.behavior),
          browser_mode: bot.browser_mode ?? "stealth",
          antidetect: bot.antidetect
            ? { ...normalizeAntidetect(bot.antidetect), api_key: antidetectKey }
            : null,
        });
      },
      POST: async ({ request }) => {
        const ctx = await authenticateWorker(request);
        if (ctx instanceof Response) return ctx;
        const parsedBody = await readJsonBody(request);
        if (parsedBody instanceof Response) return parsedBody;
        const body = parsedBody as {
          bot_id?: string;
          cookies?: unknown;
          user_agent?: string;
          status?: string;
        } | null;
        if (!body?.bot_id)
          return json({ error: { code: "invalid_payload", message: "bot_id fehlt." } }, 400);
        if (!ctx.allowedBotIds.includes(body.bot_id))
          return json(
            { error: { code: "forbidden", message: "Bot ist diesem Worker nicht zugeordnet." } },
            403,
          );

        const state = typeof body.status === "string" ? body.status : "ok";
        if (!SESSION_STATES.includes(state as never)) {
          return json(
            {
              error: {
                code: "invalid_payload",
                message: `Ungültiger Sitzungszustand. Erlaubt: ${SESSION_STATES.join(", ")}.`,
              },
            },
            400,
          );
        }

        if (body.cookies) {
          let enc: { ciphertext: string; keyId: string };
          try {
            enc = await requireEncryptSecret(body.cookies);
          } catch {
            return json(
              {
                error: {
                  code: "server_error",
                  message: "Verschlüsselung nicht konfiguriert — Sitzung wurde nicht gespeichert.",
                },
              },
              500,
            );
          }
          const { error } = await ctx.admin.from("bot_sessions").upsert(
            {
              bot_id: body.bot_id,
              user_id: ctx.userId,
              // Cookies liegen ausschliesslich verschluesselt vor.
              cookies: [] as never,
              cookies_enc: enc.ciphertext,
              enc_key_id: enc.keyId,
              user_agent: body.user_agent ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "bot_id" },
          );
          if (error) return json({ error: { code: "server_error", message: error.message } }, 500);
        }

        const status = state;
        await ctx.admin
          .from("bots")
          .update({
            session_status: status,
            session_updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", body.bot_id)
          .eq("user_id", ctx.userId);

        // Frische, gueltige Cookies = die Freischaltung hat geklappt.
        if (body.cookies && status === "ok") {
          const { data: bot } = await ctx.admin
            .from("bots")
            .select("manual_mode")
            .eq("id", body.bot_id)
            .eq("user_id", ctx.userId)
            .maybeSingle();
          if ((bot as { manual_mode?: boolean } | null)?.manual_mode) {
            await clearManualMode(ctx.admin, { userId: ctx.userId, botId: body.bot_id });
          }
        }

        return json({ ok: true });
      },
    },
  },
});
