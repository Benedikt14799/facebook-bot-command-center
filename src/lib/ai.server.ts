/**
 * Textgenerierung ueber das Lovable-AI-Gateway (nur serverseitig!).
 *
 * Erzeugt kurze, natuerlich klingende deutsche Nachrichten bzw. Kommentare
 * im Tonfall des jeweiligen Bots und entfernt typische KI-Floskeln.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

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
];

/** Nachbearbeitung: Anfuehrungszeichen weg, Floskeln raus, Laenge begrenzen. */
export function humanize(text: string, maxChars = 320) {
  let out = text.trim().replace(/^["'„»]|["'“«]$/g, "").trim();
  out = out.replace(/\s*\n{2,}\s*/g, "\n");
  for (const re of BANNED) out = out.replace(re, "");
  out = out.replace(/[ \t]{2,}/g, " ").trim();
  // Emoji-Schwemme eindaemmen: maximal eines behalten.
  const emojis = out.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emojis.length > 1) {
    let seen = 0;
    out = out.replace(/\p{Extended_Pictographic}/gu, () => (seen++ === 0 ? "" : ""));
  }
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    out = (stop > 60 ? cut.slice(0, stop + 1) : cut).trim();
  }
  return out;
}

export type TextRequest = {
  kind: "dm_new_member" | "reply_message" | "comment";
  tone?: string | null;
  botName: string;
  groupName?: string | null;
  groupTopic?: string | null;
  recipientName?: string | null;
  context?: string | null;
};

function prompt(req: TextRequest) {
  const base = [
    `Du schreibst als "${req.botName}", eine echte Privatperson in einer Facebook-Gruppe.`,
    req.tone ? `Tonfall: ${req.tone}.` : "Tonfall: locker, freundlich, direkt.",
    req.groupName ? `Gruppe: "${req.groupName}"${req.groupTopic ? ` (Thema: ${req.groupTopic})` : ""}.` : "",
    "Regeln: Deutsch, maximal 2 kurze Sätze, keine Werbung, keine Emojis-Häufung,",
    "keine Floskeln, kein förmlicher Ton, keine Anführungszeichen, keine Signatur.",
    "Antworte nur mit dem fertigen Text.",
  ]
    .filter(Boolean)
    .join(" ");

  const task = {
    dm_new_member: `Begrüße ${req.recipientName ?? "das neue Mitglied"} kurz persönlich und stelle eine einfache offene Frage.`,
    reply_message: `Antworte natürlich auf diese Nachricht: "${req.context ?? ""}"`,
    comment: `Schreibe einen sinnvollen, kurzen Kommentar zu diesem Beitrag: "${req.context ?? ""}"`,
  }[req.kind];

  return { system: base, user: task };
}

/**
 * Generiert einen Text. Wirft AiBlockedError bei 402/403 (Guthaben/Limit),
 * damit der Planer die Automatik pausieren kann.
 */
export async function generateText(req: TextRequest): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY fehlt");

  const { system, user } = prompt(req);
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 402 || res.status === 403) {
      throw new AiBlockedError(res.status, `KI blockiert [${res.status}]: ${body}`);
    }
    throw new Error(`KI-Fehler [${res.status}]: ${body}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("KI lieferte keinen Text");
  return humanize(text);
}
