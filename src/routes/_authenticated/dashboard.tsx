import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { selectAll, fmt } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Cockpit — FB/Control" },
      { name: "description", content: "Live-Übersicht über Bots, Aufträge und Ereignisse." },
      { property: "og:title", content: "Cockpit — FB/Control" },
      { property: "og:description", content: "Live-Übersicht über Bots, Aufträge und Ereignisse." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => selectAll("bots") });
  const jobs = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: () =>
      selectAll("jobs", (q) => q.order("scheduled_for", { ascending: false }).limit(50)),
  });
  const events = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () => selectAll("events", (q) => q.order("created_at", { ascending: false }).limit: undefined),
  });

  return <div />;
}
