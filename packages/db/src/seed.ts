// Demo data for local development. Safe to run on an empty database only.
import { DEFAULT_RISK_LIMITS, DEFAULT_STARTING_CASH_USD, GENESIS_HASH, decisionHash } from "@tradent/core";
import { createDb } from "./index";
import * as s from "./schema";

const { db, client } = createDb();

const [dev] = await db
  .insert(s.users)
  .values({ email: "dev@example.com", displayName: "Demo Developer", isDeveloper: true, isInvestor: true })
  .returning();
const [investor] = await db.insert(s.users).values({ email: "investor@example.com", displayName: "Demo Investor" }).returning();
if (!dev || !investor) throw new Error("seed: users not created");

const strategySeeds = [
  { name: "RSI oversold entry", type: "entry_rule", publicDescription: "Buy when 14-period RSI falls below 30.", parameters: { period: 14, threshold: 30 } },
  { name: "200-day trend filter", type: "signal", publicDescription: "Only trade when price is above its 200-day moving average.", parameters: { window: 200 } },
  { name: "Take profit or time stop", type: "exit_rule", publicDescription: "Exit at +3% or after 5 trading days.", parameters: { takeProfitPct: 0.03, maxDays: 5 } },
] as const;

const strategyVersionIds: string[] = [];
for (const seed of strategySeeds) {
  const [strategy] = await db
    .insert(s.strategies)
    .values({ ownerId: dev.id, name: seed.name, type: seed.type, publicDescription: seed.publicDescription })
    .returning();
  const [version] = await db.insert(s.strategyVersions).values({ strategyId: strategy!.id, version: 1, parameters: seed.parameters }).returning();
  strategyVersionIds.push(version!.id);
}

const [agent] = await db
  .insert(s.agents)
  .values({
    ownerId: dev.id,
    name: "SPY mean reversion",
    publicSummary: "Buys short dips in SPY while the long-term trend is up, and exits quickly.",
    status: "forward_testing",
  })
  .returning();
const [version] = await db
  .insert(s.agentVersions)
  .values({
    agentId: agent!.id,
    version: 1,
    instructions: "You trade SPY only. Combine the attached strategies; propose at most one order per decision.",
    tools: ["get_quote", "get_bars", "get_positions", "propose_orders"],
    dataSources: ["alpaca_iex_bars"],
    riskLimits: { ...DEFAULT_RISK_LIMITS, allowedSymbols: ["SPY"] },
    model: "sonnet",
    cadenceMinutes: 60,
    lockedAt: new Date(),
  })
  .returning();
await db.insert(s.agentVersionStrategies).values(strategyVersionIds.map((strategyVersionId) => ({ agentVersionId: version!.id, strategyVersionId })));
await db.insert(s.paperAccounts).values({ agentVersionId: version!.id, startingCash: String(DEFAULT_STARTING_CASH_USD) });

// Two chained no-action decisions so the trust record is not empty.
let prevHash = GENESIS_HASH;
for (const seq of [1, 2]) {
  const body = {
    agentVersionId: version!.id,
    seq,
    inputsSnapshot: { symbol: "SPY", note: "seed data" },
    promptHash: "seed",
    modelId: "seed",
    output: { action: "none", reason: "RSI above 30" },
    toolCalls: [],
    proposedOrders: [],
    guardrailResult: "no_action" as const,
    guardrailDetail: {},
    inputTokens: 0,
    outputTokens: 0,
    costUsd: "0",
  };
  const hash = decisionHash(prevHash, body);
  await db.insert(s.decisionLogs).values({ ...body, prevHash, hash });
  prevHash = hash;
}

await db.insert(s.follows).values({ investorId: investor.id, agentVersionId: version!.id, virtualAmount: "10000" });

await client.end();
console.log("Seeded demo users, 3 strategies, 1 agent with a locked version, 2 decisions and 1 follow");
