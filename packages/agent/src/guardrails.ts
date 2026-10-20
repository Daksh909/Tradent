// Checks applied to the model's proposed orders, outside the model
// (CLAUDE.md hard rules 2 and 8). Pure function: no I/O.
import { clampRiskLimits, INSTRUMENT_TYPES, type RiskLimits } from "@tradent/core";
import type { AccountSummary, OrderRequest, Position } from "@tradent/broker";

export type ProposedOrder = Omit<OrderRequest, "clientOrderId">;

export interface OrderCheck {
  order: ProposedOrder;
  approved: boolean;
  reasons: string[];
}

export interface GuardrailInput {
  orders: ProposedOrder[];
  riskLimits: RiskLimits;
  account: AccountSummary;
  positions: Position[];
  /** Price used to value each order, by symbol. */
  prices: Record<string, number>;
  killed: boolean;
}

export interface GuardrailOutcome {
  result: "approved" | "rejected" | "no_action";
  /** True when the daily loss stop is hit: the agent stops for the rest of the day. */
  stopForDay: boolean;
  checks: OrderCheck[];
}

// Options are quoted per share; one contract is 100 shares.
const CONTRACT_MULTIPLIER = 100;

export function dailyLossHit(account: AccountSummary, limits: RiskLimits): boolean {
  if (account.lastEquity <= 0) return false;
  return (account.lastEquity - account.equity) / account.lastEquity >= limits.maxDailyLossPct;
}

export function checkOrders(input: GuardrailInput): GuardrailOutcome {
  const limits = clampRiskLimits(input.riskLimits);
  const stopForDay = dailyLossHit(input.account, limits);
  if (input.orders.length === 0) return { result: "no_action", stopForDay, checks: [] };

  const held = new Map(input.positions.map((p) => [p.symbol, p.quantity]));
  const checks = input.orders.map((order): OrderCheck => {
    const reasons: string[] = [];
    if (input.killed) reasons.push("Agent kill switch is on");
    if (stopForDay) reasons.push(`Daily loss reached ${(limits.maxDailyLossPct * 100).toFixed(1)}%; the agent is stopped for the day`);
    if (!INSTRUMENT_TYPES.includes(order.instrument)) reasons.push(`Instrument ${order.instrument} is not allowed`);
    if (limits.allowedSymbols.length > 0 && !limits.allowedSymbols.includes(order.symbol)) reasons.push(`${order.symbol} is not in this agent's allowed symbols`);
    if (!(order.quantity > 0) || !Number.isFinite(order.quantity)) reasons.push("Quantity must be a positive number");
    if ((order.type === "limit" || order.type === "stop_limit") && !(order.limitPrice! > 0)) reasons.push("Limit orders need a positive limit price");

    // DEFAULT: options trade with limit orders only (thin, indicative quotes).
    if (order.instrument === "option" && order.type !== "limit") reasons.push("Options orders must be limit orders");

    const price = order.limitPrice ?? input.prices[order.symbol];
    if (price === undefined) reasons.push(`No price available for ${order.symbol}`);

    const current = held.get(order.symbol) ?? 0;
    const signed = order.side === "buy" ? order.quantity : -order.quantity;
    // DEFAULT: no short selling and no writing uncovered options in the MVP.
    if (current + signed < 0) reasons.push(`Selling ${order.quantity} would go short; only ${current} held`);

    if (price !== undefined && order.side === "buy") {
      const multiplier = order.instrument === "option" ? CONTRACT_MULTIPLIER : 1;
      const after = Math.abs(current + signed) * price * multiplier;
      const cap = limits.maxPositionPct * input.account.equity;
      if (after > cap) reasons.push(`Position would be $${after.toFixed(2)}, over the ${(limits.maxPositionPct * 100).toFixed(0)}% cap of $${cap.toFixed(2)}`);
    }

    if (reasons.length === 0) held.set(order.symbol, current + signed);
    return { order, approved: reasons.length === 0, reasons };
  });

  return { result: checks.some((c) => c.approved) ? "approved" : "rejected", stopForDay, checks };
}
