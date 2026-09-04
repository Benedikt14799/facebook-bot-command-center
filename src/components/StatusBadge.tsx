import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  live: "bg-success/15 text-success border-success/30",
  active: "bg-success/15 text-success border-success/30",
  done: "bg-success/15 text-success border-success/30",
  online: "bg-success/15 text-success border-success/30",
  ok: "bg-success/15 text-success border-success/30",
  warmup: "bg-warning/15 text-warning border-warning/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  running: "bg-warning/15 text-warning border-warning/30",
  paused: "bg-muted text-muted-foreground border-border",
  offline: "bg-muted text-muted-foreground border-border",
  missing: "bg-muted text-muted-foreground border-border",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        tone[value] ?? "bg-secondary text-secondary-foreground border-border",
        className,
      )}
    >
      {value}
    </span>
  );
}
