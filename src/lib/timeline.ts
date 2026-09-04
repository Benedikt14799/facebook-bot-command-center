/**
 * Zusammengefuehrte Zeitleiste einer Person.
 *
 * Quellen: contact_events (Likes, Kommentare, DMs, Antworten), messages
 * (tatsaechlich gesendete/empfangene Texte), fehlgeschlagene jobs (Fehler)
 * und Bot-Ereignisse wie Checkpoints. Alles wird auf ein einheitliches
 * Format gebracht und nach Zeit sortiert.
 */
import { KIND_LABEL } from "@/lib/contact-labels";

export type TimelineKind = "sent" | "received" | "reaction" | "error" | "checkpoint";

export type TimelineItem = {
  id: string;
  at: string;
  kind: TimelineKind;
  /** Menschliche Beschriftung, z. B. „Like verteilt“. */
  label: string;
  /** Woher der Eintrag stammt: Kontaktverlauf, Nachricht, Auftrag, System. */
  source: string;
  body?: string | null;
};

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  sent: "Versendet",
  received: "Reaktion",
  reaction: "Reaktion",
  error: "Fehler",
  checkpoint: "Checkpoint",
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export function buildTimeline(input: {
  contactEvents?: Row[];
  messages?: Row[];
  jobs?: Row[];
  events?: Row[];
}): TimelineItem[] {
  const out: TimelineItem[] = [];

  for (const e of input.contactEvents ?? []) {
    const incoming = e["direction"] === "in";
    out.push({
      id: `ce-${String(e["id"])}`,
      at: String(e["created_at"]),
      kind: incoming ? "received" : e["kind"] === "like" ? "reaction" : "sent",
      label: KIND_LABEL[String(e["kind"])] ?? String(e["kind"]),
      source: "Kontaktverlauf",
      body: s(e["body"]),
    });
  }

  for (const m of input.messages ?? []) {
    out.push({
      id: `msg-${String(m["id"])}`,
      at: String(m["created_at"]),
      kind: m["direction"] === "in" ? "received" : "sent",
      label: m["direction"] === "in" ? "Nachricht erhalten" : "Nachricht gesendet",
      source: "Nachrichten",
      body: s(m["body"]),
    });
  }

  for (const j of input.jobs ?? []) {
    if (j["status"] !== "failed") continue;
    out.push({
      id: `job-${String(j["id"])}`,
      at: String(j["finished_at"] ?? j["updated_at"] ?? j["created_at"]),
      kind: "error",
      label: `Auftrag fehlgeschlagen (${String(j["type"])})`,
      source: "Aufträge",
      body: s(j["error"]),
    });
  }

  for (const ev of input.events ?? []) {
    out.push({
      id: `ev-${String(ev["id"])}`,
      at: String(ev["created_at"]),
      kind: "checkpoint",
      label: String(ev["type"]),
      source: "System",
      body: s(ev["message"]),
    });
  }

  return out.filter((i) => i.at && i.at !== "null").sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** CSV-Datei aus der Zeitleiste erzeugen und herunterladen. */
export function downloadTimelineCsv(name: string, items: TimelineItem[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    ["Zeitpunkt", "Art", "Aktion", "Quelle", "Inhalt"],
    ...items.map((i) => [
      new Date(i.at).toLocaleString("de-DE"),
      TIMELINE_LABEL[i.kind],
      i.label,
      i.source,
      (i.body ?? "").replace(/\s+/g, " ").trim(),
    ]),
  ];
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kontakt-${name.replace(/[^\w-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * PDF-Export ueber das Druckfenster des Browsers ("Als PDF sichern").
 * Bewusst ohne zusaetzliche PDF-Bibliothek.
 */
export function printTimeline(name: string, items: TimelineItem[]) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Kontaktakte ${esc(name)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;color:#111}
h1{font-size:18px;margin:0 0 4px}
p.meta{color:#666;font-size:12px;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f5f5f5}
</style></head><body>
<h1>Kontaktakte — ${esc(name)}</h1>
<p class="meta">Erstellt am ${new Date().toLocaleString("de-DE")} · ${items.length} Einträge</p>
<table><thead><tr><th>Zeitpunkt</th><th>Art</th><th>Aktion</th><th>Quelle</th><th>Inhalt</th></tr></thead><tbody>
${items
  .map(
    (i) =>
      `<tr><td>${new Date(i.at).toLocaleString("de-DE")}</td><td>${TIMELINE_LABEL[i.kind]}</td><td>${esc(
        i.label,
      )}</td><td>${esc(i.source)}</td><td>${esc(i.body ?? "")}</td></tr>`,
  )
  .join("")}
</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
