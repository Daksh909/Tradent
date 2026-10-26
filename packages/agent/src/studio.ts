// Studio: drafts, versions, forks and combinations, the smoke test, and
// starting a forward test. Every function here acts for one developer and
// checks they own what they touch.
import { AGENT_MODELS, DEFAULT_STARTING_CASH_USD, clampRiskLimits, type AgentModel, type RiskLimits } from "@tradent/core";
import { FakeBroker, type BrokerAdapter } from "@tradent/broker";
import { and, asc, desc, eq, inArray, sql } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { listLibraryAgents } from "./library";
import { DATA_TOOLS, PROPOSE_TOOL, addSpend, decide, spendCapReached, type MessagesClient } from "./runner";

export type StrategyType = (typeof s.strategyType.enumValues)[number];

export interface DraftStrategy {
  /** Set for an existing strategy version; unset for one drafted in Studio, created on save. */
  strategyVersionId?: string;
  name: string;
  type: StrategyType;
  description: string;
  /** The agent version this block was taken from, for lineage. */
  fromVersionId?: string;
}

/** What the Studio edits. Saving turns it into an agent version. */
export interface Draft {
  agentId?: string;
  /** The version this draft was opened from or last saved as. */
  baseVersionId?: string;
  name: string;
  publicSummary: string;
  /** Private to the developer (CLAUDE.md hard rule 6). */
  instructions: string;
  model: AgentModel;
  cadenceMinutes: number;
  symbols: string[];
  tools: string[];
  tradingViewAlerts: boolean;
  maxPositionPct: number;
  maxDailyLossPct: number;
  strategies: DraftStrategy[];
  parentVersionIds: string[];
}

// DEFAULT: a new draft decides hourly on Sonnet (free Gemini Flash when Claude isn't set up)
// with the platform's limits and every data tool.
export function emptyDraft(model: AgentModel = "sonnet"): Draft {
  const limits = clampRiskLimits({});
  return {
    name: "",
    publicSummary: "",
    instructions: "",
    model,
    cadenceMinutes: 60,
    symbols: [],
    tools: [...DATA_TOOLS],
    tradingViewAlerts: false,
    maxPositionPct: limits.maxPositionPct,
    maxDailyLossPct: limits.maxDailyLossPct,
    strategies: [],
    parentVersionIds: [],
  };
}

// DEFAULT: cadence choices offered in Studio, in minutes.
export const CADENCES = [5, 15, 30, 60, 120, 390, 1440] as const;

export class StudioError extends Error {}

const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

