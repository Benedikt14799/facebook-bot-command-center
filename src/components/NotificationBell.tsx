/**
 * Benachrichtigungsglocke in der Kopfzeile.
 *
 * Zeigt ungelesene Meldungen (Checkpoint, CAPTCHA, Sperre, Freischaltung …)
 * und verlinkt bei Bedarf direkt auf die Freischaltungsseite.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/db";

const LEVEL_COLOR: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

export function NotificationBell() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = (list.data ?? []) as Record<string, unknown>[];
  const unread = items.filter((n) => !n["read_at"]).length;

  const markRead = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n["read_at"]).map((n) => String(n["id"]));
      if (!ids.length) return;
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Benachrichtigungen">
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Benachrichtigungen</span>
          {unread > 0 ? (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markRead.mutate()}
            >
              Alle gelesen
            </button>
          ) : null}
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {items.length === 0 ? (
            <li className="p-4 text-xs text-muted-foreground">Noch nichts passiert.</li>
          ) : (
            items.map((n) => (
              <li key={String(n["id"])} className="px-3 py-2">
                <p
                  className={`text-xs font-medium ${LEVEL_COLOR[String(n["level"])] ?? "text-foreground"} ${
                    n["read_at"] ? "opacity-60" : ""
                  }`}
                >
                  {String(n["title"])}
                </p>
                {n["body"] ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{String(n["body"])}</p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmt(n["created_at"] as string)}
                  {["checkpoint", "captcha", "blocked", "login_required", "session_expired", "two_factor"].includes(
                    String(n["type"]),
                  ) ? (
                    <>
                      {" · "}
                      <Link to="/unlock" className="text-primary hover:underline">
                        freischalten
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
