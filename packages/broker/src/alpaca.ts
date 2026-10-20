// Alpaca Broker API sandbox. Endpoint paths follow Alpaca's official alpaca-py
// SDK (alpaca/broker/client.py, alpaca/data/historical); not yet exercised
// against the live sandbox with real keys.
import type {
  AccountSummary,
  BarSeries,
  BarTimeframe,
  BrokerAdapter,
  BrokerFill,
  BrokerOrder,
  MarketClock,
  OptionChain,
  OrderRequest,
  Position,
  Quote,
  TradingDay,
} from "./types";

export interface AlpacaSandboxConfig {
  apiKey: string;
  apiSecret: string;
  brokerBaseUrl: string;
  dataBaseUrl: string;
  fetch?: typeof fetch;
  /** Used for the 15-minute SIP delay; injectable for tests. */
  now?: () => Date;
}

/** CLAUDE.md hard rule 1: refuse any host that isn't an Alpaca sandbox. */
export function assertSandboxUrl(url: string): void {
  const host = new URL(url).hostname;
  if (!/^[a-z-]+\.sandbox\.alpaca\.markets$/.test(host)) {
    throw new Error(`Refusing non-sandbox Alpaca host "${host}": the MVP has no live trading path`);
  }
}

export function alpacaSandboxFromEnv(env: NodeJS.ProcessEnv = process.env): AlpacaSandboxBroker {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  return new AlpacaSandboxBroker({
    apiKey: need("ALPACA_BROKER_API_KEY"),
    apiSecret: need("ALPACA_BROKER_API_SECRET"),
    brokerBaseUrl: need("ALPACA_BROKER_BASE_URL"),
    dataBaseUrl: need("ALPACA_DATA_BASE_URL"),
  });
}

const SIP_DELAY_MS = 15 * 60 * 1000;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export class AlpacaSandboxBroker implements BrokerAdapter {
  private readonly auth: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: AlpacaSandboxConfig) {
    assertSandboxUrl(config.brokerBaseUrl);
    assertSandboxUrl(config.dataBaseUrl);
    this.auth = `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;
    this.fetchFn = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private async request<T>(base: string, method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const res = await this.fetchFn(url, {
      method,
      headers: { Authorization: this.auth, "Content-Type": "application/json", Accept: "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) throw new Error(`Alpaca ${method} ${url.pathname} failed: ${res.status} ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private broker<T>(method: string, path: string, opts?: { query?: Record<string, string | undefined>; body?: unknown }) {
    return this.request<T>(this.config.brokerBaseUrl, method, `/v1${path}`, opts);
  }

  private data<T>(path: string, query: Record<string, string | undefined>) {
    return this.request<T>(this.config.dataBaseUrl, "GET", path, { query });
  }

  async createPaperAccount({ label, startingCash }: { label: string; startingCash: number }) {
    const account = await this.broker<{ id: string }>("POST", "/accounts", { body: sandboxAccountPayload(label, this.now()) });
    // Fund through the Transfer API: a sandbox ACH relationship, then an incoming transfer.
    const ach = await this.broker<{ id: string }>("POST", `/accounts/${account.id}/ach_relationships`, {
      body: {
        account_owner_name: `Tradent ${label}`,
        bank_account_type: "CHECKING",
        // DEFAULT: Alpaca's sandbox accepts test bank details; no real bank is involved.
        bank_account_number: "32131231abc",
        bank_routing_number: "121000358",
        nickname: "Tradent paper funding",
      },
    });
    await this.broker("POST", `/accounts/${account.id}/transfers`, {
      body: { transfer_type: "ach", relationship_id: ach.id, amount: startingCash.toFixed(2), direction: "INCOMING" },
    });
    return { externalAccountId: account.id };
  }

  async getAccount(accountId: string): Promise<AccountSummary> {
    const a = await this.broker<Record<string, unknown>>("GET", `/trading/accounts/${accountId}/account`);
    return { cash: num(a.cash), equity: num(a.equity), buyingPower: num(a.buying_power), lastEquity: num(a.last_equity) };
  }

  async getPositions(accountId: string): Promise<Position[]> {
    const rows = await this.broker<Record<string, unknown>[]>("GET", `/trading/accounts/${accountId}/positions`);
    return rows.map((p) => ({
      symbol: String(p.symbol),
      instrument: p.asset_class === "us_option" ? "option" : "equity",
      quantity: num(p.qty),
      avgEntryPrice: num(p.avg_entry_price),
      marketValue: num(p.market_value),
      unrealizedPl: num(p.unrealized_pl),
    }));
  }

  async submitOrder(accountId: string, order: OrderRequest): Promise<BrokerOrder> {
    const o = await this.broker<Record<string, unknown>>("POST", `/trading/accounts/${accountId}/orders`, {
      body: {
        symbol: order.symbol,
        qty: String(order.quantity),
        side: order.side,
        type: order.type,
        time_in_force: "day",
        limit_price: order.limitPrice === undefined ? undefined : String(order.limitPrice),
        stop_price: order.stopPrice === undefined ? undefined : String(order.stopPrice),
        client_order_id: order.clientOrderId,
      },
    });
    return toOrder(o);
  }

  async cancelOrder(accountId: string, brokerOrderId: string) {
    await this.broker("DELETE", `/trading/accounts/${accountId}/orders/${brokerOrderId}`);
  }

  async getOrders(accountId: string, opts: { status?: "open" | "closed" | "all" } = {}) {
    const rows = await this.broker<Record<string, unknown>[]>("GET", `/trading/accounts/${accountId}/orders`, { query: { status: opts.status ?? "all" } });
    return rows.map(toOrder);
  }

  async getFills(accountId: string, opts: { after?: string } = {}): Promise<BrokerFill[]> {
    const rows = await this.broker<Record<string, unknown>[]>("GET", "/accounts/activities", {
      query: { account_id: accountId, activity_types: "FILL", after: opts.after, direction: "asc" },
    });
    return rows.map((f) => ({
      brokerFillId: String(f.id),
      brokerOrderId: String(f.order_id),
      symbol: String(f.symbol),
      side: f.side === "sell" ? "sell" : "buy",
      price: num(f.price),
      quantity: num(f.qty),
      filledAt: String(f.transaction_time),
    }));
  }

  async getClock(): Promise<MarketClock> {
    const c = await this.broker<Record<string, unknown>>("GET", "/clock");
    return { timestamp: String(c.timestamp), isOpen: Boolean(c.is_open), nextOpen: String(c.next_open), nextClose: String(c.next_close) };
  }

  async getCalendar(start: string, end: string): Promise<TradingDay[]> {
    const days = await this.broker<{ date: string; open: string; close: string }[]>("GET", "/calendar", { query: { start, end } });
    return (days ?? []).map((d) => ({ date: d.date, open: d.open, close: d.close }));
  }

  async getLatestQuotes(symbols: string[]): Promise<Quote[]> {
    const res = await this.data<{ quotes: Record<string, Record<string, unknown>> }>("/v2/stocks/quotes/latest", { symbols: symbols.join(","), feed: "iex" });
    return Object.entries(res.quotes ?? {}).map(([symbol, q]) => ({ symbol, bid: num(q.bp), ask: num(q.ap), time: String(q.t), source: "IEX real-time" }));
  }

  async getBars(symbol: string, timeframe: BarTimeframe, opts: { start: string; end?: string; delayed?: boolean }): Promise<BarSeries> {
    // Free all-exchange (SIP) data must end at least 15 minutes ago (Decision 16).
    let end = opts.end;
    if (opts.delayed) {
      const latest = new Date(this.now().getTime() - SIP_DELAY_MS);
      if (!end || new Date(end) > latest) end = latest.toISOString();
    }
    const res = await this.data<{ bars: Record<string, Record<string, unknown>[]> }>("/v2/stocks/bars", {
      symbols: symbol,
      timeframe,
      start: opts.start,
      end,
      feed: opts.delayed ? "sip" : "iex",
      limit: "10000",
    });
    return {
      symbol,
      timeframe,
      source: opts.delayed ? "SIP 15-min delayed" : "IEX real-time",
      bars: (res.bars?.[symbol] ?? []).map((b) => ({ time: String(b.t), open: num(b.o), high: num(b.h), low: num(b.l), close: num(b.c), volume: num(b.v) })),
    };
  }

  async getOptionChain(underlying: string): Promise<OptionChain> {
    const res = await this.data<{ snapshots: Record<string, Record<string, any>> }>(`/v1beta1/options/snapshots/${underlying}`, { feed: "indicative", limit: "1000" });
    return {
      underlying,
      source: "Options indicative",
      contracts: Object.entries(res.snapshots ?? {}).map(([contractSymbol, s]) => ({
        contractSymbol,
        bid: numOrNull(s.latestQuote?.bp),
        ask: numOrNull(s.latestQuote?.ap),
        lastPrice: numOrNull(s.latestTrade?.p),
        impliedVolatility: numOrNull(s.impliedVolatility),
        delta: numOrNull(s.greeks?.delta),
      })),
    };
  }
}

