import { cn } from "@/lib/utils";

/** Shown on every page: nothing on this platform trades real money (CLAUDE.md hard rule 14). */
export function PaperBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="paper-badge"
      title="Paper trading only. No real money is ever traded."
      className={cn("inline-flex items-center rounded-md bg-paper px-2 py-0.5 text-xs font-semibold tracking-wide text-paper-foreground uppercase", className)}
    >
      Paper
    </span>
  );
}
