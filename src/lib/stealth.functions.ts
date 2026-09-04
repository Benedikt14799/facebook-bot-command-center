/**
 * Serverfunktionen fuer Tarnung: Proxy-Zugangsdaten speichern (nie zurueckgeben)
 * und den hinterlegten Proxy serverseitig pruefen (Land, Anbieter, Hosting-IP).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProxyCheck } from "@/lib/stealth";

type SecretInput = {
  bot_id: string;
  proxy_password?: string | null;
  antidetect_key?: string | null;
};

/** Speichert Proxy-Passwort und Antidetect-Schluessel. Der Browser liest sie nie wieder. */
export const saveBotSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SecretInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { bot_id: data.bot_id, user_id: userId, updated_at: new Date().toISOString() };
    if (data.proxy_password !== undefined) patch['proxy_password'] = data.proxy_password || null;
    if (data.antidetect_key !== undefined) patch['antidetect_key'] = data.antidetect_key || null;
    const { error } = await supabase.from("bot_secrets").upsert(patch as never, { onConflict: "bot_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Meldet nur, ob Zugangsdaten hinterlegt sind (ohne Werte). */
export const getBotSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bot_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("bot_secrets")
      .select("proxy_password, antidetect_key")
      .eq("bot_id", data.bot_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      has_proxy_password: !!row?.proxy_password,
      has_antidetect_key: !!row?.antidetect_key,
    };
  });

async function lookupHost(host: string): Promise<ProxyCheck> {
  const started = Date.now();
  try {
    const r = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(host)}?fields=status,message,country,countryCode,isp,org,as,hosting,proxy,mobile,query`,
    );
    const j = (await r.json()) as Record<string, any>;
    if (j['status'] === "success") {
      return {
        ok: true,
        ip: j['query'],
        country: j['countryCode'],
        isp: j['isp'],
        org: j['org'],
        asn: j['as'],
        hosting: !!j['hosting'],
        type: j['mobile'] ? "mobile" : j['hosting'] ? "datacenter" : "residential",
        latency_ms: Date.now() - started,
      };
    }
    return { ok: false, message: j['message'] || "IP-Dienst lieferte kein Ergebnis", latency_ms: Date.now() - started };
  } catch (e) {
    return { ok: false, message: (e as Error).message, latency_ms: Date.now() - started };
  }
}

/** Prueft den hinterlegten Proxy-Endpunkt und speichert das Ergebnis am Bot. */
export const checkProxy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bot_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bot, error } = await supabase
      .from("bots")
      .select("id, proxy_type, proxy_host, proxy_country")
      .eq("id", data.bot_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bot) throw new Error("Bot nicht gefunden");
    if (!bot.proxy_host) throw new Error("Kein Proxy-Host hinterlegt");

    const result: ProxyCheck = {
      ...(await lookupHost(bot.proxy_host)),
      source: "cockpit",
      checked_at: new Date().toISOString(),
    };

    await supabase
      .from("bots")
      .update({ proxy_check: result as never, proxy_checked_at: result.checked_at! })
      .eq("id", data.bot_id);

    return result;
  });
