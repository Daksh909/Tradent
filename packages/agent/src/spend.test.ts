import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@tradent/db";
import * as s from "@tradent/db";
import { getSpendSummary } from "./spend";
import { saveDraft, emptyDraft } from "./studio";
import { simulateForwardTest } from "./testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("getSpendSummary", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  it("splits this month's spend into forward tests, smoke tests and the builder", async () => {
    const now = new Date("2026-10-20T15:00:00Z");
    const [u] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "Spender", isDeveloper: true }).returning();
    const owner = u!.id;
    await simulateForwardTest(db, { ownerId: owner, name: "Free", publicSummary: "p", instructions: "x", tradingDays: 2, roundTrips: 1 });
    const v = await saveDraft(db, owner, { ...emptyDraft(), name: "Smoky", publicSummary: "p", instructions: "x" });
    await db.insert(s.smokeTestRuns).values({ agentVersionId: v.versionId, startedAt: now, result: { costUsd: 0.5 } });
    await db.insert(s.spendLedger).values([
      { developerId: owner, month: "2026-10-01", dollarsSpent: "2" },
      { developerId: owner, month: "2026-09-01", dollarsSpent: "10" },
    ]);

    const sum = await getSpendSummary(db, owner, now);
    expect(sum).toMatchObject({ month: "2026-10-01", spent: 2, cap: 10, atCap: false });
    // The simulated forward-test decisions cost $0.
    expect(sum.parts).toEqual({ forwardTests: 0, smokeTests: 0.5, builder: 1.5 });
    expect(sum.history.map((h) => h.month)).toEqual(["2026-10-01", "2026-09-01"]);
    expect((await getSpendSummary(db, owner, new Date("2026-09-15T12:00:00Z"))).atCap).toBe(true);
  });
});
