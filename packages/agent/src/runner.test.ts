// Needs a migrated Postgres at DATABASE_URL; skipped otherwise.
import { afterAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_RISK_LIMITS } from "@tradent/core";
import { FakeBroker } from "@tradent/broker";
import { createDb, eq, sql } from "@tradent/db";
import * as s from "@tradent/db";
import { verifyDecisionChain } from "./decision-log";
import { runDecision, type MessagesClient } from "./runner";
import { issueWebhookSecret, listWebhooks, MAX_ALERT_BYTES, receiveAlert } from "./webhooks";

const url = process.env.DATABASE_URL;
const NOW = new Date("2026-10-20T15:00:00Z");

type Order = { symbol: string; instrument: "equity" | "option"; side: "buy" | "sell"; quantity: number; type: "market" | "limit"; limit_price: number | null };

/** A fake model that looks up a quote, then proposes the given orders. */
function scriptedModel(orders: Order[]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const usage = { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const replies = [
    [{ type: "tool_use", id: "t1", name: "get_quotes", input: { symbols: ["SPY"] } }],
    [{ type: "tool_use", id: "t2", name: "propose_orders", input: { reasoning: "test", orders } }],
  ];
  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params) {
          calls.push(structuredClone(params));
          const content = replies[calls.length - 1] ?? [{ type: "text", text: "done" }];
          return { id: "m", type: "message", role: "assistant", model: params.model, content, stop_reason: "tool_use", usage } as unknown as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

describe.skipIf(!url)("runDecision", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  async function setup(opts: { spent?: string } = {}) {
    const broker = new FakeBroker(() => NOW);
    broker.setPrice("SPY", 500);
    const { externalAccountId } = await broker.createPaperAccount({ label: "t", startingCash: 100_000 });
    const [user] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "t", isDeveloper: true }).returning();
    const [agent] = await db.insert(s.agents).values({ ownerId: user!.id, name: "t", publicSummary: "t", status: "forward_testing" }).returning();
    const [version] = await db
      .insert(s.agentVersions)
      .values({ agentId: agent!.id, version: 1, instructions: "Buy SPY.", riskLimits: { ...DEFAULT_RISK_LIMITS, allowedSymbols: ["SPY"] }, model: "sonnet", cadenceMinutes: 60, lockedAt: NOW })
      .returning();
    await db.insert(s.paperAccounts).values({ agentVersionId: version!.id, externalAccountId, startingCash: "100000" });
    if (opts.spent) await db.insert(s.spendLedger).values({ developerId: user!.id, month: "2026-10-01", dollarsSpent: opts.spent });
    return { broker, user: user!, agent: agent!, version: version!, externalAccountId };
  }

  it("logs the decision, sends the approved order and stores the broker's fill", async () => {
    const { broker, user, version } = await setup();
    const model = scriptedModel([{ symbol: "SPY", instrument: "equity", side: "buy", quantity: 10, type: "market", limit_price: null }]);
    const res = await runDecision({ db, broker, anthropic: model.client, now: () => NOW }, version.id);

    expect(res).toMatchObject({ status: "decided", guardrailResult: "approved", ordersSubmitted: 1 });
    expect(model.calls[0]!.model).toBe("claude-sonnet-5-5");
    const [log] = await db.select().from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, version.id));
    expect(log!.toolCalls).toHaveLength(2);
    expect(log!.inputTokens).toBe(2000);
    const fills = await db.select().from(s.fills).innerJoin(s.orders, eq(s.fills.orderId, s.orders.id)).where(eq(s.orders.decisionId, log!.id));
    expect(fills).toHaveLength(1);
    const [spend] = await db.select().from(s.spendLedger).where(eq(s.spendLedger.developerId, user.id));
    expect(Number(spend!.dollarsSpent)).toBeCloseTo(0.008, 6) // 2 calls x (1000 in x $2 + 200 out x $10) per MTok;
  });

  it("logs a guardrail rejection and sends nothing", async () => {
    const { broker, version, externalAccountId } = await setup();
    const model = scriptedModel([{ symbol: "SPY", instrument: "equity", side: "buy", quantity: 100, type: "market", limit_price: null }]);
    const res = await runDecision({ db, broker, anthropic: model.client, now: () => NOW }, version.id);

    expect(res).toMatchObject({ status: "decided", guardrailResult: "rejected", ordersSubmitted: 0 });
    const [log] = await db.select().from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, version.id));
    expect(log!.guardrailResult).toBe("rejected");
    expect(JSON.stringify(log!.guardrailDetail)).toMatch(/over the 20% cap/);
    expect(await broker.getOrders(externalAccountId, { status: "all" })).toHaveLength(0);
  });

  it("skips a developer at the $10 cap without calling the model", async () => {
    const { broker, version } = await setup({ spent: "10" });
    const model = scriptedModel([]);
    expect(await runDecision({ db, broker, anthropic: model.client, now: () => NOW }, version.id)).toEqual({ status: "skipped", reason: "spend_cap" });
    expect(model.calls).toHaveLength(0);
  });

  it("skips when the market is closed", async () => {
    const { broker, version } = await setup();
    broker.marketOpen = false;
    expect(await runDecision({ db, broker, anthropic: scriptedModel([]).client, now: () => NOW }, version.id)).toEqual({ status: "skipped", reason: "market_closed" });
  });

  it("chains decisions and detects an edited entry", async () => {
    const { broker, version } = await setup();
    for (let i = 0; i < 3; i++) await runDecision({ db, broker, anthropic: scriptedModel([]).client, now: () => NOW }, version.id);
    expect(await verifyDecisionChain(db, version.id)).toBe(-1);

    // Simulate someone bypassing the append-only trigger.
    await db.transaction(async (tx) => {
      await tx.execute(sql`alter table decision_logs disable trigger decision_logs_append_only`);
      await tx.execute(sql`update decision_logs set output = '{"reasoning":"edited"}' where agent_version_id = ${version.id} and seq = 2`);
      await tx.execute(sql`alter table decision_logs enable trigger decision_logs_append_only`);
    });
    expect(await verifyDecisionChain(db, version.id)).toBe(1);
  });
  it("a TradingView alert places no order and reaches only the next decision", async () => {
    const { broker, user, agent, version, externalAccountId } = await setup();
    expect(await issueWebhookSecret(db, crypto.randomUUID(), agent.id)).toBeNull();
    const { sourceId, secret } = (await issueWebhookSecret(db, user.id, agent.id))!;
    const [stored] = await db.select().from(s.signalSources).where(eq(s.signalSources.id, sourceId));
    expect(stored!.webhookSecretHash).not.toContain(secret);

    expect(await receiveAlert(db, sourceId, "wrong", "{}")).toMatchObject({ status: 401 });
    expect(await receiveAlert(db, sourceId, secret, "x".repeat(MAX_ALERT_BYTES + 1))).toMatchObject({ status: 413 });
    expect(await receiveAlert(db, sourceId, secret, '{"ticker":"SPY","action":"buy"}')).toEqual({ status: 202 });
    expect(await receiveAlert(db, sourceId, secret, "SPY crossed 500")).toEqual({ status: 202 });
    // Stored, nothing else: no decision, no order, nothing at the broker.
    expect(await db.select().from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, version.id))).toHaveLength(0);
    expect(await broker.getOrders(externalAccountId, { status: "all" })).toHaveLength(0);
    expect((await listWebhooks(db, user.id))[0]).toMatchObject({ sourceId, pendingAlerts: 2 });

    const model = scriptedModel([]);
    await runDecision({ db, broker, anthropic: model.client, now: () => NOW }, version.id);
    const [log] = await db.select().from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, version.id));
    const alerts = (log!.inputsSnapshot as { tradingViewAlerts: { payload: unknown }[] }).tradingViewAlerts;
    expect(alerts.map((a) => a.payload)).toEqual(expect.arrayContaining([{ ticker: "SPY", action: "buy" }, { text: "SPY crossed 500" }]));
    expect((await listWebhooks(db, user.id))[0]!.pendingAlerts).toBe(0);

    // A new secret retires the old URL.
    const rotated = (await issueWebhookSecret(db, user.id, agent.id))!;
    expect(rotated.sourceId).toBe(sourceId);
    expect(await receiveAlert(db, sourceId, secret, "{}")).toMatchObject({ status: 401 });
  });
});
