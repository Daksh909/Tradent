import { afterAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { FakeBroker } from "@tradent/broker";
import { createDb, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { chatWithBuilder } from "./builder";
import { estimateMonthlyCostUsd } from "./pricing";
import type { MessagesClient } from "./runner";
import { emptyDraft, forkDraft, listSmokeTests, loadDraft, normalizeDraft, runSmokeTest, saveDraft, startForwardTest, StudioError, type Draft } from "./studio";
import { simulateForwardTest } from "./testing";

const NOW = new Date("2026-10-20T15:00:00Z");

/** A fake model that replies with the given content blocks, in order. */
function fakeModel(replies: unknown[][]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params) {
          calls.push(structuredClone(params));
          const content = replies[calls.length - 1] ?? [{ type: "text", text: "done" }];
          return { id: "m", type: "message", role: "assistant", model: params.model, content, stop_reason: "tool_use", usage: { input_tokens: 1000, output_tokens: 200 } } as unknown as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

const draft = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  name: "RSI dip",
  publicSummary: "Buys SPY dips.",
  instructions: "PRIVATE-STUDIO-PROMPT: buy SPY when RSI(14) < 30.",
  symbols: ["spy"],
  ...over,
});

describe("Studio basics", () => {
  it("estimates about $3.80 a month for hourly Sonnet, as in the spec", () => {
    expect(estimateMonthlyCostUsd("sonnet", 60)).toBeCloseTo(3.82, 2);
  });

  it("clamps risk limits to the platform ceilings and rejects bad input", () => {
    expect(normalizeDraft(draft({ maxPositionPct: 0.5, maxDailyLossPct: 0.02 })).riskLimits).toEqual({ maxPositionPct: 0.2, maxDailyLossPct: 0.02, allowedSymbols: ["SPY"] });
    expect(() => normalizeDraft(draft({ name: " " }))).toThrow(StudioError);
    expect(() => normalizeDraft(draft({ cadenceMinutes: 7 }))).toThrow(StudioError);
    expect(() => normalizeDraft(draft({ symbols: ["NOT A TICKER"] }))).toThrow(StudioError);
    expect(() => normalizeDraft(draft({ maxPositionPct: Number.NaN }))).toThrow(StudioError);
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("Studio with a database", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  async function developer() {
    const [u] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "Studio Dev", isDeveloper: true }).returning();
    return u!.id;
  }

  it("saves in place until the forward test starts, then edits become a new version", async () => {
    const owner = await developer();
    const v1 = await saveDraft(db, owner, draft({ strategies: [{ name: "RSI oversold", type: "entry_rule", description: "RSI(14) under 30." }] }));
    expect(v1.version).toBe(1);
    const first = (await loadDraft(db, owner, v1.versionId))!;
    const again = await saveDraft(db, owner, { ...first, instructions: "Edited." });
    expect(again.versionId).toBe(v1.versionId);

    const broker = new FakeBroker(() => NOW);
    await startForwardTest(db, broker, owner, v1.versionId, NOW);
    const [locked] = await db.select().from(s.agentVersions).where(eq(s.agentVersions.id, v1.versionId));
    expect(locked!.lockedAt).not.toBeNull();
    expect((await db.select().from(s.agents).where(eq(s.agents.id, v1.agentId)))[0]!.status).toBe("forward_testing");
    expect(await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, v1.versionId))).toHaveLength(1);
    await expect(startForwardTest(db, broker, owner, v1.versionId)).rejects.toThrow(StudioError);

    const loaded = (await loadDraft(db, owner, v1.versionId))!;
    expect(loaded.strategies.map((x) => x.name)).toEqual(["RSI oversold"]);
    const v2 = await saveDraft(db, owner, { ...loaded, instructions: "Second version." });
    expect(v2).toMatchObject({ agentId: v1.agentId, version: 2 });
    const [row2] = await db.select().from(s.agentVersions).where(eq(s.agentVersions.id, v2.versionId));
    expect(row2!.parentVersionIds).toEqual([v1.versionId]);
    expect((await db.select().from(s.agentVersions).where(eq(s.agentVersions.id, v1.versionId)))[0]!.instructions).toBe("Edited.");
  });

  it("refuses to save into another developer's agent or load their draft", async () => {
    const owner = await developer();
    const other = await developer();
    const v = await saveDraft(db, owner, draft());
    await expect(saveDraft(db, other, { ...draft(), agentId: v.agentId })).rejects.toThrow("isn't yours");
    expect(await loadDraft(db, other, v.versionId)).toBeNull();
  });

  it("forks a listed agent without its prompt and records the parent", async () => {
    const owner = await developer();
    const forker = await developer();
    const listed = await simulateForwardTest(db, { ownerId: owner, name: "Source", publicSummary: "p", instructions: "SOURCE-SECRET", tradingDays: 30, roundTrips: 10 });
    const young = await simulateForwardTest(db, { ownerId: owner, name: "Unlisted", publicSummary: "p", instructions: "x", tradingDays: 3, roundTrips: 1 });

    const fork = (await forkDraft(db, forker, listed.versionId))!;
    expect(fork.instructions).toBe("");
    expect(fork.parentVersionIds).toEqual([listed.versionId]);
    expect(JSON.stringify(fork)).not.toContain("SOURCE-SECRET");
    expect(await forkDraft(db, forker, young.versionId)).toBeNull();

    const saved = await saveDraft(db, forker, { ...fork, instructions: "My own rules." });
    const [row] = await db.select().from(s.agentVersions).where(eq(s.agentVersions.id, saved.versionId));
    expect(row!.parentVersionIds).toEqual([listed.versionId]);
  });

  it("runs a smoke test that never touches the trust record and counts its cost", async () => {
    const owner = await developer();
    const v = await saveDraft(db, owner, draft({ tools: ["get_quotes"] }));
    const market = new FakeBroker(() => NOW);
    market.setPrice("SPY", 500);
    const model = fakeModel([
      [{ type: "tool_use", id: "t0", name: "get_bars", input: { symbol: "SPY", timeframe: "1Day", days: 5 } }],
      [{ type: "tool_use", id: "t1", name: "propose_orders", input: { reasoning: "RSI is low", orders: [{ symbol: "SPY", instrument: "equity", side: "buy", quantity: 10, type: "market", limit_price: null }] } }],
    ]);

    const result = await runSmokeTest({ db, broker: market, anthropic: model.client, now: () => NOW }, owner, v.versionId);
    expect(result).toMatchObject({ reasoning: "RSI is low", guardrailResult: "approved", toolsUsed: ["get_bars", "propose_orders"] });
    // get_bars isn't enabled for this version, so the platform refused it and offered only the enabled tools.
    expect(model.calls[0]!.tools!.map((t) => (t as { name: string }).name)).toEqual(["get_quotes", "propose_orders"]);
    expect(await db.select().from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, v.versionId))).toEqual([]);
    expect(await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, v.versionId))).toEqual([]);
    expect(await listSmokeTests(db, owner, v.versionId)).toHaveLength(1);
    const [spend] = await db.select().from(s.spendLedger).where(eq(s.spendLedger.developerId, owner));
    expect(Number(spend!.dollarsSpent)).toBeCloseTo(0.008, 6);

    await db.update(s.spendLedger).set({ dollarsSpent: "10" }).where(eq(s.spendLedger.developerId, owner));
    await expect(runSmokeTest({ db, broker: market, anthropic: model.client, now: () => NOW }, owner, v.versionId)).rejects.toThrow("$10");
  });

  it("drafts an agent from a chat message and counts the builder's cost", async () => {
    const owner = await developer();
    const model = fakeModel([
      [
        {
          type: "tool_use",
          id: "d",
          name: "draft_agent",
          input: {
            reply: "Drafted an hourly SPY dip buyer.",
            name: "SPY dips",
            public_summary: "Buys SPY after oversold readings.",
            instructions: "Buy when RSI(14) < 30.",
            symbols: ["spy"],
            model: "sonnet",
            cadence_minutes: 60,
            tools: ["get_bars", "not_a_tool"],
            trading_view_alerts: false,
            max_position_pct: 0.5,
            max_daily_loss_pct: 0.03,
            strategies: [{ name: "RSI oversold", type: "entry_rule", description: "RSI(14) under 30." }],
          },
        },
      ],
    ]);
    const res = await chatWithBuilder({ db, anthropic: model.client, now: () => NOW }, owner, [{ role: "user", text: "Buy SPY when RSI(14) < 30" }]);
    expect(res.reply).toBe("Drafted an hourly SPY dip buyer.");
    expect(res.draft).toMatchObject({ symbols: ["SPY"], tools: ["get_bars"], maxPositionPct: 0.2, maxDailyLossPct: 0.03 });
    expect(model.calls[0]!.tool_choice).toEqual({ type: "tool", name: "draft_agent" });
    const [spend] = await db.select().from(s.spendLedger).where(eq(s.spendLedger.developerId, owner));
    expect(Number(spend!.dollarsSpent)).toBeCloseTo(0.004, 6);
  });
});