function toOrder(o: Record<string, unknown>): BrokerOrder {
  return {
    brokerOrderId: String(o.id),
    clientOrderId: String(o.client_order_id),
    symbol: String(o.symbol),
    side: o.side === "sell" ? "sell" : "buy",
    quantity: num(o.qty),
    type: o.type as BrokerOrder["type"],
    status: String(o.status),
    filledQuantity: num(o.filled_qty),
    filledAvgPrice: numOrNull(o.filled_avg_price),
    submittedAt: String(o.submitted_at),
  };
}

// DEFAULT: synthetic identity for sandbox accounts. Every paper account belongs
// to the platform, not to a real person, and the sandbox moves no real money.
function sandboxAccountPayload(label: string, now: Date) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const signedAt = now.toISOString();
  const agreement = (agreement: string) => ({ agreement, signed_at: signedAt, ip_address: "127.0.0.1" });
  return {
    contact: {
      email_address: `paper+${slug}-${now.getTime()}@tradent.invalid`,
      phone_number: "555-555-0100",
      street_address: ["1 Paper St"],
      city: "New York",
      state: "NY",
      postal_code: "10001",
      country: "USA",
    },
    identity: {
      given_name: "Tradent",
      family_name: `Agent ${slug}`,
      date_of_birth: "1990-01-01",
      tax_id: "666-55-4321",
      tax_id_type: "USA_SSN",
      country_of_citizenship: "USA",
      country_of_birth: "USA",
      country_of_tax_residence: "USA",
      funding_source: ["employment_income"],
    },
    disclosures: {
      is_control_person: false,
      is_affiliated_exchange_or_finra: false,
      is_politically_exposed: false,
      immediate_family_exposed: false,
    },
    agreements: [agreement("customer_agreement"), agreement("account_agreement"), agreement("options_agreement")],
  };
}
