/**
 * Oeffentliche Startseite mit Kurzvorstellung und Einstieg in Login bzw. Demo.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Activity, Bot, Clock, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FB/Control — Kommandozentrale für Facebook-Bots" },
      {
        name: "description",
        content:
          "Steuere Facebook-Profile zentral: Warmup, Arbeitszeiten, Gruppen, DMs, Likes, Kommentare, Nachrichten-Backlog und Worker-Anbindung.",
      },
      { property: "og:title", content: "FB/Control — Kommandozentrale für Facebook-Bots" },
      {
        property: "og:description",
        content:
          "Cockpit für Bot-Verwaltung, Warmup-Phasen, Gruppenregeln, Auftragsplanung und Nachrichtenprotokoll.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Bot, title: "Bot-Verwaltung", text: "Profile, Cookie-Session, Status und Not-Aus je Bot." },
  { icon: Clock, title: "Warmup & Zeitfenster", text: "Tages-Caps, Jitter, Wochenendfaktor, Arbeitszeiten." },
  { icon: Activity, title: "Aufträge & Protokoll", text: "Geplante Jobs, Freigabe-Queue, Nachrichten-Backlog." },
  { icon: ShieldCheck, title: "Worker-API", text: "Dein lokaler Playwright-Worker holt Jobs per Token." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="font-mono text-sm text-foreground">
          FB<span className="text-primary">/</span>CONTROL
        </span>
        <Link to="/auth">
          <Button size="sm">Anmelden</Button>
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-20">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Kommandozentrale für deine Facebook-Automation
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Plane Aktionen, verwalte Gruppen und Profile, überwache jede Nachricht — die
          eigentliche Ausführung übernimmt dein eigener Worker.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth">
            <Button size="lg">Cockpit öffnen</Button>
          </Link>
          <Link to="/auth" search={{ demo: true }}>
            <Button size="lg" variant="outline">
              Demo ohne Anmeldung
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-medium text-foreground">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
