/**
 * Testdaten-Bereich: Abnahmedaten für den Worker anlegen und wieder entfernen.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { Button } from "@/components/ui/button";
import {
  cleanupTestFixtures,
  createTestFixtures,
  listTestRuns,
} from "@/lib/test-fixtures.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/test-data")({
  head: () => ({
    meta: [
      { title: "Testdaten — FB/Control" },
      {
        name: "description",
        content:
          "Testaufträge für die Worker-Abnahme anlegen und rückstandsfrei wieder entfernen.",
      },
      { property: "og:title", content: "Testdaten — FB/Control" },
      {
        property: "og:description",
        content: "Testaufträge für die Worker-Abnahme anlegen und wieder entfernen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TestDataPage,
});

function TestDataPage() {
  const qc = useQueryClient();
  const load = useServerFn(listTestRuns);
  const create = useServerFn(createTestFixtures);
  const cleanup = useServerFn(cleanupTestFixtures);

  const runs = useQuery({ queryKey: ["test-runs"], queryFn: () => load({}) });

  const createRun = useMutation({
    mutationFn: () => create({ data: { jobs: 26 } }),
    onSuccess: (res) => {
      toast.success(`Testdaten angelegt (${res.jobs} Aufträge)`);
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRun = useMutation({
    mutationFn: (id: string) => cleanup({ data: { test_run_id: id } }),
    onSuccess: () => {
      toast.success("Testdaten entfernt");
      qc.invalidateQueries({ queryKey: ["test-runs"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Testdaten"
      hint="Hier legst du gefahrlose Testaufträge an, um deinen Worker zu prüfen. Jede Testreihe hat eine eigene Kennung und lässt sich vollständig wieder entfernen."
      subtitle="Abnahme des Workers"
      actions={
        <Button size="sm" onClick={() => createRun.mutate()} disabled={createRun.isPending}>
          26 Testaufträge anlegen
        </Button>
      }
    >
      <div className="space-y-3">
        {(runs.data ?? []).map((r) => (
          <div
            key={r.test_run_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <p className="font-mono text-sm text-foreground">{r.test_run_id}</p>
              <p className="text-xs text-muted-foreground">
                {r.jobs} Aufträge · {r.open} offen
              </p>
            </div>
            <div className="flex items-center gap-2">
              <InfoHint text="Entfernt nur die Aufträge, den Testbot und die Testgruppe genau dieser Testreihe — und nur deine eigenen." />
              <Button
                size="sm"
                variant="outline"
                onClick={() => removeRun.mutate(r.test_run_id)}
                disabled={removeRun.isPending}
              >
                Aufräumen
              </Button>
            </div>
          </div>
        ))}
        {(runs.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Testreihe vorhanden.</p>
        )}
      </div>
    </AppShell>
  );
}
