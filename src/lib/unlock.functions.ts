/**
 * Cockpit-Seite der visuellen Freischaltung.
 *
 * Enthaelt alles, was der Browser NICHT direkt darf: Cookies schreiben
 * (bot_sessions ist fuer den Browser nicht lesbar) und den manuellen Modus
 * aufheben.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Freischaltung anfordern: der Worker oeffnet beim naechsten Poll ein Fenster. */
export const requestUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bots")
      .update({
        unlock_state: "requested",
        unlock_requested_at: new Date().toISOString(),
        unlock_note: null,
      } as never)
      .eq("id", data.botId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Angeforderte Freischaltung wieder zuruecknehmen. */
export const cancelUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bots")
      .update({ unlock_state: "needed", unlock_requested_at: null } as never)
      .eq("id", data.botId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cookies von Hand einspielen (Export aus deinem eigenen Browser).
 * Akzeptiert das uebliche JSON-Array aus Cookie-Editor-Erweiterungen.
 */
export const saveSessionCookies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string; cookiesJson: string; userAgent?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearManualMode } = await import("@/lib/alerts.server");

    let cookies: unknown;
    try {
      cookies = JSON.parse(data.cookiesJson);
    } catch {
      throw new Error("Das ist kein gültiges JSON. Exportiere die Cookies als JSON-Array.");
    }
    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error("Erwartet wird ein JSON-Array mit Cookies.");
    }
    const hasSession = cookies.some(
      (c) => typeof c === "object" && c !== null && (c as { name?: string }).name === "c_user",
    );
    if (!hasSession) {
      throw new Error(
        "Im Export fehlt das Facebook-Login-Cookie (c_user). Exportiere die Cookies, während du angemeldet bist.",
      );
    }

    // Gehoert der Bot wirklich mir? (RLS-Prüfung über den Nutzer-Client)
    const { data: bot } = await context.supabase
      .from("bots")
      .select("id")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) throw new Error("Bot nicht gefunden");

    const { error } = await supabaseAdmin.from("bot_sessions").upsert(
      {
        bot_id: data.botId,
        user_id: context.userId,
        cookies: cookies as never,
        user_agent: data.userAgent ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "bot_id" },
    );
    if (error) throw new Error(error.message);

    await clearManualMode(supabaseAdmin, { userId: context.userId, botId: data.botId });
    return { ok: true, count: cookies.length };
  });

/** Manuellen Modus ohne neue Cookies aufheben (z. B. nach eigener Prüfung). */
export const releaseManualMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { botId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearManualMode } = await import("@/lib/alerts.server");
    const { data: bot } = await context.supabase
      .from("bots")
      .select("id")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) throw new Error("Bot nicht gefunden");
    await clearManualMode(supabaseAdmin, {
      userId: context.userId,
      botId: data.botId,
      note: "Von Hand freigegeben",
    });
    return { ok: true };
  });
