import { describe, expect, it } from "vitest";
import { DEFAULT_RISK_LIMITS } from "@tradent/core";
import { checkOrders, type GuardrailInput } from "./guardrails";

const base: GuardrailInput = {
  orders: [],
  riskLimits: DEFAULT_RISK_LIMITS,
  account: { cash: 100_000, equity: 100_000, buyingPower: 100_000, lastEquity: 100_000 },
  positions: [],
  prices: { SPY: 500 },
  killed: false,
};
const buy = (quantity: number) => ({ symbol: "SPY", instrument: "equity" as const, side: "buy" as const, quantity, type: "market" as const });

describe("checkOrders", () => {
  it("returns no_action for an empty proposal", () => {
    expect(checkOrders(base).result).toBe("no_action");
  });

  it("approves a buy within the 20% position cap", () => {
    expect(checkOrders({ ...base, orders: [buy(40)] }).result).toBe("approved");
  });

  it("rejects a buy over the position cap", () => {
    const out = checkOrders({ ...base, orders: [buy(41)] });
    expect(out.result).toBe("rejected");
    expect(out.checks[0]!.reasons.join()).toMatch(/over the 20% cap/);
  });

  it("counts earlier approved orders in the same proposal toward the cap", () => {
    const out = checkOrders({ ...base, orders: [buy(30), buy(30)] });
    expect(out.checks.map((c) => c.approved)).toEqual([true, false]);
  });

  it("never loosens the developer's limits past the defaults", () => {
    const out = checkOrders({ ...base, riskLimits: { ...DEFAULT_RISK_LIMITS, maxPositionPct: 0.9 }, orders: [buy(41)] });
    expect(out.result).toBe("rejected");
  });

  it("rejects short sales, symbols outside the allow list and market option orders", () => {
    const out = checkOrders({
      ...base,
      riskLimits: { ...DEFAULT_RISK_LIMITS, allowedSymbols: ["SPY"] },
      prices: { SPY: 500, QQQ: 400 },
      orders: [
        { ...buy(1), side: "sell" },
        { ...buy(1), symbol: "QQQ" },
        { symbol: "SPY261120C00500000", instrument: "option", side: "buy", quantity: 1, type: "market" },
      ],
    });
    expect(out.result).toBe("rejected");
    expect(out.checks[0]!.reasons.join()).toMatch(/go short/);
    expect(out.checks[1]!.reasons.join()).toMatch(/allowed symbols/);
    expect(out.checks[2]!.reasons.join()).toMatch(/must be limit orders/);
  });

  it("values options at 100 shares per contract", () => {
    const opt = { symbol: "SPY261120C00500000", instrument: "option" as const, side: "buy" as const, quantity: 3, type: "limit" as const, limitPrice: 70 };
    expect(checkOrders({ ...base, orders: [opt] }).result).toBe("rejected"); // $21,000 > $20,000
    expect(checkOrders({ ...base, orders: [{ ...opt, quantity: 2 }] }).result).toBe("approved");
  });

  it("stops the day at a 5% loss and when the kill switch is on", () => {
    const down = checkOrders({ ...base, account: { ...base.account, equity: 95_000 }, orders: [buy(1)] });
    expect(down).toMatchObject({ result: "rejected", stopForDay: true });
    expect(checkOrders({ ...base, killed: true, orders: [buy(1)] }).result).toBe("rejected");
  });
});
