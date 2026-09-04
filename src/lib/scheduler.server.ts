/**
 * Automatik-Planer (nur serverseitig, wird von den Cron-Routen aufgerufen).
 *
 * Erzeugt selbststaendig Auftraege fuer Bots mit eingeschalteter Automatik --
 * innerhalb der Arbeitszeit, im Rahmen der Aufwaermphase und der Tages-Caps,
 * mit Zufalls-Jitter und Wochenendfaktor. Jeder Lauf ist begrenzt, laeuft nur
 * einmal gleichzeitig (Sperre) und pausiert bei KI-Problemen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { warmupInfo, parseWeights, weightedActionOrder } from "@/lib/warmup";
import { AiBlockedError, generateText, loadAiConfig, type AiConfig } from "@/lib/ai.server";
import { conversationHistory, shouldPlaceOffer } from "@/lib/contacts.server";

type Admin = SupabaseClient<Database>;

/** Maximale Anzahl Bots pro Lauf -- begrenzt die Arbeit je Aufruf. */
const BOT_BATCH = 25;
/** Maximale Anzahl neu erzeugter Jobs pro Bot und Lauf. */
const JOBS_PER_BOT = 2;
/** Wie lange eine Laufsperre gilt. */
const LOCK_MINUTES = 5;

export async function acquireLock(admin: Admin, name: string, minutes = LOCK_MINUTES) {
  const now = new Date();
  const until = new Date(now.getTime() + minutes * 60000).toISOString();

  const { data: existing } = await admin
    .from("job_locks")
    .select("name, locked_until")
    .eq("name", name)
    .maybeSingle();

  if (!existing) {
    const { error } = await admin.from("job_locks").insert({ name, locked_until: until });
    return !error;
  }
  if (new Date(existing.locked_until) > now) return false;

  const { data, error } = await admin
    .from("job_locks")
    .update({ locked_until: until })
    .eq("name", name)
    .lt("locked_until", now.toISOString())
    .select("name")
    .maybeSingle();
  return !error && !!data;
}

export async function releaseLock(admin: Admin, name: string) {
  await admin.from("job_locks").update({ locked_until: new Date().toISOString() }).eq("name", name);
}

/** Lokale Uhrzeit des Bots als Minuten seit Mitternacht. */
function localMinutes(timezone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: timezone || "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function isWeekend(timezone: string, now = new Date()) {
  try {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "Europe/Berlin", weekday: "short" }).format(now);
    return day === "Sat" || day === "Sun";
  } catch {
    return [0, 6].includes(now.getUTCDay());
  }
}

