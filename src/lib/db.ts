import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type Bot = Tables["bots"]["Row"];
export type Group = Tables["groups"]["Row"];
export type Job = Tables["jobs"]["Row"];
export type Message = Tables["messages"]["Row"];
export type Template = Tables["templates"]["Row"];
export type EventRow = Tables["events"]["Row"];
export type Worker = Tables["workers"]["Row"];
export type Recipient = Tables["recipients"]["Row"];

export async function selectAll<T extends keyof Tables & string>(
  table: T,
  build?: (q: any) => any,
) {
  let q: any = supabase.from(table).select("*");
  q = build ? build(q) : q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Tables[T]["Row"][];
}

export function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
