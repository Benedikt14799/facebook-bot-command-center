/**
 * Server-Funktionen fuer die KI-Einstellungen.
 *
 * Der API-Schluessel wird nur serverseitig gelesen und geschrieben; der
 * Browser bekommt ihn nie zu sehen, sondern nur die Info, ob einer hinterlegt ist.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiSettingsView = {
  provider: string;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
};

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettingsView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_settings")
      .select("provider, model, base_url, api_key")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      provider: data?.provider ?? "lovable",
      model: data?.model ?? "google/gemini-3.7-flash",
      baseUrl: data?.base_url ?? null,
      hasKey: !!data?.api_key,
    };
  });

type SaveInput = {
  provider: string;
  model: string;
  baseUrl?: string | null;
  /** Leer lassen, um einen bereits gespeicherten Schluessel zu behalten. */
  apiKey?: string | null;
};

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveInput) => {
    if (!input?.provider || !input.model) throw new Error("Anbieter und Modell sind nötig");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      user_id: context.userId,
      provider: data.provider,
      model: data.model,
      base_url: data.baseUrl?.trim() || null,
    };
    if (data.apiKey && data.apiKey.trim()) patch["api_key"] = data.apiKey.trim();
    if (data.provider === "lovable") patch["api_key"] = null;

    const { error } = await supabaseAdmin
      .from("ai_settings")
      .upsert(patch as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAiConfig, callModel } = await import("@/lib/ai.server");
    const config = await loadAiConfig(supabaseAdmin as never, context.userId);
    try {
      const text = await callModel(
        config,
        "Du antwortest extrem kurz auf Deutsch.",
        "Sag nur: Verbindung steht.",
      );
      return {
        ok: true,
        provider: config.provider,
        model: config.model,
        sample: text.slice(0, 120),
      };
    } catch (err) {
      return {
        ok: false,
        provider: config.provider,
        model: config.model,
        error: (err as Error).message,
      };
    }
  });
