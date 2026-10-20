import { describe, expect, it } from "vitest";
import { AlpacaSandboxBroker, assertSandboxUrl } from "./alpaca";

const BROKER = "https://broker-api.sandbox.alpaca.markets";
const DATA = "https://data.sandbox.alpaca.markets";

function mockFetch(responses: unknown[]) {
  const calls: { url: URL; method: string; body: any; auth: string | null }[] = [];
  const fn = (async (input: URL, init: RequestInit) => {
    calls.push({ url: input, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init.headers).get("Authorization") });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function broker(responses: unknown[], now = new Date("2026-10-20T15:00:00Z")) {
  const { fn, calls } = mockFetch(responses);
  return { b: new AlpacaSandboxBroker({ apiKey: "k", apiSecret: "s", brokerBaseUrl: BROKER, dataBaseUrl: DATA, fetch: fn, now: () => now }), calls };
}

describe("assertSandboxUrl", () => {
  it("accepts sandbox hosts", () => {
    expect(() => assertSandboxUrl(BROKER)).not.toThrow();
    expect(() => assertSandboxUrl(DATA)).not.toThrow();
  });
  it("refuses anything else", () => {
    expect(() => assertSandboxUrl("https://broker-api.example.com")).toThrow(/non-sandbox/);
    expect(() => assertSandboxUrl("https://sandbox.alpaca.markets.evil.com")).toThrow(/non-sandbox/);
  });
});

describe("AlpacaSandboxBroker", () => {
  it("creates an account, links a sandbox bank and transfers the starting cash", async () => {
    const { b, calls } = broker([{ id: "acc-1" }, { id: "ach-1" }, { id: "tr-1" }]);
    expect(await b.createPaperAccount({ label: "SPY v1", startingCash: 100000 })).toEqual({ externalAccountId: "acc-1" });
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /v1/accounts",
      "POST /v1/accounts/acc-1/ach_relationships",
      "POST /v1/accounts/acc-1/transfers",
    ]);
    expect(calls[2]!.body).toMatchObject({ transfer_type: "ach", relationship_id: "ach-1", amount: "100000.00", direction: "INCOMING" });
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from("k:s").toString("base64")}`);
  });

  it("submits orders with our client order id", async () => {
    const { b, calls } = broker([{ id: "o-1", client_order_id: "dec-1", symbol: "SPY", side: "buy", qty: "3", type: "limit", status: "new", filled_qty: "0", filled_avg_price: null, submitted_at: "t" }]);
    const order = await b.submitOrder("acc-1", { symbol: "SPY", instrument: "equity", side: "buy", quantity: 3, type: "limit", limitPrice: 500.5, clientOrderId: "dec-1" });
    expect(calls[0]!.url.pathname).toBe("/v1/trading/accounts/acc-1/orders");
    expect(calls[0]!.body).toMatchObject({ symbol: "SPY", qty: "3", side: "buy", type: "limit", time_in_force: "day", limit_price: "500.5", client_order_id: "dec-1" });
    expect(order).toMatchObject({ brokerOrderId: "o-1", clientOrderId: "dec-1", quantity: 3, filledAvgPrice: null });
  });

  it("reads fills from account activities", async () => {
    const { b, calls } = broker([[{ id: "f-1", order_id: "o-1", symbol: "SPY", side: "buy", price: "501.2", qty: "3", transaction_time: "2026-10-20T14:31:00Z" }]]);
    expect(await b.getFills("acc-1")).toEqual([{ brokerFillId: "f-1", brokerOrderId: "o-1", symbol: "SPY", side: "buy", price: 501.2, quantity: 3, filledAt: "2026-10-20T14:31:00Z" }]);
    expect(calls[0]!.url.pathname).toBe("/v1/accounts/activities");
    expect(calls[0]!.url.searchParams.get("account_id")).toBe("acc-1");
    expect(calls[0]!.url.searchParams.get("activity_types")).toBe("FILL");
  });

  it("labels IEX quotes as real time", async () => {
    const { b, calls } = broker([{ quotes: { SPY: { bp: 500, ap: 500.1, t: "t" } } }]);
    expect(await b.getLatestQuotes(["SPY"])).toEqual([{ symbol: "SPY", bid: 500, ask: 500.1, time: "t", source: "IEX real-time" }]);
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe(`${DATA}/v2/stocks/quotes/latest`);
    expect(calls[0]!.url.searchParams.get("feed")).toBe("iex");
  });

  it("clamps delayed SIP bars to 15 minutes ago and labels them", async () => {
    const { b, calls } = broker([{ bars: { SPY: [{ t: "t", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] } }]);
    const series = await b.getBars("SPY", "1Hour", { start: "2026-10-20T13:30:00Z", delayed: true });
    expect(series.source).toBe("SIP 15-min delayed");
    expect(calls[0]!.url.searchParams.get("feed")).toBe("sip");
    expect(calls[0]!.url.searchParams.get("end")).toBe("2026-10-20T14:45:00.000Z");
  });
});

describe("AlpacaSandboxBroker calendar", () => {
  it("reads trading days from the broker calendar", async () => {
    const { b, calls } = broker([[{ date: "2026-10-20", open: "09:30", close: "16:00", session_open: "0400", session_close: "2000" }]]);
    expect(await b.getCalendar("2026-10-20", "2026-10-20")).toEqual([{ date: "2026-10-20", open: "09:30", close: "16:00" }]);
    expect(calls[0]!.url.toString()).toBe(`${BROKER}/v1/calendar?start=2026-10-20&end=2026-10-20`);
  });
});
