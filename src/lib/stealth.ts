/**
 * Tarnung & Verhalten: Fingerprint-Vorlagen, Verhaltens-Presets,
 * Bewertung von Proxy-Typen und Konsistenzpruefung.
 * Client-sicher (keine Secrets, keine Server-Imports).
 */

export type ProxyType = "none" | "isp" | "mobile" | "residential" | "datacenter";

export const PROXY_TYPES: {
  value: ProxyType;
  label: string;
  hint: string;
  risk: "high" | "medium" | "low";
}[] = [
  {
    value: "none",
    label: "Kein Proxy",
    hint: "Der Worker nutzt die IP des Rechners/Servers. Auf einem Server ist das die riskanteste Variante.",
    risk: "high",
  },
  {
    value: "isp",
    label: "Static Residential (ISP)",
    hint: "Feste IP eines echten Internetanbieters. Sieht aus wie ein normaler Heimanschluss — empfohlen.",
    risk: "low",
  },
  {
    value: "mobile",
    label: "Mobil (4G/5G)",
    hint: "Mobilfunk-IP, die sich viele echte Nutzer teilen. Beste Tarnung für Social Media.",
    risk: "low",
  },
  {
    value: "residential",
    label: "Residential (rotierend)",
    hint: "Echte Haushalts-IPs, die aber wechseln. Nur mit langer Sitzungsbindung (sticky) verwenden.",
    risk: "medium",
  },
  {
    value: "datacenter",
    label: "Rechenzentrum",
    hint: "Hosting-IP (Hetzner, AWS …). Von Facebook gelistet — führt oft direkt zu Checkpoint oder Sperre.",
    risk: "high",
  },
];

export function proxyRisk(type: string | null | undefined): "high" | "medium" | "low" {
  return PROXY_TYPES.find((p) => p.value === type)?.risk ?? "high";
}

export type Fingerprint = {
  platform: string;
  user_agent: string;
  width: number;
  height: number;
  device_memory: number;
  hardware_concurrency: number;
  locale: string;
  timezone: string;
};

export const FINGERPRINT_PRESETS: { id: string; label: string; fp: Fingerprint }[] = [
  {
    id: "win11-chrome",
    label: "Windows 11 · Chrome · 1920×1080",
    fp: {
      platform: "Win32",
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      width: 1920,
      height: 1080,
      device_memory: 8,
      hardware_concurrency: 8,
      locale: "de-DE",
      timezone: "Europe/Berlin",
    },
  },
  {
    id: "win10-chrome-laptop",
    label: "Windows 10 · Chrome · 1536×864",
    fp: {
      platform: "Win32",
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      width: 1536,
      height: 864,
      device_memory: 8,
      hardware_concurrency: 4,
      locale: "de-DE",
      timezone: "Europe/Berlin",
    },
  },
  {
    id: "macos-chrome",
    label: "macOS · Chrome · 1728×1117",
    fp: {
      platform: "MacIntel",
      user_agent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      width: 1728,
      height: 1117,
      device_memory: 16,
      hardware_concurrency: 10,
      locale: "de-DE",
      timezone: "Europe/Berlin",
    },
  },
  {
    id: "android-chrome",
    label: "Android · Chrome · 412×915 (mobil)",
    fp: {
      platform: "Linux armv8l",
      user_agent:
        "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      width: 412,
      height: 915,
      device_memory: 8,
      hardware_concurrency: 8,
      locale: "de-DE",
      timezone: "Europe/Berlin",
    },
  },
];

export const DEFAULT_FINGERPRINT: Fingerprint = FINGERPRINT_PRESETS[0]!.fp;

export function normalizeFingerprint(raw: unknown): Fingerprint {
  const r = (raw ?? {}) as Partial<Fingerprint>;
  const d = DEFAULT_FINGERPRINT;
  return {
    platform: r.platform || d.platform,
    user_agent: r.user_agent || d.user_agent,
    width: Number(r.width) > 0 ? Number(r.width) : d.width,
    height: Number(r.height) > 0 ? Number(r.height) : d.height,
    device_memory: Number(r.device_memory) > 0 ? Number(r.device_memory) : d.device_memory,
    hardware_concurrency:
      Number(r.hardware_concurrency) > 0 ? Number(r.hardware_concurrency) : d.hardware_concurrency,
    locale: r.locale || d.locale,
    timezone: r.timezone || d.timezone,
  };
}

/** Warnt, wenn User-Agent, Plattform, Aufloesung und Zeitzone nicht zusammenpassen. */
export function fingerprintWarnings(fp: Fingerprint, proxyCountry?: string | null): string[] {
  const out: string[] = [];
  const ua = fp.user_agent.toLowerCase();
  const isWin = ua.includes("windows");
  const isMac = ua.includes("mac os");
  const isMobile = ua.includes("mobile") || ua.includes("android");

  if (isWin && fp.platform !== "Win32")
    out.push("User-Agent sagt Windows, Plattform ist nicht Win32.");
  if (isMac && fp.platform !== "MacIntel")
    out.push("User-Agent sagt macOS, Plattform ist nicht MacIntel.");
  if (isMobile && fp.width > 600) out.push("Mobiler User-Agent mit Desktop-Auflösung.");
  if (!isMobile && fp.width < 1000) out.push("Desktop-User-Agent mit sehr kleiner Auflösung.");
  if (fp.locale.startsWith("de") && !fp.timezone.startsWith("Europe/"))
    out.push("Deutsche Sprache, aber Zeitzone außerhalb Europas.");
  if (proxyCountry && proxyCountry.toUpperCase() === "DE" && !fp.timezone.startsWith("Europe/"))
    out.push("Proxy in Deutschland, Zeitzone passt nicht dazu.");
  if (proxyCountry && proxyCountry.toUpperCase() !== "DE" && fp.timezone === "Europe/Berlin")
    out.push(`Proxy-Land ${proxyCountry.toUpperCase()}, aber Zeitzone Europe/Berlin.`);
  return out;
}

