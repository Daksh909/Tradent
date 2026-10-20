// Investor-facing reads: the Library and Agent detail. Prompts are private
// (CLAUDE.md hard rule 6), so nothing here selects agent_versions.instructions;
// every query lists its columns explicitly.
import { LISTING_MIN_TRADES, LISTING_MIN_TRADING_DAYS, YOUNG_RECORD_TRADING_DAYS, type AgentModel, type RiskLimits } from "@tradent/core";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";

export interface ListingStatus {
  listed: boolean;
  youngRecord: boolean;
}

/** Listed after 30 trading days and 20 trades; "Young record" under 90 trading days. */
export function listingStatus(tradingDays: number, trades: number): ListingStatus {
  return {
    listed: tradingDays >= LISTING_MIN_TRADING_DAYS && trades >= LISTING_MIN_TRADES,
    youngRecord: tradingDays < YOUNG_RECORD_TRADING_DAYS,
  };
}

/** The public parts of an agent version and its forward-test record. */
export interface PublicVersion extends ListingStatus {
  versionId: string;
  agentId: string;
  agentName: string;
  publicSummary: string;
  ownerName: string;
  version: number;
  model: AgentModel;
  cadenceMinutes: number;
  riskLimits: RiskLimits;
  tools: string[];
  dataSources: string[];
  parentVersionIds: string[];
  killed: boolean;
  lockedAt: Date | null;
  startingCash: number;
  tradingDays: number;
  trades: number;
  equity: number | null;
  totalReturn: number | null;
  maxDrawdown: number | null;
  instruments: ("equity" | "option")[];
}

// The only agent_versions columns investor-facing code may read.
const publicVersionColumns = {
  versionId: s.agentVersions.id,
  agentId: s.agents.id,
  agentName: s.agents.name,
  publicSummary: s.agents.publicSummary,
  ownerName: s.users.displayName,
  version: s.agentVersions.version,
  model: s.agentVersions.model,
  cadenceMinutes: s.agentVersions.cadenceMinutes,
  riskLimits: s.agentVersions.riskLimits,
  tools: s.agentVersions.tools,
  dataSources: s.agentVersions.dataSources,
  parentVersionIds: s.agentVersions.parentVersionIds,
  killed: s.agents.killed,
  lockedAt: s.agentVersions.lockedAt,
  startingCash: s.paperAccounts.startingCash,
};

async function withRecords(db: Db, rows: (Omit<PublicVersion, keyof ListingStatus | "tradingDays" | "trades" | "equity" | "totalReturn" | "maxDrawdown" | "instruments" | "startingCash"> & { startingCash: string })[]): Promise<PublicVersion[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.versionId);

  const metrics = await db
    .select({
      versionId: s.dailyMetrics.agentVersionId,
      days: sql<number>`count(*)::int`,
      maxDrawdown: sql<string>`max(${s.dailyMetrics.maxDrawdown})`,
      equity: sql<string>`(array_agg(${s.dailyMetrics.equity} order by ${s.dailyMetrics.date} desc))[1]`,
    })
    .from(s.dailyMetrics)
    .where(inArray(s.dailyMetrics.agentVersionId, ids))
    .groupBy(s.dailyMetrics.agentVersionId);

  const trades = await db
    .select({
      versionId: s.paperAccounts.agentVersionId,
      trades: sql<number>`count(${s.fills.id})::int`,
      instruments: sql<("equity" | "option")[]>`coalesce(array_agg(distinct ${s.orders.instrument}::text) filter (where ${s.fills.id} is not null), '{}')`,
    })
    .from(s.paperAccounts)
    .innerJoin(s.orders, eq(s.orders.paperAccountId, s.paperAccounts.id))
    .leftJoin(s.fills, eq(s.fills.orderId, s.orders.id))
    .where(inArray(s.paperAccounts.agentVersionId, ids))
    .groupBy(s.paperAccounts.agentVersionId);

  const m = new Map(metrics.map((x) => [x.versionId, x]));
  const t = new Map(trades.map((x) => [x.versionId, x]));
  return rows.map((r) => {
    const mm = m.get(r.versionId);
    const tt = t.get(r.versionId);
    const startingCash = Number(r.startingCash);
    const tradingDays = mm?.days ?? 0;
    const tradeCount = tt?.trades ?? 0;
    const equity = mm ? Number(mm.equity) : null;
    return {
      ...r,
      startingCash,
      tradingDays,
      trades: tradeCount,
      equity,
      totalReturn: equity === null || startingCash <= 0 ? null : equity / startingCash - 1,
      maxDrawdown: mm ? Number(mm.maxDrawdown) : null,
      instruments: tt?.instruments ?? [],
      ...listingStatus(tradingDays, tradeCount),
    };
  });
}

