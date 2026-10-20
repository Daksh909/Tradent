// Creates one developer and one investor for the browser tests.
import { writeFileSync } from "node:fs";
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
  writeFileSync(USERS_FILE, JSON.stringify({ developer: developer!.id, investor: investor!.id, toggler: toggler!.id }));
  await client.end();
}
