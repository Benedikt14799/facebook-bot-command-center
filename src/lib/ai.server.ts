/**
 * Textgenerierung (nur serverseitig!).
 *
 * Unterstuetzt zwei Wege:
 *  1. die eingebaute KI ueber das Lovable-AI-Gateway (kein eigener Schluessel noetig)
 *  2. einen eigenen Anbieter (OpenAI, OpenRouter, beliebiger OpenAI-kompatibler
 *     Endpunkt oder Anthropic) mit hinterlegtem Schluessel aus ai_settings.
 *
 * Erzeugt kurze, natuerlich klingende deutsche Nachrichten bzw. Kommentare
 * im Tonfall und in der Rolle des jeweiligen Bots, nutzt Vorname, erkannten
 * Text und den bisherigen Gespraechsverlauf und entfernt KI-Floskeln.
 */
import type { TypoKind } from "@/lib/job-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3.7-flash";

export class AiBlockedError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiBlockedError";
  }
}

/** Floskeln, die einen Text sofort nach KI klingen lassen. */
const BANNED = [
  /\bals KI\b/gi,
  /\bIch hoffe, (es|dir) geht/gi,
  /\bZögere nicht\b/gi,
  /\bin der heutigen (schnelllebigen )?Welt\b/gi,
  /\bes ist wichtig zu beachten\b/gi,
  /\bzusammenfassend\b/gi,
  /\bdarüber hinaus\b/gi,
  /\bgerne helfe ich\b/gi,
  /\bals dein\b/gi,
];

/** Nachbearbeitung: Anfuehrungszeichen weg, Floskeln raus, Laenge begrenzen. */
export function humanize(text: string, maxChars = 320) {
  let out = text
    .trim()
    .replace(/^["'„»]|["'“«]$/g, "")
    .trim();
  out = out.replace(/\s*\n{2,}\s*/g, "\n");
  for (const re of BANNED) out = out.replace(re, "");
  out = out.replace(/[ \t]{2,}/g, " ").trim();
  // Emoji-Schwemme eindaemmen: alle entfernen, wenn es mehr als eines ist.
  const emojis = out.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emojis.length > 1) out = out.replace(/\p{Extended_Pictographic}/gu, "");
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    out = (stop > 60 ? cut.slice(0, stop + 1) : cut).trim();
  }
  return out;
}

/**
 * Gelegentliche, realistische Tippfehler einstreuen.
 *
 * Warum: perfekt getippte Nachrichten wirken maschinell. Ein einzelner
 * Vertipper hier und da lässt den Text menschlich wirken.
 *
 * Regeln:
 *  - der Vorname/erste Wort, Links, Zahlen und sehr kurze Wörter bleiben heil
 *  - höchstens zwei Fehler pro Nachricht, nie zwei im selben Wort
 *  - typische Tippfehler: Buchstabendreher, verschluckter/doppelter Buchstabe,
 *    Nachbartaste, fehlender Umlaut, "dass" -> "das"
 */
