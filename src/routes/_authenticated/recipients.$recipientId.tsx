/**
 * Kontaktakte einer Person: Stammdaten, Stufe und die komplette Zeitleiste
 * aller Aktionen und Nachrichten (Likes, Kommentare, Welcome-DMs, Follow-ups,
 * eingehende Antworten).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/contact-labels";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import {
  buildTimeline,
  downloadTimelineCsv,
  printTimeline,
  TIMELINE_LABEL,
  type TimelineItem,
} from "@/lib/timeline";

export const Route = createFileRoute("/_authenticated/recipients/$recipientId")({
  head: () => ({
    meta: [
      { title: "Kontaktakte — FB/Control" },
      {
        name: "description",
        content: "Vollständige Historie einer Person: Likes, Nachrichten und Antworten.",
      },
      { property: "og:title", content: "Kontaktakte — FB/Control" },
      {
        property: "og:description",
        content: "Vollständige Historie einer Person: Likes, Nachrichten und Antworten.",
      },
    ],
  }),
  component: RecipientDetail,
});

/** Farbe des Zeitleisten-Strichs je Ereignisart. */
const BORDER: Record<string, string> = {
  sent: "border-primary/60",
  received: "border-success/60",
  reaction: "border-border",
  error: "border-destructive/60",
  checkpoint: "border-warning/60",
};

function RecipientDetail() {
  const { recipientId } = Route.useParams();

  const person = useQuery({
    queryKey: ["recipient", recipientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("*")
        .eq("id", recipientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Alle Quellen laden und danach zu einer Zeitleiste zusammenfuehren.
  const timeline = useQuery({
    queryKey: ["contact-timeline", recipientId],
    queryFn: async () => {
      const [ce, msgs, jobs] = await Promise.all([
        supabase
          .from("contact_events")
          .select("*")
          .eq("recipient_id", recipientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("messages")
          .select("*")
          .eq("recipient_id", recipientId)
          .order("created_at", { ascending: false }),
        supabase.from("jobs").select("*").eq("recipient_id", recipientId).eq("status", "failed"),
      ]);

      // Checkpoint-/Sperr-Ereignisse des zugehoerigen Bots einblenden.
      const botIds = [
        ...new Set([...(ce.data ?? []), ...(msgs.data ?? [])].map((r) => r.bot_id).filter(Boolean)),
      ] as string[];
      const events = botIds.length
        ? ((
            await supabase
              .from("events")
              .select("*")
              .in("bot_id", botIds)
              .in("type", [
                "checkpoint",
                "captcha",
                "blocked",
                "login_required",
                "session_expired",
                "two_factor",
              ])
              .order("created_at", { ascending: false })
              .limit(50)
          ).data ?? [])
        : [];

      return buildTimeline({
        contactEvents: ce.data ?? [],
        messages: msgs.data ?? [],
        jobs: jobs.data ?? [],
        events,
      });
    },
  });

  if (!person.data) {
    return (
      <AppShell title="Kontaktakte" subtitle="Person nicht gefunden">
        <p className="text-sm text-muted-foreground">Diese Person existiert nicht (mehr).</p>
      </AppShell>
    );
  }

  const p = person.data;
  const items: TimelineItem[] = timeline.data ?? [];

  return (
    <AppShell
      title={p.name ?? "Unbekannt"}
      subtitle="Kontaktakte und Verlauf"
      hint="Alles, was mit dieser Person passiert ist. Die KI nutzt diesen Verlauf, damit Folgeantworten zum bisherigen Gespräch passen und sich nicht wiederholen."
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="mb-3 text-sm font-medium text-foreground">Stammdaten</h2>
          <dl className="space-y-2 text-xs text-muted-foreground">
            <Row label="Vorname" value={p.first_name ?? "—"} />
            <Row label="Facebook-ID" value={p.fb_user_id ?? "—"} />
            <Row
              label="Profil"
              value={
                p.profile_url ? (
                  <a
                    href={p.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    öffnen
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Score" value={String(p.score ?? 0)} />
            <Row label="Antworten" value={String(p.reply_count ?? 0)} />
            <Row label="Zuletzt kontaktiert" value={fmt(p.last_contacted_at)} />
            <Row label="Angebot gesendet" value={fmt(p.offer_sent_at)} />
          </dl>
          <div className="mt-3">
            <StatusBadge value={STAGE_LABEL[p.stage ?? "new"] ?? p.stage ?? "new"} />
          </div>
          {p.last_context ? (
            <p className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="text-foreground">Zuletzt erkannt: </span>
              {p.last_context}
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">Verlauf</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!items.length}
                onClick={() => downloadTimelineCsv(p.name ?? "kontakt", items)}
              >
                <Download className="size-3.5" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!items.length}
                onClick={() => printTimeline(p.name ?? "Kontakt", items)}
              >
                <Printer className="size-3.5" /> PDF
              </Button>
            </div>
          </header>
          <ol className="space-y-3">
            {items.map((e: TimelineItem) => (
              <li key={e.id} className={`border-l-2 pl-3 ${BORDER[e.kind]}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-foreground">{e.label}</span>
                  <span className="text-muted-foreground">{TIMELINE_LABEL[e.kind]}</span>
                  <span className="text-muted-foreground">{e.source}</span>
                  <span className="text-muted-foreground">{fmt(e.at)}</span>
                </div>
                {e.body ? <p className="mt-1 text-sm text-muted-foreground">{e.body}</p> : null}
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-sm text-muted-foreground">Noch keine Ereignisse.</li>
            )}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
