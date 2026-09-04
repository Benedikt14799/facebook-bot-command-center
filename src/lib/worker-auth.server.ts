import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type WorkerCtx = {
  admin: SupabaseClient<Database>;
  workerId: string;
  userId: string;
};

export async function authenticateWorker(request: Request): Promise<WorkerCtx | Response> {
  const token =
    request.headers.get("x-worker-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!token) return new Response("Missing worker token", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (error) return new Response("Auth error", { status: 500 });
  if (!data) return new Response("Invalid worker token", { status: 401 });

  await supabaseAdmin
    .from("workers")
    .update({ last_seen_at: new Date().toISOString(), status: "online" })
    .eq("id", data.id);

  return {
    admin: supabaseAdmin as unknown as SupabaseClient<Database>,
    workerId: data.id,
    userId: data.user_id,
  };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
