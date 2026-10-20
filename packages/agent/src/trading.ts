// Reads for the Trading page: one agent version's paper account at a time.
// Everyone may watch a Library-listed version; developers may also watch their own.
import { and, desc, eq, isNotNull } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { decisionColumns, toLoggedDecision, type LoggedDecision } from "./forward-tests";
import { listLibraryAgents, publicVersions, withRecords, type PublicVersion } from "./library";

export interface TradingAgentOption {
  versionId: string;
  label: string;
  own: boolean;
}

/** Versions a user may open on the Trading page: their own forward tests first, then listed agents. */
export async function tradingAgentOptions(db: Db, userId: string): Promise<TradingAgentOption[]> {
  const own = await publicVersions(db)
    .where(and(eq(s.agents.ownerId, userId), isNotNull(s.agentVersions.lockedAt)))
    .orderBy(desc(s.agentVersions.lockedAt));
  const listed = await listLibraryAgents(db);
  const seen = new Set<string>();
  const options: TradingAgentOption[] = [];
  for (const v of own) {
    seen.add(v.versionId);
    options.push({ versionId: v.versionId, label: `${v.agentName} v${v.version}`, own: true });
  }
  for (const v of listed) if (!seen.has(v.versionId)) options.push({ versionId: v.versionId, label: `${v.agentName} v${v.version}`, own: false });
  return options;
}

export interface TradingFill {
  fillId: string;
  filledAt: Date;
  symbol: string;
  instrument: "equity" | "option";
  side: "buy" | "sell";
  quantity: number;
  price: number;
  decisionId: string;
}

export interface TradingOrder {
  id: string;
  createdAt: Date;
  symbol: string;
  instrument: "equity" | "option";
  side: "buy" | "sell";
  type: string;
  quantity: number;
  limitPrice: number | null;
  brokerStatus: string | null;
  decisionId: string;
}

/** Decision-feed entries; tokens and cost are blanked for anyone but the developer. */
export type FeedDecision = Omit<LoggedDecision, "inputTokens" | "outputTokens" | "costUsd"> & { costUsd: number | null };

export interface TradingData {
  version: PublicVersion;
  own: boolean;
  /** Broker account id, for server-side broker calls only. */
  externalAccountId: string | null;
  symbols: string[];
  fills: TradingFill[];
  orders: TradingOrder[];
  decisions: FeedDecision[];
}

export async function getTradingData(db: Db, userId: string, versionId: string): Promise<TradingData | null> {
  const option = (await tradingAgentOptions(db, userId)).find((o) => o.versionId === versionId);
  if (!option) return null;
  const [version] = await withRecords(db, await publicVersions(db).where(eq(s.agentVersions.id, versionId)));
  if (!version) return null;
  const [account] = await db.select({ id: s.paperAccounts.id, externalAccountId: s.paperAccounts.externalAccountId }).from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, versionId));

  const orderRows = account
    ? await db
        .select({
          id: s.orders.id,
          createdAt: s.orders.createdAt,
          symbol: s.orders.symbol,
          instrument: s.orders.instrument,
          side: s.orders.side,
          type: s.orders.type,
          quantity: s.orders.quantity,
          limitPrice: s.orders.limitPrice,
          brokerStatus: s.orders.brokerStatus,
          decisionId: s.orders.decisionId,
        })
        .from(s.orders)
        .where(eq(s.orders.paperAccountId, account.id))
        .orderBy(desc(s.orders.createdAt))
        .limit(200)
    : [];
  const fillRows = account
    ? await db
        .select({
          fillId: s.fills.id,
          filledAt: s.fills.filledAt,
          symbol: s.orders.symbol,
          instrument: s.orders.instrument,
          side: s.orders.side,
          quantity: s.fills.quantity,
          price: s.fills.price,
          decisionId: s.orders.decisionId,
        })
        .from(s.fills)
        .innerJoin(s.orders, eq(s.fills.orderId, s.orders.id))
        .where(eq(s.orders.paperAccountId, account.id))
        .orderBy(desc(s.fills.filledAt))
        .limit(500)
    : [];
  const decisionRows = await db.select(decisionColumns).from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, versionId)).orderBy(desc(s.decisionLogs.seq)).limit(50);

  const fills = fillRows.map((f) => ({ ...f, quantity: Number(f.quantity), price: Number(f.price) }));
  const symbols = [...new Set([...version.riskLimits.allowedSymbols, ...fills.filter((f) => f.instrument === "equity").map((f) => f.symbol)])];
  return {
    version,
    own: option.own,
    externalAccountId: account?.externalAccountId ?? null,
    // DEFAULT: the watchlist is the agent's allowed symbols plus every stock it has traded; SPY when there are none.
    symbols: symbols.length ? symbols : ["SPY"],
    fills,
    orders: orderRows.map((o) => ({ ...o, quantity: Number(o.quantity), limitPrice: o.limitPrice === null ? null : Number(o.limitPrice) })),
    decisions: decisionRows.map(toLoggedDecision).map(({ inputTokens: _i, outputTokens: _o, costUsd, ...d }) => ({ ...d, costUsd: option.own ? costUsd : null })),
  };
}
