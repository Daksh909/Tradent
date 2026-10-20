import { describe, expect, it } from "vitest";
import { FakeBroker } from "./fake";

describe("FakeBroker", () => {
  it("fills market orders at the set price and tracks cash and positions", async () => {
    const b = new FakeBroker();
    b.setPrice("SPY", 500);
    const { externalAccountId: id } = await b.createPaperAccount({ label: "t", startingCash: 10000 });
    await b.submitOrder(id, { symbol: "SPY", instrument: "equity", side: "buy", quantity: 4, type: "market", clientOrderId: "c1" });
    b.setPrice("SPY", 510);
    expect(await b.getAccount(id)).toMatchObject({ cash: 8000, equity: 10040 });
    expect(await b.getFills(id)).toHaveLength(1);
  });

  it("treats a repeated client order id as the same order", async () => {
    const b = new FakeBroker();
    b.setPrice("SPY", 500);
    const { externalAccountId: id } = await b.createPaperAccount({ label: "t", startingCash: 10000 });
    const req = { symbol: "SPY", instrument: "equity" as const, side: "buy" as const, quantity: 1, type: "market" as const, clientOrderId: "c1" };
    await b.submitOrder(id, req);
    await b.submitOrder(id, req);
    expect(await b.getOrders(id)).toHaveLength(1);
  });

  it("leaves unmet limit orders open until cancelled", async () => {
    const b = new FakeBroker();
    b.setPrice("SPY", 500);
    const { externalAccountId: id } = await b.createPaperAccount({ label: "t", startingCash: 10000 });
    const o = await b.submitOrder(id, { symbol: "SPY", instrument: "equity", side: "buy", quantity: 1, type: "limit", limitPrice: 490, clientOrderId: "c1" });
    expect(await b.getOrders(id, { status: "open" })).toHaveLength(1);
    await b.cancelOrder(id, o.brokerOrderId);
    expect(await b.getOrders(id, { status: "open" })).toHaveLength(0);
  });
});

describe("FakeBroker calendar", () => {
  it("lists weekdays that are not holidays", async () => {
    const b = new FakeBroker();
    b.holidays.add("2026-11-26");
    const days = await b.getCalendar("2026-11-23", "2026-11-29");
    expect(days.map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-27"]);
  });
});