export type Behavior = {
  type_delay_min: number;
  type_delay_max: number;
  typo_chance: number;
  pause_min: number;
  pause_max: number;
  warmup_scroll_min: number;
  warmup_scroll_max: number;
  idle_click_chance: number;
  session_minutes_min: number;
  session_minutes_max: number;
  break_minutes_min: number;
  break_minutes_max: number;
  read_ms_per_char: number;
};

export const BEHAVIOR_PRESETS: Record<"vorsichtig" | "normal" | "zuegig", Behavior> = {
  vorsichtig: {
    type_delay_min: 90,
    type_delay_max: 240,
    typo_chance: 0.06,
    pause_min: 25,
    pause_max: 120,
    warmup_scroll_min: 4,
    warmup_scroll_max: 10,
    idle_click_chance: 0.3,
    session_minutes_min: 8,
    session_minutes_max: 20,
    break_minutes_min: 25,
    break_minutes_max: 90,
    read_ms_per_char: 45,
  },
  normal: {
    type_delay_min: 60,
    type_delay_max: 170,
    typo_chance: 0.04,
    pause_min: 12,
    pause_max: 65,
    warmup_scroll_min: 3,
    warmup_scroll_max: 7,
    idle_click_chance: 0.2,
    session_minutes_min: 12,
    session_minutes_max: 30,
    break_minutes_min: 15,
    break_minutes_max: 55,
    read_ms_per_char: 30,
  },
  zuegig: {
    type_delay_min: 40,
    type_delay_max: 110,
    typo_chance: 0.02,
    pause_min: 6,
    pause_max: 30,
    warmup_scroll_min: 2,
    warmup_scroll_max: 5,
    idle_click_chance: 0.1,
    session_minutes_min: 15,
    session_minutes_max: 40,
    break_minutes_min: 8,
    break_minutes_max: 30,
    read_ms_per_char: 18,
  },
};

export const DEFAULT_BEHAVIOR: Behavior = BEHAVIOR_PRESETS.normal;

export function normalizeBehavior(raw: unknown): Behavior {
  const r = (raw ?? {}) as Partial<Behavior>;
  const out = { ...DEFAULT_BEHAVIOR };
  for (const key of Object.keys(out) as (keyof Behavior)[]) {
    const v = Number(r[key]);
    if (Number.isFinite(v) && v >= 0) out[key] = v;
  }
  if (out.type_delay_max < out.type_delay_min) out.type_delay_max = out.type_delay_min;
  if (out.pause_max < out.pause_min) out.pause_max = out.pause_min;
  return out;
}

export type Antidetect = {
  provider: "adspower" | "dolphin" | "gologin";
  api_url: string;
  profile_id: string;
  fallback_stealth: boolean;
};

export const DEFAULT_ANTIDETECT: Antidetect = {
  provider: "adspower",
  api_url: "http://127.0.0.1:50325",
  profile_id: "",
  fallback_stealth: true,
};

export function normalizeAntidetect(raw: unknown): Antidetect {
  const r = (raw ?? {}) as Partial<Antidetect>;
  return {
    provider: (r.provider as Antidetect["provider"]) || DEFAULT_ANTIDETECT.provider,
    api_url: r.api_url || DEFAULT_ANTIDETECT.api_url,
    profile_id: r.profile_id || "",
    fallback_stealth: r.fallback_stealth !== false,
  };
}

export type ProxyCheck = {
  ok: boolean;
  ip?: string;
  country?: string;
  isp?: string;
  org?: string;
  asn?: string;
  hosting?: boolean;
  type?: string;
  source?: "cockpit" | "worker";
  latency_ms?: number;
  message?: string;
  checked_at?: string;
};

/** Ampelbewertung fuer die Tarnung eines Bots. */
export function stealthScore(input: {
  proxy_type?: string | null;
  proxy_host?: string | null;
  fingerprint?: unknown;
  proxy_country?: string | null;
  proxy_check?: unknown;
}): { level: "gut" | "mittel" | "kritisch"; reasons: string[] } {
  const reasons: string[] = [];
  const risk = proxyRisk(input.proxy_type);
  if (input.proxy_type === "none" || !input.proxy_host) reasons.push("Kein Proxy hinterlegt");
  else if (risk === "high") reasons.push("Rechenzentrums-Proxy — hohes Sperr-Risiko");
  else if (risk === "medium") reasons.push("Rotierender Proxy — nur mit fester Sitzungsbindung");

  const warn = fingerprintWarnings(normalizeFingerprint(input.fingerprint), input.proxy_country);
  reasons.push(...warn);

  const check = (input.proxy_check ?? null) as ProxyCheck | null;
  if (check?.hosting) reasons.push("IP-Prüfung meldet Hosting-/Rechenzentrums-IP");
  if (check && check.ok === false)
    reasons.push(check.message || "Letzte Proxy-Prüfung fehlgeschlagen");
  if (
    check?.country &&
    input.proxy_country &&
    check.country.toUpperCase() !== input.proxy_country.toUpperCase()
  )
    reasons.push(
      `IP-Land ${check.country} weicht vom eingestellten Land ${input.proxy_country} ab`,
    );

  const critical =
    input.proxy_type === "none" || !input.proxy_host || risk === "high" || !!check?.hosting;
  return {
    level: critical ? "kritisch" : reasons.length ? "mittel" : "gut",
    reasons,
  };
}
