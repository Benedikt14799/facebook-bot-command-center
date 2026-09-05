/**
 * Testdaten fuer die Worker-Abnahme.
 *
 * Jede Testausfuehrung bekommt eine eigene Kennung (test_run_id). Der
 * Aufraeumen-Knopf loescht ausschliesslich Daten genau dieser Ausfuehrung und
 * nur die des angemeldeten Benutzers. Echte Daten bleiben unberuehrt.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEST_SOURCE = "test";

/** Legt einen Testbot, eine Testgruppe und 26 gueltige Testauftraege an. */
export const createTestFixtures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobs?: number }) => input)
  .handler(async ({ data, context }) => {
    const count = Math.min(Math.max(Math.trunc(data.jobs ?? 26), 1), 60);
    const testRunId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const bot = await context.supabase
      .from("bots")
      .insert({
        user_id: context.userId,
        name: `Testbot ${testRunId}`,
        session_status: "ok",
        test_run_id: testRunId,
      })
      .select("id")
      .single();
    if (bot.error) throw new Error(bot.error.message);

    const group = await context.supabase
      .from("groups")
      .insert({
        user_id: context.userId,
        name: `Testgruppe ${testRunId}`,
        fb_group_id: `test-${testRunId}`,
        test_run_id: testRunId,
      })
      .select("id")
      .single();
    if (group.error) throw new Error(group.error.message);

    const now = new Date().toISOString();
    const jobs = Array.from({ length: count }, (_, i) => ({
      user_id: context.userId,
      bot_id: bot.data.id,
      group_id: group.data.id,
      type: "like_posts",
      payload: { count: 1, test_index: i + 1 } as never,
      status: "pending",
      needs_approval: false,
      scheduled_for: now,
      source: TEST_SOURCE,
      test_run_id: testRunId,
    }));
    const inserted = await context.supabase.from("jobs").insert(jobs);
    if (inserted.error) throw new Error(inserted.error.message);

    return { test_run_id: testRunId, bot_id: bot.data.id, group_id: group.data.id, jobs: count };
  });

/** Loescht ausschliesslich die Testdaten einer bestimmten Ausfuehrung. */
export const cleanupTestFixtures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { test_run_id: string }) => input)
  .handler(async ({ data, context }) => {
    const runId = data.test_run_id?.trim();
    if (!runId) throw new Error("test_run_id erforderlich");

    const scoped = (table: "jobs" | "bots" | "groups" | "recipients") =>
      context.supabase
        .from(table)
        .delete()
        .eq("user_id", context.userId)
        .eq("test_run_id", runId);

    for (const table of ["jobs", "recipients", "groups", "bots"] as const) {
      const { error } = await scoped(table);
      if (error) throw new Error(error.message);
    }
    return { ok: true, test_run_id: runId };
  });

/** Listet die Testausfuehrungen des Benutzers (fuer die Oberflaeche). */
export const listTestRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("jobs")
      .select("test_run_id, status")
      .eq("user_id", context.userId)
      .not("test_run_id", "is", null);
    if (error) throw new Error(error.message);

    const runs = new Map<string, { test_run_id: string; jobs: number; open: number }>();
    for (const row of data ?? []) {
      const id = row.test_run_id as string;
      const entry = runs.get(id) ?? { test_run_id: id, jobs: 0, open: 0 };
      entry.jobs++;
      if (row.status === "pending" || row.status === "running") entry.open++;
      runs.set(id, entry);
    }
    return [...runs.values()];
  });