export function sprinkleTypos(
  text: string,
  rate = 0.12,
  /** Bevorzugte Fehlerarten; leer/undefiniert = alle erlaubt. */
  kinds: TypoKind[] = [],
): string {
  if (rate <= 0 || !text.trim()) return text;
  const allow = (k: TypoKind) => kinds.length === 0 || kinds.includes(k);

  const NEIGHBOR: Record<string, string> = {
    a: "s",
    s: "d",
    d: "f",
    f: "g",
    g: "h",
    h: "j",
    j: "k",
    k: "l",
    e: "r",
    r: "t",
    t: "z",
    z: "u",
    u: "i",
    i: "o",
    o: "p",
    n: "m",
    m: "n",
    b: "v",
    v: "c",
    c: "x",
  };
  const UMLAUT: Record<string, string> = { ä: "a", ö: "o", ü: "u", ß: "ss" };

  const words = text.split(/(\s+)/);
  // Wortindizes, die verändert werden dürfen (kein erstes Wort, keine Links).
  const candidates: number[] = [];
  let wordCount = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (!w.trim()) continue;
    wordCount++;
    const core = w.replace(/[^\p{L}]/gu, "");
    if (wordCount === 1) continue; // Anrede/Vorname nie verstümmeln
    if (/https?:|www\.|@|\d/.test(w)) continue;
    if (core.length < 5) continue;
    candidates.push(i);
  }
  if (!candidates.length) return text;

  // Erwartete Fehleranzahl aus der Rate ableiten, aber maximal zwei.
  const expected = candidates.length * rate;
  let budget = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
  budget = Math.min(budget, 2);
  if (budget <= 0) return text;

  const picked = new Set<number>();
  while (picked.size < budget && picked.size < candidates.length) {
    picked.add(candidates[Math.floor(Math.random() * candidates.length)]!);
  }

  for (const idx of picked) {
    const word = words[idx]!;
    const letters = [...word];
    const pos = letters.findIndex((c, i) => i > 0 && /\p{L}/u.test(c));
    if (pos < 1) continue;
    const i = Math.min(
      pos + Math.floor(Math.random() * (letters.length - pos - 1)),
      letters.length - 2,
    );
    const c = letters[i]!.toLowerCase();

    const allVariants: { kind: TypoKind; make: () => string }[] = [
      // Buchstabendreher
      {
        kind: "swap",
        make: () => {
          const copy = [...letters];
          const tmp = copy[i]!;
          copy[i] = copy[i + 1]!;
          copy[i + 1] = tmp;
          return copy.join("");
        },
      },
      // Buchstabe verschluckt
      { kind: "drop", make: () => letters.filter((_, k) => k !== i).join("") },
      // Buchstabe doppelt
      {
        kind: "double",
        make: () => [...letters.slice(0, i), letters[i]!, ...letters.slice(i)].join(""),
      },
      // Nachbartaste
      {
        kind: "neighbor",
        make: () =>
          NEIGHBOR[c]
            ? [...letters.slice(0, i), NEIGHBOR[c]!, ...letters.slice(i + 1)].join("")
            : word,
      },
      // Umlaut vergessen
      {
        kind: "umlaut",
        make: () =>
          UMLAUT[c] ? [...letters.slice(0, i), UMLAUT[c]!, ...letters.slice(i + 1)].join("") : word,
      },
    ];
    const variants = allVariants.filter((v) => allow(v.kind));

    // Grammatikfehler nur, wenn diese Fehlerart erlaubt ist.
    if (allow("grammar") && word.toLowerCase().includes("dass")) {
      words[idx] = word.replace("dass", "das");
      continue;
    }
    if (!variants.length) continue;

    let next = variants[Math.floor(Math.random() * variants.length)]!.make();
    if (!next || next === word) next = variants[0]!.make();
    words[idx] = next;
  }

  return words.join("");
}

/** Ein Eintrag aus dem bisherigen Gespraechsverlauf mit einer Person. */
export type HistoryEntry = {
  direction: "in" | "out";
  body: string;
  at?: string | null;
};

export type TextRequest = {
  kind: "dm_new_member" | "reply_message" | "comment";
  tone?: string | null;
  botName: string;
  /** Rolle/Persona des Bots, z. B. "Gruppenbetreuer" */
  personaRole?: string | null;
  groupName?: string | null;
  groupTopic?: string | null;
  /** Vollstaendiger Name der Person */
  recipientName?: string | null;
  /** Vorname, wird bevorzugt in der Anrede benutzt */
  firstName?: string | null;
  /** Erkannter Text: Kommentar, Beitrag oder eingehende Nachricht */
  context?: string | null;
  /** Bisheriger Verlauf mit dieser Person (aelteste zuerst) */
  history?: HistoryEntry[];
  /** Angebot/Referral, falls es in genau dieser Nachricht platziert werden soll */
  offer?: { text: string; link?: string | null } | null;
  /** Wahrscheinlichkeit für gelegentliche Tippfehler (0 = aus, 0.12 = Standard) */
  typoRate?: number | null;
  /** Bevorzugte Fehlerarten; leer = alle erlaubt */
  typoKinds?: TypoKind[] | null;
};

