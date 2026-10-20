// In-memory broker for tests and local runs without Alpaca keys. It plays the
// broker's role, so its fills stand in for broker fills; never use it for a
// record shown to investors.
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
} from "./types";

interface FakeAccount {
  cash: number;
  lastEquity: number;
  positions: Map<string, { quantity: number; avgEntryPrice: number }>;
  orders: BrokerOrder[];
  fills: BrokerFill[];
}

export class FakeBroker implements BrokerAdapter {
  private accounts = new Map<string, FakeAccount>();
  private prices = new Map<string, number>();
  private seq = 0;
  marketOpen = true;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Set the price market orders fill at. */
  setPrice(symbol: string, price: number) {
    this.prices.set(symbol, price);
  }

  private nextId(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  private account(id: string) {
    const a = this.accounts.get(id);
    if (!a) throw new Error(`Unknown fake account ${id}`);
    return a;
  }

  private price(symbol: string) {
    const p = this.prices.get(symbol);
    if (p === undefined) throw new Error(`No fake price for ${symbol}`);
    return p;
  }

  async createPaperAccount({ startingCash }: { label: string; startingCash: number }) {
    const id = this.nextId("acct");
    this.accounts.set(id, { cash: startingCash, lastEquity: startingCash, positions: new Map(), orders: [], fills: [] });
    return { externalAccountId: id };
  }

  async getAccount(accountId: string): Promise<AccountSummary> {
    const a = this.account(accountId);
    const equity = a.cash + [...a.positions].reduce((sum, [symbol, p]) => sum + p.quantity * this.price(symbol), 0);
    return { cash: a.cash, equity, buyingPower: a.cash, lastEquity: a.lastEquity };
  }

  async getPositions(accountId: string): Promise<Position[]> {
    return [...this.account(accountId).positions].map(([symbol, p]) => ({
      symbol,
      instrument: "equity",
      quantity: p.quantity,
      avgEntryPrice: p.avgEntryPrice,
      marketValue: p.quantity * this.price(symbol),
      unrealizedPl: p.quantity * (this.price(symbol) - p.avgEntryPrice),
    }));
  }

  async submitOrder(accountId: string, req: OrderRequest): Promise<BrokerOrder> {
    const a = this.account(accountId);
    const existing = a.orders.find((o) => o.clientOrderId === req.clientOrderId);
    if (existing) return existing;
    const price = this.price(req.symbol);
    const fillsNow = req.type === "market" || (req.type === "limit" && req.limitPrice !== undefined && (req.side === "buy" ? price <= req.limitPrice : price >= req.limitPrice));
    const order: BrokerOrder = {
      brokerOrderId: this.nextId("ord"),
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      type: req.type,
      status: fillsNow ? "filled" : "new",
      filledQuantity: fillsNow ? req.quantity : 0,
      filledAvgPrice: fillsNow ? price : null,
      submittedAt: this.now().toISOString(),
    };
    a.orders.push(order);
    if (fillsNow) this.applyFill(a, order, price);
    return order;
  }

  private applyFill(a: FakeAccount, order: BrokerOrder, price: number) {
    const signed = order.side === "buy" ? order.quantity : -order.quantity;
    a.cash -= signed * price;
    const pos = a.positions.get(order.symbol) ?? { quantity: 0, avgEntryPrice: 0 };
    const qty = pos.quantity + signed;
    if (qty === 0) a.positions.delete(order.symbol);
    else a.positions.set(order.symbol, { quantity: qty, avgEntryPrice: signed > 0 ? (pos.quantity * pos.avgEntryPrice + signed * price) / qty : pos.avgEntryPrice });
    a.fills.push({
      brokerFillId: this.nextId("fill"),
      brokerOrderId: order.brokerOrderId,
      symbol: order.symbol,
      side: order.side,
      price,
      quantity: order.quantity,
      filledAt: this.now().toISOString(),
    });
  }

  async cancelOrder(accountId: string, brokerOrderId: string) {
    const order = this.account(accountId).orders.find((o) => o.brokerOrderId === brokerOrderId);
    if (order && order.status === "new") order.status = "canceled";
  }

  async getOrders(accountId: string, opts: { status?: "open" | "closed" | "all" } = {}) {
    const orders = this.account(accountId).orders;
    if (opts.status === "open") return orders.filter((o) => o.status === "new");
    if (opts.status === "closed") return orders.filter((o) => o.status !== "new");
    return [...orders];
  }

  async getFills(accountId: string, opts: { after?: string } = {}) {
    const fills = this.account(accountId).fills;
    return opts.after ? fills.filter((f) => f.filledAt > opts.after!) : [...fills];
  }

  async getClock(): Promise<MarketClock> {
    const t = this.now().toISOString();
    return { timestamp: t, isOpen: this.marketOpen, nextOpen: t, nextClose: t };
  }

  async getLatestQuotes(symbols: string[]): Promise<Quote[]> {
    const time = this.now().toISOString();
    return symbols.map((symbol) => {
      const p = this.price(symbol);
      return { symbol, bid: p, ask: p, time, source: "IEX real-time" };
    });
  }

  async getBars(symbol: string, timeframe: BarTimeframe, opts: { start: string; end?: string; delayed?: boolean }): Promise<BarSeries> {
    const p = this.price(symbol);
    return {
      symbol,
      timeframe,
      source: opts.delayed ? "SIP 15-min delayed" : "IEX real-time",
      bars: [{ time: opts.start, open: p, high: p, low: p, close: p, volume: 0 }],
    };
  }

  async getOptionChain(underlying: string): Promise<OptionChain> {
    return { underlying, source: "Options indicative", contracts: [] };
  }
}
