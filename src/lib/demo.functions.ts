import { createServerFn } from "@tanstack/react-start";

export const DEMO_EMAIL = "demo@fbcontrol.app";
export const DEMO_PASSWORD = "demo-zugang-2026";

/**
 * Stellt sicher, dass der Demo-Account existiert (bestätigt, ohne E-Mail-Versand)
 * und legt einmalig ein paar Beispieldaten an.
 */
export const ensureDemoUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let userId: string | null = null;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { demo: true },
  });

  if (created?.user) {
    userId = created.user.id;
  } else if (createError) {
    // Existiert bereits -> Nutzer suchen und Passwort zurücksetzen
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email === DEMO_EMAIL);
    if (!existing) throw createError;
    userId = existing.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
  }

  if (!userId) throw new Error("Demo-Account konnte nicht erstellt werden");

  // Einmalige Beispieldaten
  const { count } = await supabaseAdmin
    .from("bots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!count) {
    const { data: bots } = await supabaseAdmin
      .from("bots")
      .insert([
        {
          user_id: userId,
          name: "Demo Bot — Anna",
          status: "live",
          warmup_day: 12,
          work_start: "08:00",
          work_end: "22:00",
          notes: "Demo-Profil für Gruppen-Engagement.",
        },
        {
          user_id: userId,
          name: "Demo Bot — Markus",
          status: "warmup",
          warmup_day: 3,
          work_start: "09:00",
          work_end: "18:00",
          notes: "Frisches Profil in der Aufwärmphase.",
        },
      ])
      .select("id");

    const { data: groups } = await supabaseAdmin
      .from("groups")
      .insert([
        {
          user_id: userId,
          name: "Immobilien Investoren DACH",
          fb_group_id: "123456789",
          topic: "Immobilien",
          language: "de",
          member_count: 18400,
          status: "active",
        },
        {
          user_id: userId,
          name: "Side Business & Cashflow",
          fb_group_id: "987654321",
          topic: "Business",
          language: "de",
          member_count: 7600,
          status: "active",
        },
      ])
      .select("id");

    const botId = bots?.[0]?.id;
    const groupId = groups?.[0]?.id;

    if (botId) {
      await supabaseAdmin.from("jobs").insert([
        {
          user_id: userId,
          bot_id: botId,
          group_id: groupId ?? null,
          type: "dm_new_member",
          status: "pending",
          payload: { note: "Begrüßung neuer Mitglieder" },
        },
        {
          user_id: userId,
          bot_id: botId,
          group_id: groupId ?? null,
          type: "like",
          status: "done",
          payload: { note: "Beiträge geliked" },
        },
      ]);

      await supabaseAdmin.from("messages").insert([
        {
          user_id: userId,
          bot_id: botId,
          direction: "outbound",
          body: "Hey, willkommen in der Gruppe! Woran arbeitest du gerade?",
          channel: "dm",
        },
        {
          user_id: userId,
          bot_id: botId,
          direction: "inbound",
          body: "Danke dir! Ich schaue mich gerade nach Objekten im Ruhrgebiet um.",
          channel: "dm",
        },
      ]);

      await supabaseAdmin.from("events").insert([
        {
          user_id: userId,
          bot_id: botId,
          level: "info",
          message: "Demo-Daten geladen.",
        },
      ]);
    }
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
});
