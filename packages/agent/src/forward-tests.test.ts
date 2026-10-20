import { afterAll, describe, expect, it } from "vitest";
import { createDb, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { getForwardTest, guardrailReasons, listForwardTests, setKillSwitch } from "./forward-tests";
import { simulateForwardTest } from "./testing";
import { getTradingData, tradingAgentOptions } from "./trading";

describe("guardrailReasons", () => {
  it("lists the reasons of rejected orders and the daily stop", () => {
    expect(
      guardrailReasons({ stopForDay: true, checks: [{ symbol: "SPY", approved: true, reasons: [] }, { symbol: "TSLA", approved: false, reasons: ["Position over 20% of equity"] }] }),
    ).toEqual(["TSLA: Position over 20% of equity", "Daily loss stop reached; the agent stops for the day"]);
    expect(guardrailReasons({})).toEqual([]);
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("Forward tests and Trading reads", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  async function user(isAdmin = false) {
    const [u] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "FT User", isDeveloper: true, isAdmin }).returning();
    return u!.id;
  }

  it("shows a developer only their own tests, with progress, spend and a verified chain", async () => {
    const owner = await user();
    const other = await user();
    const t = await simulateForwardTest(db, { ownerId: owner, name: "Mine", publicSummary: "p", instructions: "secret-ft", tradingDays: 15, roundTrips: 5 });

    const tests = await listForwardTests(db, owner);
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ versionId: t.versionId, tradingDays: 15, trades: 10, decisions: 10, aiSpendUsd: 0, progress: { days: 0.5, trades: 0.5 } });
    expect(await listForwardTests(db, other)).toEqual([]);

    const detail = await getForwardTest(db, owner, t.versionId);
    expect(detail?.dailyMetrics).toHaveLength(15);
    expect(detail?.decisions).toHaveLength(10);
    expect(detail?.chainBreak).toBe(-1);
    expect(JSON.stringify(detail)).not.toContain("secret-ft");
    expect(await getForwardTest(db, other, t.versionId)).toBeNull();
  });

  it("lets only the developer or an admin use the kill switch", async () => {
    const owner = await user();
    const stranger = await user();
    const admin = await user(true);
    const { agentId } = await simulateForwardTest(db, { ownerId: owner, name: "Kill me", publicSummary: "p", instructions: "x", tradingDays: 2, roundTrips: 1 });
    const killed = async () => (await db.select({ k: s.agents.killed }).from(s.agents).where(eq(s.agents.id, agentId)))[0]!.k;

    expect(await setKillSwitch(db, { id: stranger, isAdmin: false }, agentId, true)).toBe(false);
    expect(await killed()).toBe(false);
    expect(await setKillSwitch(db, { id: owner, isAdmin: false }, agentId, true)).toBe(true);
    expect(await killed()).toBe(true);
    expect(await setKillSwitch(db, { id: admin, isAdmin: true }, agentId, false)).toBe(true);
    expect(await killed()).toBe(false);
  });

  it("lets everyone watch listed agents on Trading but only the developer their unlisted ones, and hides cost from others", async () => {
    const owner = await user();
    const investor = await user();
    const listed = await simulateForwardTest(db, { ownerId: owner, name: "Listed", publicSummary: "p", instructions: "secret-trading", tradingDays: 30, roundTrips: 10 });
    const young = await simulateForwardTest(db, { ownerId: owner, name: "Young", publicSummary: "p", instructions: "secret-trading", tradingDays: 5, roundTrips: 2 });

    const investorOptions = (await tradingAgentOptions(db, investor)).map((o) => o.versionId);
    expect(investorOptions).toContain(listed.versionId);
    expect(investorOptions).not.toContain(young.versionId);
    expect(await getTradingData(db, investor, young.versionId)).toBeNull();

    const asInvestor = await getTradingData(db, investor, listed.versionId);
    expect(asInvestor).toMatchObject({ own: false, symbols: ["SPY"] });
    expect(asInvestor!.fills).toHaveLength(20);
    expect(asInvestor!.decisions.every((d) => d.costUsd === null)).toBe(true);
    expect(JSON.stringify(asInvestor)).not.toContain("secret-trading");

    const asOwner = await getTradingData(db, owner, young.versionId);
    expect(asOwner?.own).toBe(true);
    expect(asOwner!.decisions.every((d) => d.costUsd === 0)).toBe(true);
  });
});
