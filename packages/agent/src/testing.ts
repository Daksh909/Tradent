// Builds a forward-test record through the real pipeline (decision log, broker
// orders, broker fills, DailyMetrics) on a FakeBroker. For tests and local demos
// only: the record is simulated and must never be shown as a real one.
import { DEFAULT_RISK_LIMITS, DEFAULT_STARTING_CASH_USD, type AgentModel } from "@tradent/core";
import { FakeBroker } from "@tradent/broker";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { appendDecision } from "./decision-log";
import { syncFills } from "./runner";
import { writeDailyMetrics } from "./scheduler";

export interface SimulatedRecordOptions {
  ownerId: string;
  name: string;
  publicSummary: string;
  instructions: string;
  tradingDays: number;
  /** Round trips (one buy, one sell) spread over the period; each is two fills. */
  roundTrips: number;
  model?: AgentModel;
  symbol?: string;
  /** Daily price drift used to move the fake price. */
  drift?: number;
  strategyVersionIds?: string[];
  parentVersionIds?: string[];
}

function weekdaysBack(count: number, end = new Date("2026-10-16T12:00:00Z")): string[] {
  const days: string[] = [];
  for (const d = new Date(end); days.length < count; d.setUTCDate(d.getUTCDate() - 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.unshift(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function simulateForwardTest(db: Db, o: SimulatedRecordOptions) {
  const symbol = o.symbol ?? "SPY";
  const days = weekdaysBack(o.tradingDays);
  let now = new Date(`${days[0]}T15:00:00Z`);
  const broker = new FakeBroker(() => now);
  let price = 500;
  broker.setPrice(symbol, price);

  const [agent] = await db.insert(s.agents).values({ ownerId: o.ownerId, name: o.name, publicSummary: o.publicSummary, status: "forward_testing" }).returning();
  const [version] = await db
    .insert(s.agentVersions)
    .values({
      agentId: agent!.id,
      version: 1,
      instructions: o.instructions,
      tools: ["get_quotes", "get_bars", "propose_orders"],
      dataSources: ["IEX real-time"],
      riskLimits: { ...DEFAULT_RISK_LIMITS, allowedSymbols: [symbol] },
      model: o.model ?? "sonnet",
      cadenceMinutes: 60,
      parentVersionIds: o.parentVersionIds ?? [],
      lockedAt: now,
    })
    .returning();
  if (o.strategyVersionIds?.length)
    await db.insert(s.agentVersionStrategies).values(o.strategyVersionIds.map((strategyVersionId) => ({ agentVersionId: version!.id, strategyVersionId })));
  const { externalAccountId } = await broker.createPaperAccount({ label: o.name, startingCash: DEFAULT_STARTING_CASH_USD });
  const [account] = await db
    .insert(s.paperAccounts)
    .values({ agentVersionId: version!.id, externalAccountId, startingCash: String(DEFAULT_STARTING_CASH_USD) })
    .returning();

  const tradeDays = new Set(Array.from({ length: o.roundTrips * 2 }, (_, i) => Math.floor((i * days.length) / (o.roundTrips * 2))));
  let holding = false;
  for (const [i, day] of days.entries()) {
    now = new Date(`${day}T15:00:00Z`);
    price = Math.round(price * (1 + (o.drift ?? 0.001) + (i % 3 === 0 ? -0.004 : 0.002)) * 100) / 100;
    broker.setPrice(symbol, price);
    if (tradeDays.has(i)) {
      const side: "buy" | "sell" = holding ? "sell" : "buy";
      const order = { symbol, instrument: "equity" as const, side, quantity: 20, type: "market" as const };
      const decision = await appendDecision(db, {
        agentVersionId: version!.id,
        decidedAt: now,
        inputsSnapshot: { simulated: true, price },
        promptHash: "simulated",
        modelId: "simulated",
        output: { reasoning: `${side === "buy" ? "Bought" : "Sold"} ${symbol} (simulated record).` },
        toolCalls: [],
        proposedOrders: [order],
        guardrailResult: "approved",
        guardrailDetail: {},
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0",
      });
      const [row] = await db.insert(s.orders).values({ decisionId: decision.id, paperAccountId: account!.id, ...order, quantity: "20" }).returning();
      const placed = await broker.submitOrder(externalAccountId, { ...order, clientOrderId: row!.id });
      await db.update(s.orders).set({ brokerOrderId: placed.brokerOrderId, brokerStatus: placed.status }).where(s.eq(s.orders.id, row!.id));
      await syncFills(db, broker, account!.id, externalAccountId);
      holding = !holding;
    }
    now = new Date(`${day}T20:10:00Z`);
    await writeDailyMetrics(db, broker, day, [version!.id]);
  }
  return { agentId: agent!.id, versionId: version!.id, broker };
}