function publicVersions(db: Db) {
  return db
    .select(publicVersionColumns)
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .innerJoin(s.users, eq(s.agents.ownerId, s.users.id))
    .innerJoin(s.paperAccounts, eq(s.paperAccounts.agentVersionId, s.agentVersions.id));
}

export interface LibraryFilters {
  model?: AgentModel;
  cadenceMinutes?: number;
  instrument?: "equity" | "option";
}

/**
 * Agents in the Library: per agent, its newest version that meets the listing
 * rule. DEFAULT: killed agents are left out of the Library.
 */
export async function listLibraryAgents(db: Db, filters: LibraryFilters = {}): Promise<PublicVersion[]> {
  const rows = await publicVersions(db)
    .where(and(isNotNull(s.agentVersions.lockedAt), inArray(s.agents.status, ["forward_testing", "listed"]), eq(s.agents.killed, false)))
    .orderBy(asc(s.agents.id), desc(s.agentVersions.version));
  const listed = (await withRecords(db, rows)).filter((v) => v.listed);

  const newestPerAgent = new Map<string, PublicVersion>();
  for (const v of listed) if (!newestPerAgent.has(v.agentId)) newestPerAgent.set(v.agentId, v);
  return [...newestPerAgent.values()]
    .filter((v) => !filters.model || v.model === filters.model)
    .filter((v) => !filters.cadenceMinutes || v.cadenceMinutes === filters.cadenceMinutes)
    .filter((v) => !filters.instrument || v.instruments.includes(filters.instrument))
    .sort((a, b) => (b.totalReturn ?? -Infinity) - (a.totalReturn ?? -Infinity));
}

export interface PublicTrade {
  fillId: string;
  filledAt: Date;
  symbol: string;
  instrument: "equity" | "option";
  side: "buy" | "sell";
  quantity: number;
  price: number;
  decisionId: string;
  decidedAt: Date;
  reasoning: string | null;
}

export interface PublicStrategyRef {
  strategyId: string;
  name: string;
  type: string;
  publicDescription: string;
  version: number;
}

export interface AgentDetail {
  agentId: string;
  name: string;
  publicSummary: string;
  ownerName: string;
  status: string;
  killed: boolean;
  versions: PublicVersion[];
  selected: PublicVersion | null;
  equityCurve: { date: string; equity: number; dailyReturn: number }[];
  trades: PublicTrade[];
  strategies: PublicStrategyRef[];
  parents: { versionId: string; agentId: string; agentName: string; version: number }[];
}

