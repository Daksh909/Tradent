import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_RISK_LIMITS } from "@tradent/core";
import { FakeBroker } from "@tradent/broker";
import { createDb, eq, inArray } from "@tradent/db";
import * as s from "@tradent/db";
import type { MessagesClient } from "./runner";
import { dueVersions, metricsDueDate, newYorkTime, schedulerPass, tick, writeDailyMetrics } from "./scheduler";

const url = process.env.DATABASE_URL;
const NOW = new Date("2026-10-20T15:00:00Z"); // Tuesday, 11:00 in New York
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("New York time and the metrics schedule", () => {
  it("converts to New York local time", () => {
    expect(newYorkTime(new Date("2026-10-20T20:04:00Z"))).toEqual({ date: "2026-10-20", time: "16:04" });
    expect(newYorkTime(new Date("2026-12-01T21:05:00Z"))).toEqual({ date: "2026-12-01", time: "16:05" });
  });

  it("is due 5 minutes after the close on trading days only", async () => {
    const b = new FakeBroker();
    expect(await metricsDueDate(b, new Date("2026-10-20T20:04:00Z"))).toBeNull();
    expect(await metricsDueDate(b, new Date("2026-10-20T20:05:00Z"))).toBe("2026-10-20");
    expect(await metricsDueDate(b, new Date("2026-10-24T21:00:00Z"))).toBeNull(); // Saturday
    b.holidays.add("2026-11-26");
    expect(await metricsDueDate(b, new Date("2026-11-26T22:00:00Z"))).toBeNull();
  });
});

/** A model that always proposes no trade. */
function idleModel() {
  let calls = 0;
  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params) {
          calls++;
          return {
            id: "m", type: "message", role: "assistant", model: params.model, stop_reason: "tool_use",
            content: [{ type: "tool_use", id: `t${calls}`, name: "propose_orders", input: { reasoning: "hold", orders: [] } }],
            usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          } as unknown as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, calls: () => calls };
}