/** Validates and normalizes a draft; throws a StudioError naming the first problem. */
export function normalizeDraft(d: Draft): Draft & { riskLimits: RiskLimits } {
  const name = d.name.trim();
  if (!name) throw new StudioError("Give the agent a name.");
  if (name.length > 80) throw new StudioError("Keep the name under 80 characters.");
  if (!d.publicSummary.trim()) throw new StudioError("Write a public summary; investors see it in the Library.");
  if (!d.instructions.trim()) throw new StudioError("Write the agent's instructions.");
  if (!AGENT_MODELS.includes(d.model)) throw new StudioError("Pick Haiku, Sonnet or Opus.");
  if (!(CADENCES as readonly number[]).includes(d.cadenceMinutes)) throw new StudioError("Pick one of the offered cadences.");
  const symbols = [...new Set(d.symbols.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  const bad = symbols.find((x) => !SYMBOL.test(x));
  if (bad) throw new StudioError(`"${bad}" isn't a valid US ticker.`);
  const tools = [...new Set(d.tools.filter((t) => (DATA_TOOLS as readonly string[]).includes(t)))];
  // Developers may tighten the platform limits, never loosen them (hard rule 8).
  const riskLimits = clampRiskLimits({ maxPositionPct: d.maxPositionPct, maxDailyLossPct: d.maxDailyLossPct, allowedSymbols: symbols });
  if (!(riskLimits.maxPositionPct > 0) || !(riskLimits.maxDailyLossPct > 0)) throw new StudioError("Risk limits must be above 0%.");
  return { ...d, name, publicSummary: d.publicSummary.trim(), symbols, tools, riskLimits, maxPositionPct: riskLimits.maxPositionPct, maxDailyLossPct: riskLimits.maxDailyLossPct };
}

export interface StudioAgent {
  agentId: string;
  name: string;
  status: string;
  killed: boolean;
  versions: { versionId: string; version: number; lockedAt: Date | null; createdAt: Date; model: AgentModel; parentVersionIds: string[] }[];
}

/** The developer's agents with their version history, newest first. */
export async function listStudioAgents(db: Db, ownerId: string): Promise<StudioAgent[]> {
  const agents = await db.select({ agentId: s.agents.id, name: s.agents.name, status: s.agents.status, killed: s.agents.killed }).from(s.agents).where(eq(s.agents.ownerId, ownerId)).orderBy(desc(s.agents.createdAt));
  if (agents.length === 0) return [];
  const versions = await db
    .select({ agentId: s.agentVersions.agentId, versionId: s.agentVersions.id, version: s.agentVersions.version, lockedAt: s.agentVersions.lockedAt, createdAt: s.agentVersions.createdAt, model: s.agentVersions.model, parentVersionIds: s.agentVersions.parentVersionIds })
    .from(s.agentVersions)
    .where(inArray(s.agentVersions.agentId, agents.map((a) => a.agentId)))
    .orderBy(desc(s.agentVersions.version));
  return agents.map((a) => ({ ...a, versions: versions.filter((v) => v.agentId === a.agentId).map(({ agentId: _a, ...v }) => v) }));
}

async function strategiesOf(db: Db, versionId: string): Promise<DraftStrategy[]> {
  const rows = await db
    .select({ strategyVersionId: s.strategyVersions.id, name: s.strategies.name, type: s.strategies.type, description: s.strategies.publicDescription })
    .from(s.agentVersionStrategies)
    .innerJoin(s.strategyVersions, eq(s.agentVersionStrategies.strategyVersionId, s.strategyVersions.id))
    .innerJoin(s.strategies, eq(s.strategyVersions.strategyId, s.strategies.id))
    .where(eq(s.agentVersionStrategies.agentVersionId, versionId))
    .orderBy(asc(s.strategies.name));
  return rows;
}

/** One of the developer's own versions as an editable draft, instructions included. */
export async function loadDraft(db: Db, ownerId: string, versionId: string): Promise<Draft | null> {
  const [v] = await db
    .select({
      agentId: s.agents.id,
      name: s.agents.name,
      publicSummary: s.agents.publicSummary,
      instructions: s.agentVersions.instructions,
      model: s.agentVersions.model,
      cadenceMinutes: s.agentVersions.cadenceMinutes,
      riskLimits: s.agentVersions.riskLimits,
      tools: s.agentVersions.tools,
      dataSources: s.agentVersions.dataSources,
      parentVersionIds: s.agentVersions.parentVersionIds,
    })
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .where(and(eq(s.agentVersions.id, versionId), eq(s.agents.ownerId, ownerId)));
  if (!v) return null;
  return {
    agentId: v.agentId,
    baseVersionId: versionId,
    name: v.name,
    publicSummary: v.publicSummary,
    instructions: v.instructions,
    model: v.model,
    cadenceMinutes: v.cadenceMinutes,
    symbols: v.riskLimits.allowedSymbols,
    tools: v.tools.filter((t) => t !== PROPOSE_TOOL),
    tradingViewAlerts: v.dataSources.includes("TradingView alerts"),
    maxPositionPct: v.riskLimits.maxPositionPct,
    maxDailyLossPct: v.riskLimits.maxDailyLossPct,
    strategies: await strategiesOf(db, versionId),
    parentVersionIds: v.parentVersionIds,
  };
}

/** The public parts of a version another developer may build on: listed versions, or the caller's own. */
export async function publicBlocks(db: Db, userId: string, versionId: string) {
  const listed = (await listLibraryAgents(db)).find((v) => v.versionId === versionId);
  const [own] = listed
    ? []
    : await db
        .select({ id: s.agentVersions.id })
        .from(s.agentVersions)
        .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
        .where(and(eq(s.agentVersions.id, versionId), eq(s.agents.ownerId, userId)));
  if (!listed && !own) return null;
  const [v] = await db
    .select({ name: s.agents.name, version: s.agentVersions.version, publicSummary: s.agents.publicSummary, model: s.agentVersions.model, cadenceMinutes: s.agentVersions.cadenceMinutes, riskLimits: s.agentVersions.riskLimits, tools: s.agentVersions.tools, dataSources: s.agentVersions.dataSources })
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .where(eq(s.agentVersions.id, versionId));
  const strategies = (await strategiesOf(db, versionId)).map((st) => ({ ...st, fromVersionId: versionId }));
  return { versionId, ...v!, tools: v!.tools.filter((t) => t !== PROPOSE_TOOL), strategies };
}

/**
 * A new draft from another agent's public parts. Its prompt stays private, so
 * the instructions start empty.
 */
export async function forkDraft(db: Db, userId: string, versionId: string): Promise<Draft | null> {
  const b = await publicBlocks(db, userId, versionId);
  if (!b) return null;
  return {
    ...emptyDraft(),
    name: `${b.name} fork`,
    publicSummary: b.publicSummary,
    model: b.model,
    cadenceMinutes: b.cadenceMinutes,
    symbols: b.riskLimits.allowedSymbols,
    tools: b.tools,
    tradingViewAlerts: b.dataSources.includes("TradingView alerts"),
    maxPositionPct: b.riskLimits.maxPositionPct,
    maxDailyLossPct: b.riskLimits.maxDailyLossPct,
    strategies: b.strategies,
    parentVersionIds: [versionId],
  };
}

/**
 * Saves a draft. An unlocked version is updated in place; a locked one is never
 * changed (hard rule 5), so editing it creates the next version with it as parent.
 */
export async function saveDraft(db: Db, ownerId: string, input: Draft): Promise<{ agentId: string; versionId: string; version: number }> {
  const d = normalizeDraft(input);
  // Every strategy block taken from another version adds that version to the lineage.
  const parents = new Set(d.parentVersionIds);
  for (const st of d.strategies) if (st.fromVersionId) parents.add(st.fromVersionId);

  return db.transaction(async (tx) => {
    let agentId = d.agentId;
    if (agentId) {
      const [agent] = await tx.select().from(s.agents).where(and(eq(s.agents.id, agentId), eq(s.agents.ownerId, ownerId)));
      if (!agent) throw new StudioError("That agent isn't yours.");
      // DEFAULT: name and public summary can change until the agent's first forward test.
      if (agent.status === "draft") await tx.update(s.agents).set({ name: d.name, publicSummary: d.publicSummary }).where(eq(s.agents.id, agentId));
    } else {
      const [agent] = await tx.insert(s.agents).values({ ownerId, name: d.name, publicSummary: d.publicSummary }).returning();
      agentId = agent!.id;
    }

    const strategyVersionIds: string[] = [];
    for (const st of d.strategies) {
      if (st.strategyVersionId) {
        strategyVersionIds.push(st.strategyVersionId);
        continue;
      }
      const [strategy] = await tx.insert(s.strategies).values({ ownerId, name: st.name.trim() || "Untitled strategy", publicDescription: st.description.trim(), type: st.type }).returning();
      const [sv] = await tx.insert(s.strategyVersions).values({ strategyId: strategy!.id, version: 1 }).returning();
      strategyVersionIds.push(sv!.id);
    }
    if (strategyVersionIds.length) {
      const found = await tx.select({ id: s.strategyVersions.id }).from(s.strategyVersions).where(inArray(s.strategyVersions.id, strategyVersionIds));
      if (found.length !== new Set(strategyVersionIds).size) throw new StudioError("A strategy block no longer exists.");
    }

    const values = {
      instructions: d.instructions,
      tools: [...d.tools, PROPOSE_TOOL],
      dataSources: ["IEX real-time", ...(d.tradingViewAlerts ? ["TradingView alerts"] : [])],
      riskLimits: d.riskLimits,
      model: d.model,
      cadenceMinutes: d.cadenceMinutes,
    };

    const [base] = d.baseVersionId
      ? await tx.select().from(s.agentVersions).where(and(eq(s.agentVersions.id, d.baseVersionId), eq(s.agentVersions.agentId, agentId)))
      : [];
    let versionId: string;
    let version: number;
    if (base && !base.lockedAt) {
      await tx.update(s.agentVersions).set({ ...values, parentVersionIds: [...parents] }).where(eq(s.agentVersions.id, base.id));
      await tx.delete(s.agentVersionStrategies).where(eq(s.agentVersionStrategies.agentVersionId, base.id));
      versionId = base.id;
      version = base.version;
    } else {
      if (base) parents.add(base.id);
      const [{ next }] = (await tx
        .select({ next: sql<number>`coalesce(max(${s.agentVersions.version}), 0)::int + 1` })
        .from(s.agentVersions)
        .where(eq(s.agentVersions.agentId, agentId))) as [{ next: number }];
      const [row] = await tx.insert(s.agentVersions).values({ agentId, version: next, ...values, parentVersionIds: [...parents] }).returning();
      versionId = row!.id;
      version = next;
    }
    if (strategyVersionIds.length)
      await tx.insert(s.agentVersionStrategies).values([...new Set(strategyVersionIds)].map((strategyVersionId) => ({ agentVersionId: versionId, strategyVersionId })));
    return { agentId, versionId, version };
  });
}

async function ownedVersion(db: Db, ownerId: string, versionId: string) {
  const [row] = await db
    .select({ version: s.agentVersions, agent: s.agents })
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .where(and(eq(s.agentVersions.id, versionId), eq(s.agents.ownerId, ownerId)));
  if (!row) throw new StudioError("That version isn't yours.");
  return row;
}

/**
 * Locks a version, creates and funds its own paper account at the broker, and
 * moves the agent to forward testing. The version can't change after this.
 */
export async function startForwardTest(db: Db, broker: BrokerAdapter, ownerId: string, versionId: string, now = new Date()) {
  const { version, agent } = await ownedVersion(db, ownerId, versionId);
  if (version.lockedAt) throw new StudioError("This version's forward test has already started.");
  if (agent.killed) throw new StudioError("This agent is stopped. Restart it on its forward test page first.");
  const { externalAccountId } = await broker.createPaperAccount({ label: `${agent.name} v${version.version}`, startingCash: DEFAULT_STARTING_CASH_USD });
  await db.transaction(async (tx) => {
    await tx.update(s.agentVersions).set({ lockedAt: now }).where(eq(s.agentVersions.id, versionId));
    await tx.insert(s.paperAccounts).values({ agentVersionId: versionId, externalAccountId, startingCash: String(DEFAULT_STARTING_CASH_USD) });
    if (agent.status === "draft" || agent.status === "retired") await tx.update(s.agents).set({ status: "forward_testing" }).where(eq(s.agents.id, agent.id));
  });
  return { externalAccountId };
}

/** Market data from the real broker; the account is a fresh in-memory one, so nothing is ever sent. */
export function smokeTestBroker(market: BrokerAdapter, scratch = new FakeBroker()): BrokerAdapter {
  return {
    createPaperAccount: (o) => scratch.createPaperAccount(o),
    getAccount: (id) => scratch.getAccount(id),
    getPositions: (id) => scratch.getPositions(id),
    submitOrder: () => Promise.reject(new Error("Smoke tests never send orders")),
    cancelOrder: () => Promise.reject(new Error("Smoke tests never send orders")),
    getOrders: (id, o) => scratch.getOrders(id, o),
    getFills: (id, o) => scratch.getFills(id, o),
    getClock: () => market.getClock(),
    getCalendar: (a, b) => market.getCalendar(a, b),
    getLatestQuotes: (x) => market.getLatestQuotes(x),
    getBars: (x, t, o) => market.getBars(x, t, o),
    getOptionChain: (x) => market.getOptionChain(x),
  };
}

export interface SmokeTestResult {
  runId: string;
  reasoning: string | null;
  proposedOrders: unknown[];
  guardrailResult: "approved" | "rejected" | "no_action";
  guardrailReasons: string[];
  toolsUsed: string[];
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * One decision on the latest market data against a fresh scratch account
 * (Decision 15). Shown to the developer only; it never writes the decision log,
 * orders or fills (hard rule 10). Its AI cost counts toward the monthly cap.
 */
export async function runSmokeTest(deps: { db: Db; broker: BrokerAdapter; anthropic: MessagesClient; now?: () => Date }, ownerId: string, versionId: string): Promise<SmokeTestResult> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const { version } = await ownedVersion(db, ownerId, versionId);
  const cap = await spendCapReached(db, ownerId, now);
  if (cap === "developer") throw new StudioError("You've used this month's $10 of AI. Smoke tests resume next month.");
  if (cap === "site") throw new StudioError("Tradent's free AI for this month is used up. Smoke tests resume next month.");

  const scratch = smokeTestBroker(deps.broker);
  const { externalAccountId } = await scratch.createPaperAccount({ label: "smoke test", startingCash: DEFAULT_STARTING_CASH_USD });
  const [run] = await db.insert(s.smokeTestRuns).values({ agentVersionId: versionId }).returning();
  const d = await decide(deps.anthropic, {
    model: version.model,
    instructions: version.instructions,
    riskLimits: version.riskLimits,
    killed: false,
    broker: scratch,
    brokerAccountId: externalAccountId,
    account: await scratch.getAccount(externalAccountId),
    alerts: [],
    tools: version.tools,
    now,
  });
  await addSpend(db, ownerId, now, d.costUsd);

  const result: SmokeTestResult = {
    runId: run!.id,
    reasoning: d.output.reasoning,
    proposedOrders: d.proposedOrders,
    guardrailResult: d.outcome.result,
    guardrailReasons: d.outcome.checks.filter((c) => !c.approved).flatMap((c) => c.reasons.map((r) => `${c.order.symbol}: ${r}`)),
    toolsUsed: d.toolCalls.map((t) => t.name),
    modelId: d.servedBy,
    inputTokens: d.inputTokens,
    outputTokens: d.outputTokens,
    costUsd: d.costUsd,
  };
  await db.update(s.smokeTestRuns).set({ finishedAt: new Date(), result }).where(eq(s.smokeTestRuns.id, run!.id));
  return result;
}

/** The developer's recent smoke tests of one version, newest first. */
export async function listSmokeTests(db: Db, ownerId: string, versionId: string) {
  await ownedVersion(db, ownerId, versionId);
  const rows = await db.select().from(s.smokeTestRuns).where(eq(s.smokeTestRuns.agentVersionId, versionId)).orderBy(desc(s.smokeTestRuns.startedAt)).limit(10);
  return rows.map((r) => ({ runId: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt, result: r.result as SmokeTestResult | null }));
}
