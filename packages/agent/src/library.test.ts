import { afterAll, describe, expect, it } from "vitest";
import { createDb, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { getAgentDetail, listingStatus, listLibraryAgents, listLibraryStrategies, updateListingStatus } from "./library";
import { simulateForwardTest } from "./testing";

describe("listingStatus", () => {
  it("lists after 30 trading days and 20 trades, and labels records under 90 days young", () => {
    expect(listingStatus(29, 40)).toEqual({ listed: false, youngRecord: true });
    expect(listingStatus(30, 19)).toEqual({ listed: false, youngRecord: true });
    expect(listingStatus(30, 20)).toEqual({ listed: true, youngRecord: true });
    expect(listingStatus(90, 20)).toEqual({ listed: true, youngRecord: false });
  });
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("Library reads", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  async function developer() {
    const [u] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "Lib Dev", isDeveloper: true }).returning();
    return u!.id;
  }

  it("shows an agent once it has 30 trading days and 20 trades, with its record", async () => {
    const ownerId = await developer();
    const ready = await simulateForwardTest(db, { ownerId, name: "Ready", publicSummary: "p", instructions: "x", tradingDays: 30, roundTrips: 10 });
    const short = await simulateForwardTest(db, { ownerId, name: "Too short", publicSummary: "p", instructions: "x", tradingDays: 29, roundTrips: 10 });
    const few = await simulateForwardTest(db, { ownerId, name: "Too few trades", publicSummary: "p", instructions: "x", tradingDays: 30, roundTrips: 9 });

    const listed = (await listLibraryAgents(db)).filter((v) => [ready.agentId, short.agentId, few.agentId].includes(v.agentId));
    expect(listed.map((v) => v.agentName)).toEqual(["Ready"]);
    expect(listed[0]).toMatchObject({ tradingDays: 30, trades: 20, youngRecord: true, instruments: ["equity"], startingCash: 100_000 });
    expect(listed[0]!.totalReturn).not.toBeNull();

    await updateListingStatus(db);
    const statuses = await db.select({ id: s.agents.id, status: s.agents.status }).from(s.agents).where(eq(s.agents.ownerId, ownerId));
    expect(Object.fromEntries(statuses.map((a) => [a.id, a.status]))).toEqual({ [ready.agentId]: "listed", [short.agentId]: "forward_testing", [few.agentId]: "forward_testing" });
  });

  it("never returns an agent's prompt from any investor-facing read", async () => {
    const ownerId = await developer();
    const secret = `SECRET-PROMPT-${crypto.randomUUID()}`;
    const [strategy] = await db.insert(s.strategies).values({ ownerId, name: "Lib strategy", type: "signal", publicDescription: "d" }).returning();
    const [sv] = await db.insert(s.strategyVersions).values({ strategyId: strategy!.id, version: 1 }).returning();
    const parent = await simulateForwardTest(db, { ownerId, name: "Parent", publicSummary: "p", instructions: secret, tradingDays: 30, roundTrips: 10 });
    const child = await simulateForwardTest(db, {
      ownerId, name: "Child", publicSummary: "c", instructions: secret, tradingDays: 30, roundTrips: 10,
      strategyVersionIds: [sv!.id], parentVersionIds: [parent.versionId],
    });

    const detail = await getAgentDetail(db, child.agentId);
    expect(detail!.strategies.map((x) => x.name)).toEqual(["Lib strategy"]);
    expect(detail!.parents.map((p) => p.agentName)).toEqual(["Parent"]);
    expect(detail!.trades).toHaveLength(20);
    expect(detail!.equityCurve).toHaveLength(30);

    for (const result of [await listLibraryAgents(db), detail, await getAgentDetail(db, parent.agentId), await listLibraryStrategies(db)]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
});
