/**
 * KI-Einstellungen: eingebaute KI nutzen oder einen eigenen Anbieter
 * (OpenAI, OpenRouter, Anthropic, beliebiger OpenAI-kompatibler Endpunkt)
 * mit eigenem Schlüssel hinterlegen. Der Schlüssel wird nur serverseitig
 * gespeichert und nie an den Browser zurückgegeben.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { InfoHint } from "@/components/InfoHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAiSettings, saveAiSettings, testAiSettings } from "@/lib/ai-settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai-settings")({
  head: () => ({
    meta: [
      { title: "KI-Einstellungen — FB/Control" },
      {
        name: "description",
        content: "Eingebaute KI oder eigenen Anbieter mit Schlüssel verwenden.",
      },
      { property: "og:title", content: "KI-Einstellungen — FB/Control" },
      {
        property: "og:description",
        content: "Eingebaute KI oder eigenen Anbieter mit Schlüssel verwenden.",
      },
    ],
  }),
  component: AiSettingsPage,
});

const PROVIDERS = [
  {
    value: "lovable",
    label: "Eingebaute KI (kein Schlüssel nötig)",
    model: "google/gemini-3.7-flash",
  },
  { value: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { value: "openrouter", label: "OpenRouter", model: "openai/gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic", model: "claude-3-5-sonnet-latest" },
  { value: "custom", label: "OpenAI-kompatibler Endpunkt", model: "" },
];

function AiSettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAiSettings);
  const save = useServerFn(saveAiSettings);
  const test = useServerFn(testAiSettings);

  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: () => load() });

  const [provider, setProvider] = useState("lovable");
  const [model, setModel] = useState("google/gemini-3.7-flash");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setProvider(settings.data.provider);
    setModel(settings.data.model);
    setBaseUrl(settings.data.baseUrl ?? "");
  }, [settings.data]);

  const saveMut = useMutation({
    mutationFn: () => save({ data: { provider, model, baseUrl, apiKey } }),
    onSuccess: () => {
      toast.success("KI-Einstellungen gespeichert");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: {} as never }),
    onSuccess: (res) =>
      res.ok
        ? toast.success(`Verbindung ok (${res.provider} / ${res.model})`)
        : toast.error(res.error ?? "Test fehlgeschlagen"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="KI-Einstellungen"
      subtitle="Welches Modell schreibt die Texte?"
      hint="Standardmäßig läuft alles über die eingebaute KI. Du kannst stattdessen deinen eigenen Anbieter und Schlüssel hinterlegen — die Texte werden dann dort erzeugt. Der Schlüssel bleibt serverseitig."
    >
      <div className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Anbieter
            <InfoHint text="Eingebaute KI braucht keinen Schlüssel. Bei OpenAI, OpenRouter, Anthropic oder einem eigenen Endpunkt hinterlegst du deinen Schlüssel." />
          </Label>
          <Select
            value={provider}
            onValueChange={(v) => {
              setProvider(v);
              const preset = PROVIDERS.find((p) => p.value === v);
              if (preset?.model) setModel(preset.model);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Modell
            <InfoHint text="Modellname genau so, wie ihn dein Anbieter erwartet, z. B. gpt-4o-mini." />
          </Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>

        {provider === "custom" ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Basis-URL
              <InfoHint text="OpenAI-kompatible Basis-URL ohne /chat/completions, z. B. https://api.deinserver.de/v1" />
            </Label>
            <Input
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        ) : null}

        {provider !== "lovable" ? (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              API-Schlüssel
              <InfoHint text="Wird verschlüsselt serverseitig gespeichert und nie im Browser angezeigt. Leer lassen, um den vorhandenen Schlüssel zu behalten." />
            </Label>
            <Input
              type="password"
              value={apiKey}
              placeholder={settings.data?.hasKey ? "•••••••• (gespeichert)" : "sk-…"}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Speichern
          </Button>
          <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            Verbindung testen
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Die KI bekommt bei jedem Text den Namen der Person, den erkannten Beitrag oder Kommentar
          und den bisherigen Gesprächsverlauf — plus Rolle und Tonfall des Bots. So greift sie das
          konkrete Thema auf, statt allgemeine Floskeln zu schreiben.
        </p>
      </div>
    </AppShell>
  );
}
