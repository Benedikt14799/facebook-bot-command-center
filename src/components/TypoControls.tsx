/**
 * Steuerung der Tippfehler-Natuerlichkeit fuer einen einzelnen Auftrag.
 *
 * Erlaubt eine maximale Tippfehlerquote (Obergrenze gegenueber der
 * Bot-Standardrate) sowie die Auswahl bevorzugter Fehlerarten. Ohne Auswahl
 * sind alle Fehlerarten erlaubt.
 */
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoHint } from "@/components/InfoHint";
import { TYPO_KINDS, type JobTypoSettings, type TypoKind } from "@/lib/job-types";

export function TypoControls({
  value,
  onChange,
  disabled,
}: {
  value: JobTypoSettings;
  onChange: (next: JobTypoSettings) => void;
  disabled?: boolean;
}) {
  const toggle = (kind: TypoKind, on: boolean) =>
    onChange({
      ...value,
      kinds: on ? [...value.kinds, kind] : value.kinds.filter((k) => k !== kind),
    });

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-xs">
          Maximale Tippfehlerquote: {Math.round(value.rate * 100)} %
          <InfoHint text="Obergrenze für diesen Auftrag. 0 % = fehlerfreier Text, höhere Werte streuen gelegentliche Vertipper ein, damit die Nachricht menschlicher wirkt. Der Bot-Standard wird dadurch nie überschritten." />
        </Label>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          disabled={disabled}
          className="w-full accent-primary"
          value={Math.round(value.rate * 100)}
          onChange={(e) => onChange({ ...value, rate: Number(e.target.value) / 100 })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-xs">
          Bevorzugte Fehlerarten
          <InfoHint text="Nichts angehakt = alle Fehlerarten erlaubt. Sonst werden nur die ausgewählten Arten verwendet." />
        </Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {TYPO_KINDS.map((k) => (
            <label
              key={k.value}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                checked={value.kinds.includes(k.value)}
                disabled={disabled || value.rate === 0}
                onCheckedChange={(c) => toggle(k.value, c === true)}
              />
              <span>
                <span className="text-foreground">{k.label}</span>
                <span className="block text-[11px]">{k.example}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