/** Baut System- und Nutzer-Prompt aus dem gesamten Kontext. */
function prompt(req: TextRequest) {
  const name = req.firstName || req.recipientName?.split(" ")[0] || null;

  const system = [
    `Du schreibst als "${req.botName}", eine echte Person in einer Facebook-Gruppe.`,
    req.personaRole ? `Deine Rolle dort: ${req.personaRole}.` : "",
    req.tone ? `Tonfall: ${req.tone}.` : "Tonfall: locker, freundlich, direkt, Du-Form.",
    req.groupName
      ? `Gruppe: "${req.groupName}"${req.groupTopic ? ` (Thema: ${req.groupTopic})` : ""}.`
      : "",
    "Regeln: Deutsch, maximal 2 bis 3 kurze Sätze, kein förmlicher Ton, keine Floskeln,",
    "höchstens ein Emoji, keine Anführungszeichen um den Text, keine Signatur,",
    "nichts wiederholen, was du der Person schon geschrieben hast.",
    name ? `Sprich die Person mit "${name}" an, aber nur einmal am Anfang.` : "",
    "Antworte ausschließlich mit dem fertigen Nachrichtentext.",
  ]
    .filter(Boolean)
    .join(" ");

  const parts: string[] = [];

  if (req.history?.length) {
    const lines = req.history
      .slice(-12)
      .map((h) => `${h.direction === "in" ? name || "Person" : req.botName}: ${h.body}`)
      .join("\n");
    parts.push(`Bisheriger Verlauf mit dieser Person:\n${lines}`);
  }

  if (req.kind === "dm_new_member") {
    parts.push(
      `Aufgabe: Begrüße ${name ?? "das neue Mitglied"} kurz und persönlich als ${
        req.personaRole ?? "Mitglied der Gruppe"
      } und stelle eine einfache offene Frage.`,
    );
  } else if (req.kind === "reply_message") {
    parts.push(
      `Aufgabe: Antworte natürlich auf die letzte Nachricht der Person: "${req.context ?? ""}". Geh konkret auf ihr Anliegen ein.`,
    );
  } else {
    parts.push(
      `Aufgabe: Schreibe einen kurzen, inhaltlich passenden Kommentar zu diesem Beitrag: "${req.context ?? ""}". Greife das konkrete Thema auf, keine allgemeine Floskel.`,
    );
  }

  if (req.offer?.text) {
    parts.push(
      `Baue außerdem beiläufig und natürlich diesen Hinweis ein (nicht wie Werbung, sondern als hilfreicher Tipp): ${req.offer.text}${
        req.offer.link ? ` Link: ${req.offer.link}` : ""
      }`,
    );
  }

  return { system, user: parts.join("\n\n") };
}

export type AiConfig = {
  provider: string;
  model: string;
  baseUrl?: string | null;
  apiKey?: string | null;
};

/** KI-Konfiguration eines Nutzers laden (Fallback: eingebaute KI). */
export async function loadAiConfig(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<AiConfig> {
  const { data } = await admin
    .from("ai_settings")
    .select("provider, model, base_url, api_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || data.provider === "lovable" || !data.api_key) {
    return { provider: "lovable", model: LOVABLE_MODEL };
  }
  return {
    provider: data.provider,
    model: data.model,
    baseUrl: data.base_url,
    apiKey: data.api_key,
  };
}

/** Standard-Endpunkt je Anbieter. */
export function endpointFor(config: AiConfig) {
  if (config.baseUrl) return `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  switch (config.provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    default:
      return LOVABLE_GATEWAY;
  }
}

/** Rohaufruf: ein System- und ein Nutzer-Prompt, Rueckgabe ist der reine Text. */
export async function callModel(config: AiConfig, system: string, user: string): Promise<string> {
  if (config.provider === "anthropic") {
    const res = await fetch(endpointFor(config), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw await toError(res);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text ?? "";
  }

  const isLovable = config.provider === "lovable";
  const key = isLovable ? process.env["LOVABLE_API_KEY"] : config.apiKey;
  if (!key) throw new Error(isLovable ? "LOVABLE_API_KEY fehlt" : "Kein API-Schlüssel hinterlegt");

  const res = await fetch(endpointFor(config), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isLovable ? { "Lovable-API-Key": key } : {}),
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function toError(res: Response) {
  const body = await res.text();
  if (res.status === 402 || res.status === 403) {
    return new AiBlockedError(res.status, `KI blockiert [${res.status}]: ${body}`);
  }
  return new Error(`KI-Fehler [${res.status}]: ${body}`);
}

/**
 * Generiert einen Text. Wirft AiBlockedError bei 402/403 (Guthaben/Limit),
 * damit der Planer die Automatik pausieren kann.
 */
export async function generateText(
  req: TextRequest,
  config: AiConfig = { provider: "lovable", model: LOVABLE_MODEL },
): Promise<string> {
  const { system, user } = prompt(req);
  const text = await callModel(config, system, user);
  if (!text.trim()) throw new Error("KI lieferte keinen Text");
  // Erst Floskeln/Länge bereinigen, danach gelegentliche Tippfehler einstreuen.
  return sprinkleTypos(humanize(text), req.typoRate ?? 0.12, req.typoKinds ?? []);
}