describe.skipIf(!url)("scheduler", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());
  // These tests own the scheduler: park agents left active by earlier runs.
  beforeEach(async () => {
    await db.update(s.agents).set({ status: "retired" }).where(inArray(s.agents.status, ["forward_testing", "listed"]));
  });

  async function agentVersion(broker: FakeBroker, opts: { cadenceMinutes?: number; locked?: boolean; killed?: boolean; ownerId?: string } = {}) {
    const ownerId =
      opts.ownerId ?? (await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "t", isDeveloper: true }).returning())[0]!.id;
    const [agent] = await db.insert(s.agents).values({ ownerId, name: "t", publicSummary: "t", status: "forward_testing", killed: opts.killed ?? false }).returning();
    const [version] = await db
      .insert(s.agentVersions)
      .values({ agentId: agent!.id, version: 1, instructions: "Hold.", riskLimits: DEFAULT_RISK_LIMITS, model: "haiku", cadenceMinutes: opts.cadenceMinutes ?? 60, lockedAt: opts.locked === false ? null : NOW })
      .returning();
    const { externalAccountId } = await broker.createPaperAccount({ label: "t", startingCash: 100_000 });
    await db.insert(s.paperAccounts).values({ agentVersionId: version!.id, externalAccountId, startingCash: "100000" });
    return { ownerId, agentId: agent!.id, versionId: version!.id, externalAccountId };
  }

  it("runs a version again only after its cadence has passed", async () => {
    const broker = new FakeBroker(() => NOW);
    const v = await agentVersion(broker, { cadenceMinutes: 60 });
    const model = idleModel();
    const deps = (at: Date) => ({ db, broker, anthropic: model.client, now: () => at });

    expect((await tick(deps(NOW))).results).toEqual([{ versionId: v.versionId, result: expect.objectContaining({ status: "decided", guardrailResult: "no_action" }) }]);
    expect((await tick(deps(minutes(30)))).results).toEqual([]);
    expect((await tick(deps(minutes(60)))).results).toHaveLength(1);
  });

  it("leaves out killed, unlocked and inactive versions, and runs nothing when the market is closed", async () => {
    const broker = new FakeBroker(() => NOW);
    const killed = await agentVersion(broker, { killed: true });
    const unlocked = await agentVersion(broker, { locked: false });
    const due = (await dueVersions(db, NOW)).map((d) => d.versionId);
    expect(due).not.toContain(killed.versionId);
    expect(due).not.toContain(unlocked.versionId);

    await agentVersion(broker);
    broker.marketOpen = false;
    expect(await tick({ db, broker, anthropic: idleModel().client, now: () => NOW })).toEqual({ marketOpen: false, results: [] });
  });

  it("pauses every agent of a developer at the spend cap", async () => {
    const broker = new FakeBroker(() => NOW);
    const a = await agentVersion(broker);
    const b = await agentVersion(broker, { ownerId: a.ownerId });
    await db.insert(s.spendLedger).values({ developerId: a.ownerId, month: "2026-10-01", dollarsSpent: "10" });
    const model = idleModel();
    const { results } = await tick({ db, broker, anthropic: model.client, now: () => NOW });
    expect(results.map((r) => r.result)).toEqual([
      { status: "skipped", reason: "spend_cap" },
      { status: "skipped", reason: "spend_cap" },
    ]);
    expect(results.map((r) => r.versionId).sort()).toEqual([a.versionId, b.versionId].sort());
    expect(model.calls()).toBe(0);
  });

  it("writes one DailyMetrics row per day from broker equity, with drawdown and trade count", async () => {
    const broker = new FakeBroker(() => NOW);
    broker.setPrice("SPY", 500);
    const v = await agentVersion(broker);
    // A fill on the day, recorded the way the runner records it.
    const placed = await broker.submitOrder(v.externalAccountId, { symbol: "SPY", instrument: "equity", side: "buy", quantity: 20, type: "market", clientOrderId: crypto.randomUUID() });
    const [account] = await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, v.versionId));
    const [log] = await db
      .insert(s.decisionLogs)
      .values({ agentVersionId: v.versionId, seq: 1, decidedAt: NOW, inputsSnapshot: {}, promptHash: "p", modelId: "m", output: {}, guardrailResult: "approved", inputTokens: 0, outputTokens: 0, costUsd: "0", prevHash: "0", hash: "h" })
      .returning();
    const [order] = await db.insert(s.orders).values({ decisionId: log!.id, paperAccountId: account!.id, symbol: "SPY", instrument: "equity", side: "buy", quantity: "20", type: "market", brokerOrderId: placed.brokerOrderId }).returning();
    const [fill] = await broker.getFills(v.externalAccountId);
    await db.insert(s.fills).values({ orderId: order!.id, brokerFillId: fill!.brokerFillId, price: "500", quantity: "20", filledAt: NOW });

    broker.setPrice("SPY", 450); // equity 99,000
    expect(await writeDailyMetrics(db, broker, "2026-10-20")).toBe(1);
    broker.setPrice("SPY", 550); // equity 101,000
    await writeDailyMetrics(db, broker, "2026-10-21");
    expect(await writeDailyMetrics(db, broker, "2026-10-21")).toBe(0);

    const rows = await db.select().from(s.dailyMetrics).where(eq(s.dailyMetrics.agentVersionId, v.versionId)).orderBy(s.dailyMetrics.date);
    expect(rows.map((r) => [r.date, Number(r.equity), Number(r.dailyReturn), Number(r.maxDrawdown), r.tradeCount])).toEqual([
      ["2026-10-20", 99_000, -0.01, 0.01, 1],
      ["2026-10-21", 101_000, Number((101_000 / 99_000 - 1).toFixed(8)), 0.01, 0],
    ]);
  });

  it("one scheduler pass at a time: decisions while open, metrics once after the close", async () => {
    let now = NOW;
    const broker = new FakeBroker(() => now);
    const { versionId } = await agentVersion(broker);
    const model = idleModel();
    const deps = { db, broker, anthropic: model.client, now: () => now };

    // A pass that's already running blocks this one.
    await db.insert(s.schedulerLeases).values({ name: "scheduler", heldUntil: minutes(5) });
    expect(await schedulerPass(deps)).toEqual([{ event: "skipped", reason: "another pass is running" }]);
    // A lease left behind by a crashed pass expires.
    await db.update(s.schedulerLeases).set({ heldUntil: minutes(-1) });
    expect((await schedulerPass(deps)).filter((e) => e.event === "decision").map((e) => e.versionId)).toContain(versionId);
    expect(await db.select().from(s.schedulerLeases)).toHaveLength(0);

    now = new Date("2026-10-20T20:10:00Z");
    broker.marketOpen = false;
    const after = await schedulerPass(deps);
    expect(after.find((e) => e.event === "daily_metrics")).toMatchObject({ date: "2026-10-20" });
    expect(await db.select().from(s.dailyMetrics).where(eq(s.dailyMetrics.agentVersionId, versionId))).toHaveLength(1);
    // Repeating it later writes nothing new.
    now = new Date("2026-10-20T20:15:00Z");
    expect((await schedulerPass(deps)).find((e) => e.event === "daily_metrics")).toMatchObject({ written: 0 });
  });
});
