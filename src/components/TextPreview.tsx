/**
 * Text- und Ton-Vorschau fuer einen Auftrag.
 *
 * Zeigt vor dem Absenden, wie die KI auf Basis des Personen-Kontexts
 * (Vorname, letzter erkannter Text, Gespraechsverlauf, Persona, Angebot)
 * antworten wuerde. Der Text wird nur erzeugt, nicht gesendet — er kann
 * per Klick als fester Text in den Auftrag uebernommen werden.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/InfoHint";
import { previewJobText, type PreviewResult } from "@/lib/preview.functions";
import { toast } from "sonner";

export function TextPreview({
  botId,
  type,
  groupId,
  recipientId,
  context,
  onUse,
}: {
  botId: string;
  type: string;
  groupId?: string | null;
  recipientId?: string | null;
  context?: string | null;
  onUse?: (text: string) => void;
}) {
  const run = useServerFn(previewJobText);
  const [result, setResult] = useState<PreviewResult | null>(null);

  const preview = useMutation({
    mutationFn: async () =>
      (await run({
        data: {
          botId,
          type,
          groupId: groupId ?? null,
          recipientId: recipientId ?? null,
          context: context ?? null,
        },
      })) as PreviewResult,
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const textless = type === "like_posts" || type === "scan_group";

  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          Vorschau: Text & Ton
          <InfoHint text="Erzeugt genau den Text, den der Bot senden würde — mit Vorname, letztem erkannten Text und bisherigem Verlauf der Person. Es wird nichts gesendet." />
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!botId || textless || preview.isPending}
          onClick={() => preview.mutate()}
        >
          {preview.isPending ? "Schreibt …" : "Vorschau erzeugen"}
        </Button>
      </div>

      {textless ? (
        <p className="text-xs text-muted-foreground">
          Diese Aktion sendet keinen Text — es gibt nichts vorzuschauen.
        </p>
      ) : null}

      {result ? (
        <>
          <p className="whitespace-pre-wrap rounded-md border border-border/60 bg-background p-3 text-sm text-foreground">
            {result.text}
          </p>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            <li>
              Absender: {result.used.bot}
              {result.used.persona ? ` (${result.used.persona})` : ""}
              {result.used.tone ? ` · Tonfall: ${result.used.tone}` : ""}
            </li>
            <li>
              Anrede: {result.used.firstName ?? "kein Vorname bekannt"}
              {result.used.group ? ` · Gruppe: ${result.used.group}` : ""}
            </li>
            <li>
              Verlauf: {result.used.historyCount} Nachricht(en)
              {result.used.offer ? " · Angebot wird platziert" : " · kein Angebot"}
              {` · Tippfehler-Rate ${Math.round(result.used.typoRate * 100)} %`}
            </li>
            {result.used.context ? <li>Bezug: „{result.used.context.slice(0, 120)}“</li> : null}
          </ul>
          {onUse ? (
            <Button size="sm" variant="ghost" onClick={() => onUse(result.text)}>
              Als festen Text übernehmen
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
