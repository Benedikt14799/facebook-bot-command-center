/**
 * Aufwaermphasen-Logik (browser- und serverseitig nutzbar).
 *
 * Ein Aufwaermplan besteht aus Stufen: ab Tag X gelten diese Tagesmengen.
 * Der Planer und die Oberflaeche berechnen daraus identische Werte.
 */

export type WarmupStage = {
  /** Tag, ab dem diese Stufe gilt (1 = erster Tag der Aufwaermphase) */
  day: number;
  likes: number;
  comments: number;
  dms: number;
};

export type WarmupPreset = "vorsichtig" | "normal" | "zuegig" | "eigen";

/** Fertige Aufwaermkurven zum Auswaehlen. */
export const WARMUP_PRESETS: Record<Exclude<WarmupPreset, "eigen">, WarmupStage[]> = {
  vorsichtig: [
    { day: 1, likes: 2, comments: 0, dms: 0 },
    { day: 5, likes: 4, comments: 1, dms: 0 },
    { day: 10, likes: 8, comments: 2, dms: 1 },
    { day: 16, likes: 12, comments: 4, dms: 3 },
    { day: 24, likes: 20, comments: 6, dms: 6 },
  ],
  normal: [
    { day: 1, likes: 3, comments: 0, dms: 0 },
    { day: 3, likes: 6, comments: 1, dms: 0 },
    { day: 6, likes: 10, comments: 3, dms: 2 },
    { day: 10, likes: 16, comments: 5, dms: 5 },
    { day: 15, likes: 25, comments: 8, dms: 10 },
  ],
  zuegig: [
    { day: 1, likes: 5, comments: 1, dms: 0 },
    { day: 3, likes: 12, comments: 3, dms: 2 },
    { day: 5, likes: 20, comments: 6, dms: 6 },
    { day: 8, likes: 30, comments: 10, dms: 12 },
  ],
};

/** Liest einen (evtl. per JSON gespeicherten) Plan robust ein. */
export function parsePlan(raw: unknown): WarmupStage[] {
  const list = Array.isArray(raw) ? raw : [];
  const stages = list
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        day: Math.max(1, Number(o["day"]) || 1),
        likes: Math.max(0, Number(o["likes"]) || 0),
        comments: Math.max(0, Number(o["comments"]) || 0),
        dms: Math.max(0, Number(o["dms"]) || 0),
      };
    })
    .sort((a, b) => a.day - b.day);
  return stages.length ? stages : WARMUP_PRESETS.normal;
}

/** Ganze Tage seit Beginn der Aufwaermphase; Tag 1 = Starttag. */
export function warmupDay(warmupStart: string | null | undefined, now = new Date()) {
  if (!warmupStart) return 1;
  const start = new Date(`${warmupStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return Math.max(1, days + 1);
}

/** Gesamtdauer der Aufwaermphase (letzte Stufe + Verlaengerung). */
export function warmupTotalDays(plan: WarmupStage[], extraDays = 0) {
  const last = plan[plan.length - 1];
  return (last ? last.day : 1) + Math.max(0, extraDays);
}

export type BotWarmupInput = {
  status: string;
  warmup_start: string | null;
  warmup_plan: unknown;
  warmup_paused?: boolean;
  warmup_extra_days?: number;
  cap_likes: number;
  cap_comments: number;
  cap_dms: number;
};

export type WarmupInfo = {
  /** Ist der Bot noch in der Aufwaermphase? */
  active: boolean;
  day: number;
  totalDays: number;
  stageIndex: number;
  stage: WarmupStage | null;
  plan: WarmupStage[];
  /** Tageslimits, die heute tatsaechlich gelten. */
  limits: { likes: number; comments: number; dms: number };
  /** Fortschritt 0..1 */
  progress: number;
  /** Voraussichtliches Datum des Uebergangs auf "live" (ISO-Datum) */
  liveDate: string | null;
};

/**
 * Berechnet Stufe, Tageslimits und Fortschritt eines Bots.
 * Ausserhalb der Aufwaermphase gelten die normalen Tages-Caps des Bots.
 */
export function warmupInfo(bot: BotWarmupInput, now = new Date()): WarmupInfo {
  const plan = parsePlan(bot.warmup_plan);
  const extra = bot.warmup_extra_days ?? 0;
  const totalDays = warmupTotalDays(plan, extra);
  const rawDay = warmupDay(bot.warmup_start, now);
  // Der Tag laeuft nie ueber die Gesamtdauer hinaus.
  const day = Math.min(rawDay, totalDays);
  const active = bot.status === "warmup";

  let stageIndex = -1;
  for (let i = 0; i < plan.length; i += 1) {
    const stage = plan[i]!;
    if (day >= stage.day) stageIndex = i;
  }
  const stage = stageIndex >= 0 ? plan[stageIndex]! : null;

  const limits =
    active && stage
      ? {
          likes: Math.min(stage.likes, bot.cap_likes),
          comments: Math.min(stage.comments, bot.cap_comments),
          dms: Math.min(stage.dms, bot.cap_dms),
        }
      : { likes: bot.cap_likes, comments: bot.cap_comments, dms: bot.cap_dms };

  let liveDate: string | null = null;
  if (bot.warmup_start && !bot.warmup_paused) {
    const start = new Date(`${bot.warmup_start}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + totalDays * 86400000);
      liveDate = end.toISOString().slice(0, 10);
    }
  }

  return {
    active,
    day,
    totalDays,
    stageIndex,
    stage,
    plan,
    limits,
    progress: Math.min(1, day / Math.max(1, totalDays)),
    liveDate,
  };
}

export const WARMUP_LABEL: Record<string, string> = {
  likes: "Likes",
  comments: "Kommentare",
  dms: "Nachrichten",
};

/**
 * Warmup-Profil-Gewichte je Bot.
 * like/comment/dm steuern, welche Aktionsart bevorzugt geplant wird,
 * ai steuert den Anteil KI-generierter Texte (0-100 Prozent).
 */
export type WarmupWeights = {
  like: number;
  comment: number;
  dm: number;
  ai: number;
};

export const DEFAULT_WEIGHTS: WarmupWeights = { like: 5, comment: 2, dm: 1, ai: 50 };

/** Liest die Gewichte robust ein und begrenzt sie auf sinnvolle Bereiche. */
export function parseWeights(raw: unknown): WarmupWeights {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : fallback;
  };
  return {
    like: num(o["like"], DEFAULT_WEIGHTS.like, 10),
    comment: num(o["comment"], DEFAULT_WEIGHTS.comment, 10),
    dm: num(o["dm"], DEFAULT_WEIGHTS.dm, 10),
    ai: num(o["ai"], DEFAULT_WEIGHTS.ai, 100),
  };
}

/**
 * Reihenfolge der Aktionsarten nach Gewicht (hoeher = zuerst geplant).
 * Aktionsarten mit Gewicht 0 werden ausgelassen.
 */
export function weightedActionOrder(
  weights: WarmupWeights,
): ("like" | "comment" | "dm_new_member")[] {
  const entries: { type: "like" | "comment" | "dm_new_member"; weight: number }[] = [
    { type: "like", weight: weights.like },
    { type: "comment", weight: weights.comment },
    { type: "dm_new_member", weight: weights.dm },
  ];
  return (
    entries
      .filter((e) => e.weight > 0)
      // Zufaellige Gewichtung: hohes Gewicht landet meist vorne, bleibt aber variabel.
      .map((e) => ({ ...e, roll: Math.random() * e.weight }))
      .sort((a, b) => b.roll - a.roll)
      .map((e) => e.type)
  );
}
