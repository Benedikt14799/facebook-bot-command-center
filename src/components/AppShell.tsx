/**
 * Grundgeruest aller geschuetzten Seiten: Seitennavigation, Kopfzeile mit
 * Titel, optionalem Info-Hinweis, Aktionen rechts und dem Seiteninhalt.
 */
import { InfoHint } from "@/components/InfoHint";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Bot,
  Users,
  ListChecks,
  MessagesSquare,
  FileText,
  ScrollText,
  Server,
  LogOut,
} from "lucide-react";
import { Flame, HeartPulse, Contact, Sparkles, KeyRound, Rocket } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Cockpit", icon: Activity },
  { to: "/inbetriebnahme", label: "Inbetriebnahme", icon: Rocket },
  { to: "/bots", label: "Bots", icon: Bot },
  { to: "/warmup", label: "Aufwärmphase", icon: Flame },
  { to: "/groups", label: "Gruppen", icon: Users },
  { to: "/recipients", label: "Kontakte", icon: Contact },
  { to: "/jobs", label: "Aufträge", icon: ListChecks },
  { to: "/messages", label: "Nachrichten", icon: MessagesSquare },
  { to: "/templates", label: "Vorlagen", icon: FileText },
  { to: "/ai-settings", label: "KI-Einstellungen", icon: Sparkles },
  { to: "/logs", label: "Protokoll", icon: ScrollText },
  { to: "/workers", label: "Worker", icon: Server },
  { to: "/worker-health", label: "Worker-Health", icon: HeartPulse },
  { to: "/unlock", label: "Freischaltung", icon: KeyRound },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-4">
          <span className="size-2 rounded-full bg-success shadow-[0_0_10px] shadow-success" />
          <span className="font-mono text-sm tracking-tight text-sidebar-foreground">
            FB<span className="text-primary">/</span>CONTROL
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary rounded-l-none",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="m-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" /> Abmelden
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/50 px-6 py-4 backdrop-blur">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              {title}
              {hint ? <InfoHint text={hint} side="bottom" /> : null}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <NotificationBell />
          </div>
        </header>
        <div className="md:hidden">
          <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
