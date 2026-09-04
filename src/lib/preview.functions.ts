/**
 * Text- und Ton-Vorschau fuer Auftraege.
 *
 * Erzeugt genau den Text, den der Bot spaeter senden wuerde — mit demselben
 * Kontext wie im Echtbetrieb: Persona/Tonfall des Bots, Gruppe, Vorname der
 * Person, zuletzt erkannter Text und bisheriger Gespraechsverlauf. Es wird
 * nichts gesendet und nichts in der Kontaktakte gespeichert.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PreviewInput = {
  botId: string;
  type: string;
  groupId?: string | null;
  recipientId?: string | null;
  /** Erkannter Text (Kommentar/Beitrag/Nachricht), falls keine Person gewählt ist */
  context?: string | null;
};

export type PreviewResult = {
  text: string;
  /** Wie der Kontext zusammengesetzt wurde — wird unter der Vorschau angezeigt */
  used: {
    bot: string;
    persona?: string | null;
    tone?: string | null;
    group?: string | null;
    firstName?: string | null;
    context?: string | null;
    historyCount: number;
    offer: boolean;
    typoRate: number;
  };
};

export const previewJobText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PreviewInput) => input)
  .handler(async ({ data, context }): Promise<PreviewResult> => {
    const { supabase, userId } = context;
    const { generateText } = await import("@/lib/ai.server");
    const { loadAiConfig } = await import("@/lib/ai.server");
    const { conversationHistory, shouldPlaceOffer } = await import("@/lib/contacts.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bot } = await supabase
      .from("bots")
      .select("*")
      .eq("id", data.botId)
      .maybeSingle();
    if (!bot) throw new Error("Bot nicht gefunden");

    const group = data.groupId
      ? (await supabase.from("groups").select("name, topic").eq("id", data.groupId).maybeSingle())
          .data
      : null;

    const recipient = data.recipientId
      ? (await supabase.from("recipients").select("*").eq("id", data.recipientId).maybeSingle())
          .data
      : null;

    const history = data.recipientId
      ? await conversationHistory(supabaseAdmin, data.recipientId)
      : [];

    const b = bot as Record<string, unknown>;
    const offer = recipient
      ? shouldPlaceOffer(
          {
            offer_text: (b["offer_text"] as string | null) ?? null,
            offer_step: (b["offer_step"] as number | null) ?? null,
          },
          {
            reply_count: (recipient as { reply_count?: number }).reply_count ?? 0,
            offer_sent_at: (recipient as { offer_sent_at?: string | null }).offer_sent_at ?? null,
          },
        )
      : false;

    const kind =
      data.type === "comment_post" || data.type === "comment"
        ? ("comment" as const)
        : data.type === "reply_message" || data.type === "follow_up"
          ? ("reply_message" as const)
          : ("dm_new_member" as const);

    const ctxText =
      data.context?.trim() ||
      (recipient as { last_context?: string | null } | null)?.last_context ||
      group?.topic ||
      null;

    const typoRate = Number((b["typo_rate"] as number | null) ?? 0.12);

    const text = await generateText(
      {
        kind,
        tone: (b["tone"] as string | null) ?? null,
        botName: (b["name"] as string) ?? "Bot",
        personaRole: (b["persona_role"] as string | null) ?? null,
        groupName: group?.name ?? null,
        groupTopic: group?.topic ?? null,
        recipientName: (recipient as { name?: string | null } | null)?.name ?? null,
        firstName: (recipient as { first_name?: string | null } | null)?.first_name ?? null,
        context: ctxText,
        history,
        typoRate,
        offer: offer
          ? {
              text: (b["offer_text"] as string) ?? "",
              link: (b["offer_link"] as string | null) ?? null,
            }
          : null,
      },
      await loadAiConfig(supabaseAdmin, userId),
    );

    return {
      text,
      used: {
        bot: (b["name"] as string) ?? "Bot",
        persona: (b["persona_role"] as string | null) ?? null,
        tone: (b["tone"] as string | null) ?? null,
        group: group?.name ?? null,
        firstName: (recipient as { first_name?: string | null } | null)?.first_name ?? null,
        context: ctxText,
        historyCount: history.length,
        offer,
        typoRate,
      },
    };
  });
