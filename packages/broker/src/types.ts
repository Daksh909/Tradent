// One interface for every broker (Decision 5). The MVP ships the Alpaca
// Broker API sandbox implementation; later brokers are new implementations.
import type { InstrumentType } from "@tradent/core";

/** Every quote shown to users carries its source (CLAUDE.md hard rule 11). */
export type DataSource = "IEX real-time" | "SIP 15-min delayed" | "Options indicative";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export interface OrderRequest {
  symbol: string;
  instrument: InstrumentType;
  side: OrderSide;
  /** Shares, or contracts for options. */
  quantity: number;
  type: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  /** Our order id, so a retried submit can't create a duplicate. */
  clientOrderId: string;
}

export interface BrokerOrder {
  brokerOrderId: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  type: OrderType;
  status: string;
  filledQuantity: number;
  filledAvgPrice: number | null;
  submittedAt: string;
}

export interface BrokerFill {
  brokerFillId: string;
  brokerOrderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  filledAt: string;
}

export interface AccountSummary {
  cash: number;
  equity: number;
  buyingPower: number;
  /** Equity at the previous close, for the daily loss stop. */
  lastEquity: number;
}

export interface Position {
  symbol: string;
  instrument: InstrumentType;
  quantity: number;
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPl: number;
}

export interface MarketClock {
  timestamp: string;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  time: string;
  source: DataSource;
}

export type BarTimeframe = "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";

export interface Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarSeries {
  symbol: string;
  timeframe: BarTimeframe;
  source: DataSource;
  bars: Bar[];
}

export interface OptionContractSnapshot {
  contractSymbol: string;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  impliedVolatility: number | null;
  delta: number | null;
}

export interface OptionChain {
  underlying: string;
  source: DataSource;
  contracts: OptionContractSnapshot[];
}

export interface BrokerAdapter {
  /** Create and fund one paper account (one per agent version, Decision 10). */
  createPaperAccount(opts: { label: string; startingCash: number }): Promise<{ externalAccountId: string }>;
  getAccount(accountId: string): Promise<AccountSummary>;
  getPositions(accountId: string): Promise<Position[]>;
  submitOrder(accountId: string, order: OrderRequest): Promise<BrokerOrder>;
  cancelOrder(accountId: string, brokerOrderId: string): Promise<void>;
  getOrders(accountId: string, opts?: { status?: "open" | "closed" | "all" }): Promise<BrokerOrder[]>;
  /** Fills as reported by the broker; the only source of fills (CLAUDE.md hard rule 4). */
  getFills(accountId: string, opts?: { after?: string }): Promise<BrokerFill[]>;
  getClock(): Promise<MarketClock>;
  getLatestQuotes(symbols: string[]): Promise<Quote[]>;
  getBars(symbol: string, timeframe: BarTimeframe, opts: { start: string; end?: string; delayed?: boolean }): Promise<BarSeries>;
  getOptionChain(underlying: string): Promise<OptionChain>;
}
