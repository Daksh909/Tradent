import type { FeedDecision } from "@tradent/agent";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatDateTime, formatUsd } from "@/lib/format";

const RESULT: Record<FeedDecision["guardrailResult"], { label: string; className: string }> = {
  approved: { label: "Approved", className: "border-gain/50 text-gain" },
  rejected: { label: "Rejected", className: "border-loss/50 text-loss" },
  no_action: { label: "No trade", className: "" },
};

type Order = { side?: string; quantity?: number; symbol?: string; type?: string; limitPrice?: number };

export function describeOrder(o: Order): string {
  const price = o.limitPrice ? ` @ ${formatUsd(o.limitPrice)}` : "";
  return `${o.side === "sell" ? "Sell" : "Buy"} ${o.quantity ?? "?"} ${o.symbol ?? "?"} ${o.type ?? ""}${price}`.trim();
}

/** One logged decision: reasoning, proposed orders and the guardrail result. Cost shows only when given. */
export function DecisionCard({ d, tokens }: { d: FeedDecision; tokens?: { input: number; output: number } }) {
  const result = RESULT[d.guardrailResult];
  return (
    <article id={`decision-${d.id}`} tabIndex={-1} className="scroll-mt-20 space-y-2 rounded-lg border p-3 text-sm outline-none target:ring-2 target:ring-ring focus:ring-2 focus:ring-ring" data-testid="decision-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{formatDateTime(d.decidedAt)}</span>
        <Badge variant="outline" className={result.className}>
          {result.label}
        </Badge>
      </header>
      <p>{d.reasoning ?? "No reasoning recorded."}</p>
      {d.proposedOrders.length > 0 && (
        <ul className="space-y-0.5 tabular-nums text-muted-foreground">
          {(d.proposedOrders as Order[]).map((o, i) => (
            <li key={i}>{describeOrder(o)}</li>
          ))}
        </ul>
      )}
      {d.guardrailReasons.length > 0 && (
        <ul className="space-y-0.5 text-loss">
          {d.guardrailReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <footer className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
        <span>{d.modelId}</span>
        {tokens && (
          <span>
            {tokens.input.toLocaleString()} in · {tokens.output.toLocaleString()} out tokens
          </span>
        )}
        {d.costUsd !== null && <span>AI cost {formatCost(d.costUsd)}</span>}
      </footer>
    </article>
  );
}
