// Creates the browser tests' users and one listed agent with a simulated record.
import { writeFileSync } from "node:fs";
import { simulateForwardTest } from "@tradent/agent";
import { createDb } from "@tradent/db";
import * as s from "@tradent/db";

export const USERS_FILE = new URL("./.users.json", import.meta.url);

export default async function globalSetup() {
  const { db, client } = createDb();
  const tag = crypto.randomUUID().slice(0, 8);
  const [developer] = await db.insert(s.users).values({ email: `dev-${tag}@e2e.local`, displayName: "E2E Developer", isDeveloper: true, isInvestor: true }).returning();
  const [investor] = await db.insert(s.users).values({ email: `inv-${tag}@e2e.local`, displayName: "E2E Investor" }).returning();
  // Its developer flag gets switched on and off by the settings test.
  const [toggler] = await db.insert(s.users).values({ email: `tog-${tag}@e2e.local`, displayName: "E2E Toggler" }).returning();

  // A listed agent (30 trading days, 20 fills) whose prompt must never reach a page.
  const [strategy] = await db.insert(s.strategies).values({ ownerId: developer!.id, name: `E2E Breakout ${tag}`, publicDescription: "Buys a breakout above the 20-day high.", type: "entry_rule" }).returning();
  const [strategyVersion] = await db.insert(s.strategyVersions).values({ strategyId: strategy!.id, version: 1 }).returning();
  const secretPrompt = `E2E-SECRET-PROMPT-${tag}`;
  const listed = await simulateForwardTest(db, {
    ownerId: developer!.id,
    name: `E2E Momentum ${tag}`,
    publicSummary: "Trades SPY momentum on paper.",
    instructions: secretPrompt,
    tradingDays: 30,
    roundTrips: 10,
    strategyVersionIds: [strategyVersion!.id],
  });

  // A young forward test only its developer may see; the kill switch test uses it.
  const young = await simulateForwardTest(db, { ownerId: developer!.id, name: `E2E Young ${tag}`, publicSummary: "Still testing.", instructions: secretPrompt, tradingDays: 5, roundTrips: 2 });

  writeFileSync(
    USERS_FILE,
    JSON.stringify({ developer: developer!.id, investor: investor!.id, toggler: toggler!.id, listedAgent: listed.agentId, listedAgentName: `E2E Momentum ${tag}`, strategyName: strategy!.name, secretPrompt, youngVersion: young.versionId, youngName: `E2E Young ${tag}`, listedVersion: listed.versionId }),
  );
  await client.end();
}
