import type { AgentModel } from "@tradent/core";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const formatUsd = (n: number, whole = false) => (whole ? usd0 : usd).format(n);

/** Gains get a plus sign and losses a minus sign, so color is never the only signal. */
export function formatSignedPct(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "–";
  const v = (n * 100).toFixed(digits);
  return n > 0 ? `+${v}%` : n < 0 ? `−${v.slice(1)}%` : `${v}%`;
}

export const formatPct = (n: number | null, digits = 1) => (n === null ? "–" : `${(n * 100).toFixed(digits)}%`);

export function signClass(n: number | null): string {
  if (n === null || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-gain" : "text-loss";
}

export const MODEL_LABELS: Record<AgentModel, string> = { haiku: "Haiku 5.5", sonnet: "Sonnet 5.5", opus: "Opus 5.5" };

export function cadenceLabel(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? "Daily" : `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "Hourly" : `Every ${minutes / 60} hours`;
  return `Every ${minutes} min`;
}

export const formatDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

/** AI cost: four decimals under a dollar, since one decision costs cents. */
export const formatCost = (n: number) => (n < 1 ? `$${n.toFixed(4)}` : formatUsd(n));
