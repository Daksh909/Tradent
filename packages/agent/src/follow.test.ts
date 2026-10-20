import { afterAll, describe, expect, it } from "vitest";
import { createDb, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { accountEquity, activeFollow, getPortfolio, scalePositions, startFollow, stopFollow } from "./follow";
import { simulateForwardTest } from "./testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("paper-follow", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  const user = async (name: string, developer = false) =>
    (await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: name, isDeveloper: developer }).returning())[0]!.id;

  it("follows a listed agent as a scaled copy of its account", async () => {
    const dev = await user("Dev", true);
    const investor = await user("Investor");
    const { versionId, broker } = await simulateForwardTest(db, { ownerId: dev, name: "Followed", publicSummary: "p", instructions: "secret", tradingDays: 31, roundTrips: 10 });

    // Starts from the broker's live equity when the broker can be read.
    const live = (await broker.getAccount((await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, versionId)))[0]!.externalAccountId!)).equity;
    expect(await accountEquity(db, versionId, broker)).toBe(live);

    const f = await startFollow(db, investor, versionId, 5000);
    const lastClose = await accountEquity(db, versionId);
    expect(Number(f.agentEquityAtStart)).toBe(lastClose);
    await expect(startFollow(db, investor, versionId, 5000)).rejects.toThrow("already follow");
    expect(await activeFollow(db, investor, versionId)).toEqual({ followId: f.id, virtualAmount: 5000 });

    // Backdate the follow so part of the record falls after it.
    await db.update(s.follows).set({ startedAt: new Date("2026-10-01T21:00:00Z") }).where(eq(s.follows.id, f.id));
    const p = await getPortfolio(db, investor);
    expect(p.active).toHaveLength(1);
    const view = p.active[0]!;
    const scale = 5000 / lastClose;
    expect(view.scale).toBeCloseTo(scale, 10);
    expect(view.curve[0]).toEqual({ date: "2026-10-01", value: 5000 });
    expect(view.curve.slice(1).every((pt) => pt.date > "2026-10-01")).toBe(true);
    // The last close is the equity it started from, so the value is still the amount.
    expect(view.value).toBeCloseTo(5000, 6);
    expect(view.fills.length).toBeGreaterThan(0);
    expect(view.fills.every((fl) => fl.filledAt > new Date("2026-10-01T21:00:00Z"))).toBe(true);
    expect(view.fills[0]!.quantity).toBeCloseTo(20 * scale, 10);
    expect(p.curve.at(-1)!.value).toBeCloseTo(p.value, 6);
    expect(p.invested).toBe(5000);
    // Prompts never reach the portfolio.
    expect(JSON.stringify(p)).not.toContain("secret");

    expect(scalePositions([{ symbol: "SPY", instrument: "equity", quantity: 20, avgEntryPrice: 500, marketValue: 10_000, unrealizedPl: 100 }], 0.5)[0]).toMatchObject({ quantity: 10, marketValue: 5000, unrealizedPl: 50 });

    await stopFollow(db, investor, f.id);
    const after = await getPortfolio(db, investor);
    expect(after.active).toHaveLength(0);
    expect(after.stopped[0]!.value).toBeCloseTo(5000, 6);
    await expect(stopFollow(db, investor, f.id)).rejects.toThrow("isn't active");
    // A stopped follow doesn't block following again.
    await startFollow(db, investor, versionId, 1000);
  });

  it("refuses unlisted agents and out-of-range amounts", async () => {
    const dev = await user("Dev", true);
    const investor = await user("Investor");
    const young = await simulateForwardTest(db, { ownerId: dev, name: "Young", publicSummary: "p", instructions: "x", tradingDays: 5, roundTrips: 1 });
    await expect(startFollow(db, investor, young.versionId, 5000)).rejects.toThrow("listed in the Library");
    await expect(startFollow(db, investor, young.versionId, 999)).rejects.toThrow("$1,000 to $1,000,000");
    await expect(startFollow(db, investor, young.versionId, 2_000_000)).rejects.toThrow("$1,000 to $1,000,000");
  });

  it("stops at someone else's follow", async () => {
    const dev = await user("Dev", true);
    const a = await user("A");
    const b = await user("B");
    const { versionId } = await simulateForwardTest(db, { ownerId: dev, name: "Shared", publicSummary: "p", instructions: "x", tradingDays: 31, roundTrips: 10 });
    const f = await startFollow(db, a, versionId, 5000);
    await expect(stopFollow(db, b, f.id)).rejects.toThrow("isn't active");
  });
});