/** Everything an investor may see about one agent; the selected version defaults to the newest locked one. */
export async function getAgentDetail(db: Db, agentId: string, versionId?: string): Promise<AgentDetail | null> {
  const [agent] = await db
    .select({ id: s.agents.id, name: s.agents.name, publicSummary: s.agents.publicSummary, status: s.agents.status, killed: s.agents.killed, ownerName: s.users.displayName })
    .from(s.agents)
    .innerJoin(s.users, eq(s.agents.ownerId, s.users.id))
    .where(eq(s.agents.id, agentId));
  if (!agent) return null;

  const rows = await publicVersions(db).where(eq(s.agents.id, agentId)).orderBy(desc(s.agentVersions.version));
  const versions = await withRecords(db, rows);
  const selected = versions.find((v) => v.versionId === versionId) ?? versions.find((v) => v.lockedAt) ?? versions[0] ?? null;

  const base: AgentDetail = {
    agentId: agent.id,
    name: agent.name,
    publicSummary: agent.publicSummary,
    ownerName: agent.ownerName,
    status: agent.status,
    killed: agent.killed,
    versions,
    selected,
    equityCurve: [],
    trades: [],
    strategies: [],
    parents: [],
  };
  if (!selected) return base;

  const curve = await db
    .select({ date: s.dailyMetrics.date, equity: s.dailyMetrics.equity, dailyReturn: s.dailyMetrics.dailyReturn })
    .from(s.dailyMetrics)
    .where(eq(s.dailyMetrics.agentVersionId, selected.versionId))
    .orderBy(asc(s.dailyMetrics.date));

  const trades = await db
    .select({
      fillId: s.fills.id,
      filledAt: s.fills.filledAt,
      symbol: s.orders.symbol,
      instrument: s.orders.instrument,
      side: s.orders.side,
      quantity: s.fills.quantity,
      price: s.fills.price,
      decisionId: s.decisionLogs.id,
      decidedAt: s.decisionLogs.decidedAt,
      reasoning: sql<string | null>`${s.decisionLogs.output} ->> 'reasoning'`,
    })
    .from(s.fills)
    .innerJoin(s.orders, eq(s.fills.orderId, s.orders.id))
    .innerJoin(s.decisionLogs, eq(s.orders.decisionId, s.decisionLogs.id))
    .where(eq(s.decisionLogs.agentVersionId, selected.versionId))
    .orderBy(desc(s.fills.filledAt));

  const strategies = await db
    .select({ strategyId: s.strategies.id, name: s.strategies.name, type: s.strategies.type, publicDescription: s.strategies.publicDescription, version: s.strategyVersions.version })
    .from(s.agentVersionStrategies)
    .innerJoin(s.strategyVersions, eq(s.agentVersionStrategies.strategyVersionId, s.strategyVersions.id))
    .innerJoin(s.strategies, eq(s.strategyVersions.strategyId, s.strategies.id))
    .where(eq(s.agentVersionStrategies.agentVersionId, selected.versionId))
    .orderBy(asc(s.strategies.name));

  const parents = selected.parentVersionIds.length
    ? await db
        .select({ versionId: s.agentVersions.id, agentId: s.agents.id, agentName: s.agents.name, version: s.agentVersions.version })
        .from(s.agentVersions)
        .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
        .where(inArray(s.agentVersions.id, selected.parentVersionIds))
    : [];

  return {
    ...base,
    equityCurve: curve.map((c) => ({ date: c.date, equity: Number(c.equity), dailyReturn: Number(c.dailyReturn) })),
    trades: trades.map((t) => ({ ...t, quantity: Number(t.quantity), price: Number(t.price) })),
    strategies,
    parents,
  };
}

export interface LibraryStrategy {
  strategyId: string;
  name: string;
  type: string;
  publicDescription: string;
  ownerName: string;
  latestVersion: number;
  /** Listed agents whose shown version uses any version of this strategy. */
  listedAgents: { agentId: string; agentName: string }[];
}

export async function listLibraryStrategies(db: Db): Promise<LibraryStrategy[]> {
  const strategies = await db
    .select({
      strategyId: s.strategies.id,
      name: s.strategies.name,
      type: s.strategies.type,
      publicDescription: s.strategies.publicDescription,
      ownerName: s.users.displayName,
      latestVersion: sql<number>`coalesce(max(${s.strategyVersions.version}), 0)::int`,
    })
    .from(s.strategies)
    .innerJoin(s.users, eq(s.strategies.ownerId, s.users.id))
    .leftJoin(s.strategyVersions, eq(s.strategyVersions.strategyId, s.strategies.id))
    .groupBy(s.strategies.id, s.users.displayName)
    .orderBy(asc(s.strategies.name));

  const listed = await listLibraryAgents(db);
  const uses = listed.length
    ? await db
        .select({ versionId: s.agentVersionStrategies.agentVersionId, strategyId: s.strategyVersions.strategyId })
        .from(s.agentVersionStrategies)
        .innerJoin(s.strategyVersions, eq(s.agentVersionStrategies.strategyVersionId, s.strategyVersions.id))
        .where(inArray(s.agentVersionStrategies.agentVersionId, listed.map((v) => v.versionId)))
    : [];
  const byVersion = new Map(listed.map((v) => [v.versionId, v]));

  return strategies.map((st) => ({
    ...st,
    listedAgents: uses
      .filter((u) => u.strategyId === st.strategyId)
      .map((u) => byVersion.get(u.versionId)!)
      .map((v) => ({ agentId: v.agentId, agentName: v.agentName })),
  }));
}

/** Marks forward-testing agents as listed once any of their versions meets the listing rule. */
export async function updateListingStatus(db: Db): Promise<number> {
  const rows = await publicVersions(db).where(and(isNotNull(s.agentVersions.lockedAt), eq(s.agents.status, "forward_testing")));
  const agentIds = [...new Set((await withRecords(db, rows)).filter((v) => v.listed).map((v) => v.agentId))];
  if (agentIds.length === 0) return 0;
  const updated = await db.update(s.agents).set({ status: "listed" }).where(and(inArray(s.agents.id, agentIds), eq(s.agents.status, "forward_testing"))).returning({ id: s.agents.id });
  return updated.length;
}