function startOfDayIso(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export type PlanResult = {
  botsChecked: number;
  jobsCreated: number;
  skipped: string[];
  paused: string[];
};

export async function runPlanner(admin: Admin, now = new Date()): Promise<PlanResult> {
  const result: PlanResult = { botsChecked: 0, jobsCreated: 0, skipped: [], paused: [] };
  // KI-Konfiguration je Nutzer nur einmal laden (eingebaute KI oder eigener Anbieter).
  const aiConfigs = new Map<string, AiConfig>();
  const aiConfigFor = async (userId: string) => {
    if (!aiConfigs.has(userId)) aiConfigs.set(userId, await loadAiConfig(admin, userId));
    return aiConfigs.get(userId)!;
  };

  const { data: bots } = await admin
    .from("bots")
    .select("*")
    .eq("autopilot", true)
    .eq("paused", false)
    .in("status", ["warmup", "live"])
    .limit(BOT_BATCH);

  const pausedUsers = new Set<string>();
  const { data: states } = await admin
    .from("automation_state")
    .select("user_id, paused")
    .eq("paused", true);
  for (const s of states ?? []) pausedUsers.add(s.user_id);

  for (const bot of bots ?? []) {
    result.botsChecked += 1;
    if (pausedUsers.has(bot.user_id)) {
      result.skipped.push(`${bot.name}: Automatik pausiert`);
      continue;
    }

    // 1. Arbeitszeit pruefen
    const minutes = localMinutes(bot.timezone, now);
    const from = toMinutes(bot.active_from);
    const to = toMinutes(bot.active_to);
    const inWindow = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
    if (!inWindow) {
      result.skipped.push(`${bot.name}: ausserhalb der Arbeitszeit`);
      continue;
    }

    // 2. Tageslimits aus Aufwaermphase + Wochenendfaktor
    const info = warmupInfo(bot, now);
    if (info.active && bot.warmup_paused) {
      result.skipped.push(`${bot.name}: Aufwaermphase pausiert`);
      continue;
    }
    const factor = isWeekend(bot.timezone, now) ? Number(bot.weekend_factor) || 1 : 1;
    const limits = {
      like: Math.floor(info.limits.likes * factor),
      comment: Math.floor(info.limits.comments * factor),
      dm_new_member: Math.floor(info.limits.dms * factor),
    };

    // 3. Heute bereits erzeugte Auftraege zaehlen (idempotent gegenueber Mehrfachlaeufen)
    const { data: todays } = await admin
      .from("jobs")
      .select("id, type, status, scheduled_for")
      .eq("bot_id", bot.id)
      .gte("created_at", startOfDayIso(now));

    const used: Record<string, number> = {};
    let openSoon = 0;
    for (const job of todays ?? []) {
      if (job.status !== "cancelled" && job.status !== "failed") {
        used[job.type] = (used[job.type] ?? 0) + 1;
      }
      if (
        (job.status === "pending" || job.status === "running") &&
        new Date(job.scheduled_for).getTime() < now.getTime() + 30 * 60000
      ) {
        openSoon += 1;
      }
    }
    // Nicht stapeln: solange noch etwas ansteht, nichts Neues planen.
    if (openSoon >= JOBS_PER_BOT) {
      result.skipped.push(`${bot.name}: genug offene Auftraege`);
      continue;
    }

    // 4. Ziele bestimmen
    const { data: links } = await admin
      .from("bot_groups")
      .select("group_id")
      .eq("bot_id", bot.id);
    const groupIds = (links ?? []).map((l) => l.group_id);

    let created = 0;
    // Reihenfolge und Textquelle richten sich nach dem Warmup-Profil des Bots.
    const weights = parseWeights((bot as { warmup_weights?: unknown }).warmup_weights);
    const useAi = bot.text_mode === "ai" && Math.random() * 100 < weights.ai;
    for (const type of weightedActionOrder(weights)) {
      if (created >= JOBS_PER_BOT - openSoon) break;
      const limit = limits[type];
      if (!limit || (used[type] ?? 0) >= limit) continue;

      const groupId = groupIds.length
        ? groupIds[Math.floor(Math.random() * groupIds.length)]!
        : null;

      let recipientId: string | null = null;
      let recipientName: string | null = null;
      let recipientFirstName: string | null = null;
      let recipientContext: string | null = null;
      let placeOffer = false;
      if (type === "dm_new_member" && groupId) {
        const { data: recipients } = await admin
          .from("recipients")
          .select("id, name, first_name, last_context, score, reply_count, offer_sent_at")
          .eq("group_id", groupId)
          .eq("blacklisted", false)
          .eq("state", "new")
          .order("score", { ascending: false })
          .limit(5);
        const pick = (recipients ?? [])[0];
        if (!pick) continue;
        recipientId = pick.id;
        recipientName = pick.name;
        recipientFirstName = pick.first_name ?? null;
        recipientContext = pick.last_context ?? null;
        placeOffer = shouldPlaceOffer(bot as never, pick as never);
      }

      // Text vorbereiten: KI oder Vorlage
      let text: string | null = null;
      if (type !== "like") {
        const group = groupId
          ? (await admin.from("groups").select("name, topic").eq("id", groupId).maybeSingle()).data
          : null;
        if (useAi) {
          try {
            // Gespraechsverlauf der Person als Kontext mitgeben
            const history = recipientId ? await conversationHistory(admin, recipientId) : [];
            text = await generateText(
              {
                kind: type === "comment" ? "comment" : "dm_new_member",
                tone: bot.tone,
                botName: bot.name,
                personaRole: (bot as { persona_role?: string | null }).persona_role ?? null,
                groupName: group?.name ?? null,
                groupTopic: group?.topic ?? null,
                recipientName,
                firstName: recipientFirstName,
                context: recipientContext ?? group?.topic ?? null,
                history,
                offer: placeOffer
                  ? {
                      text: (bot as { offer_text?: string | null }).offer_text ?? "",
                      link: (bot as { offer_link?: string | null }).offer_link ?? null,
                    }
                  : null,
              },
              await aiConfigFor(bot.user_id),
            );
          } catch (err) {
            if (err instanceof AiBlockedError) {
              await pauseAutomation(admin, bot.user_id, err.message);
              result.paused.push(bot.user_id);
              return result;
            }
            text = null;
          }
        }
        if (!text) {
          const { data: tpl } = await admin
            .from("templates")
            .select("body, variations")
            .eq("user_id", bot.user_id)
            .eq("kind", type === "comment" ? "comment" : "dm")
            .eq("active", true)
            .limit(5);
          const chosen = (tpl ?? [])[Math.floor(Math.random() * Math.max(1, (tpl ?? []).length))];
          const variants = Array.isArray(chosen?.variations) ? (chosen.variations as string[]) : [];
          text = variants.length
            ? variants[Math.floor(Math.random() * variants.length)]!
            : (chosen?.body ?? null);
          // Vorname in Vorlagen einsetzen
          if (text) {
            text = text
              .replace(/\{\{\s*(vorname|first_name)\s*\}\}/gi, recipientFirstName ?? "")
              .replace(/\{\{\s*name\s*\}\}/gi, recipientName ?? "")
              .replace(/\s{2,}/g, " ")
              .trim();
          }
        }
        if (!text) continue;
      }

      // 5. Zeitpunkt mit Zufalls-Jitter
      const jitter = Math.floor(Math.random() * ((bot.jitter_minutes || 15) * 60000));
      const scheduledFor = new Date(now.getTime() + 60000 + jitter).toISOString();

      const { error } = await admin.from("jobs").insert({
        user_id: bot.user_id,
        bot_id: bot.id,
        group_id: groupId,
        recipient_id: recipientId,
        type,
        status: "pending",
        source: "auto",
        needs_approval: bot.require_approval,
        scheduled_for: scheduledFor,
        generated_text: text,
        payload: { text, generated_by: useAi ? "ai" : "template", offer: placeOffer } as never,
      } as never);
      if (!error) {
        created += 1;
        result.jobsCreated += 1;
        used[type] = (used[type] ?? 0) + 1;
      }
    }

    await admin.from("automation_state").upsert(
      { user_id: bot.user_id, last_run_at: now.toISOString(), paused: false, last_error: null },
      { onConflict: "user_id" },
    );
  }

  return result;
}

/** Automatik fuer einen Nutzer anhalten und im Protokoll vermerken. */
export async function pauseAutomation(admin: Admin, userId: string, reason: string) {
  await admin.from("automation_state").upsert(
    { user_id: userId, paused: true, paused_reason: reason, last_error: reason },
    { onConflict: "user_id" },
  );
  await admin.from("events").insert({
    user_id: userId,
    level: "error",
    type: "automation_paused",
    message: `Automatik pausiert: ${reason}`,
  });
}

export type MaintenanceResult = {
  workersOffline: number;
  jobsRequeued: number;
  jobsFailed: number;
  simulated: number;
  botsPaused: number;
};

/**
 * Wartung: Worker-Offlineerkennung, haengende Jobs, Fehlerhaeufung,
 * sowie Abarbeitung der Jobs von Bots im Simulationsmodus.
 */
export async function runMaintenance(admin: Admin, now = new Date()): Promise<MaintenanceResult> {
  const res: MaintenanceResult = {
    workersOffline: 0,
    jobsRequeued: 0,
    jobsFailed: 0,
    simulated: 0,
    botsPaused: 0,
  };

  // 1. Worker ohne Lebenszeichen der letzten 5 Minuten
  const offlineCutoff = new Date(now.getTime() - 5 * 60000).toISOString();
  const { data: offline } = await admin
    .from("workers")
    .update({ status: "offline" })
    .eq("status", "online")
    .lt("last_seen_at", offlineCutoff)
    .select("id");
  res.workersOffline = offline?.length ?? 0;

  // 2. Haengende Jobs (zu lange "running")
  const stuckCutoff = new Date(now.getTime() - 20 * 60000).toISOString();
  const { data: stuck } = await admin
    .from("jobs")
    .select("id, attempts")
    .eq("status", "running")
    .lt("claimed_at", stuckCutoff)
    .limit(100);
  for (const job of stuck ?? []) {
    if (job.attempts >= 3) {
      await admin
        .from("jobs")
        .update({ status: "failed", error: "Zeitueberschreitung", finished_at: now.toISOString() })
        .eq("id", job.id);
      res.jobsFailed += 1;
    } else {
      await admin
        .from("jobs")
        .update({ status: "pending", claimed_at: null, claimed_by: null })
        .eq("id", job.id);
      res.jobsRequeued += 1;
    }
  }

  // 3. Simulationsmodus: faellige Jobs ohne echten Worker abarbeiten
  const { data: simBots } = await admin
    .from("bots")
    .select("id, user_id, name")
    .eq("simulate", true)
    .limit(50);
  for (const bot of simBots ?? []) {
    const { data: due } = await admin
      .from("jobs")
      .select("id, type, payload, group_id, recipient_id")
      .eq("bot_id", bot.id)
      .eq("status", "pending")
      .eq("needs_approval", false)
      .lte("scheduled_for", now.toISOString())
      .limit(10);
    for (const job of due ?? []) {
      await admin
        .from("jobs")
        .update({
          status: "done",
          finished_at: now.toISOString(),
          result: { simulated: true } as never,
        })
        .eq("id", job.id);
      const payload = (job.payload ?? {}) as { text?: string };
      if (payload.text) {
        await admin.from("messages").insert({
          user_id: bot.user_id,
          bot_id: bot.id,
          group_id: job.group_id,
          recipient_id: job.recipient_id,
          job_id: job.id,
          direction: "out",
          channel: job.type === "comment" ? "comment" : "dm",
          body: payload.text,
          source: "simulation",
        });
      }
      // Simulierte Aktionen ebenfalls in die Kontaktakte schreiben
      if (job.recipient_id) {
        await logContact(admin, {
          userId: bot.user_id,
          recipientId: job.recipient_id,
          botId: bot.id,
          groupId: job.group_id,
          jobId: job.id,
          kind:
            job.type === "like" || job.type === "like_posts"
              ? "like"
              : job.type === "dm_new_member"
                ? "welcome"
                : job.type.startsWith("comment")
                  ? "comment"
                  : "reply_out",
          direction: "out",
          body: (job.payload as { text?: string } | null)?.text ?? null,
          meta: { simulated: true },
        });
        await advanceStage(admin, job.recipient_id, "contacted");
      }
      res.simulated += 1;
    }
  }

  // 4. Fehlerhaeufung: 3+ Fehler in der letzten Stunde -> Bot pausieren
  const hourAgo = new Date(now.getTime() - 3600000).toISOString();
  const { data: errors } = await admin
    .from("events")
    .select("bot_id, user_id")
    .eq("level", "error")
    .gte("created_at", hourAgo)
    .not("bot_id", "is", null)
    .limit(500);
  const counts = new Map<string, { count: number; userId: string }>();
  for (const e of errors ?? []) {
    if (!e.bot_id) continue;
    const entry = counts.get(e.bot_id) ?? { count: 0, userId: e.user_id };
    entry.count += 1;
    counts.set(e.bot_id, entry);
  }
  for (const [botId, entry] of counts) {
    if (entry.count < 3) continue;
    const { data: bot } = await admin
      .from("bots")
      .select("id, name, paused, status, warmup_extra_days")
      .eq("id", botId)
      .maybeSingle();
    if (!bot || bot.paused) continue;
    await admin
      .from("bots")
      .update({
        paused: true,
        // Sicherheitsnetz: Aufwaermphase verlaengern statt weiterzulaufen
        warmup_extra_days: (bot.warmup_extra_days ?? 0) + 3,
      })
      .eq("id", botId);
    await admin.from("events").insert({
      user_id: entry.userId,
      bot_id: botId,
      level: "warn",
      type: "bot_auto_paused",
      message: `${bot.name} wegen ${entry.count} Fehlern in einer Stunde pausiert, Aufwaermphase um 3 Tage verlaengert.`,
    });
    res.botsPaused += 1;
  }

  return res;
}
