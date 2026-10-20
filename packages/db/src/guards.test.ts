// Needs a migrated Postgres at DATABASE_URL; skipped otherwise.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_RISK_LIMITS } from "@tradent/core";
import { createDb } from "./index";
import * as s from "./schema";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("trust record guards", () => {
  const { db, client } = createDb(url);
  afterAll(() => client.end());

  // Drizzle wraps driver errors; the trigger's message is on the cause.
  async function failure(query: PromiseLike<unknown>): Promise<string> {
    try {
      await query;
    } catch (e) {
      const err = e as Error & { cause?: Error };
      return err.cause?.message ?? err.message;
    }
    throw new Error("expected the query to fail");
  }

  async function lockedVersion() {
    const [user] = await db.insert(s.users).values({ email: `${crypto.randomUUID()}@test.local`, displayName: "t", isDeveloper: true }).returning();
    const [agent] = await db.insert(s.agents).values({ ownerId: user!.id, name: "t", publicSummary: "t" }).returning();
    const [version] = await db
      .insert(s.agentVersions)
      .values({ agentId: agent!.id, version: 1, instructions: "secret", riskLimits: DEFAULT_RISK_LIMITS, model: "haiku", cadenceMinutes: 60, lockedAt: new Date() })
      .returning();
    return version!;
  }

  it("rejects editing or deleting a decision", async () => {
    const version = await lockedVersion();
    const [entry] = await db
      .insert(s.decisionLogs)
      .values({
        agentVersionId: version.id, seq: 1, inputsSnapshot: {}, promptHash: "p", modelId: "m", output: {},
        guardrailResult: "no_action", inputTokens: 0, outputTokens: 0, costUsd: "0", prevHash: "0", hash: "h",
      })
      .returning();
    expect(await failure(db.update(s.decisionLogs).set({ output: { edited: true } }).where(eq(s.decisionLogs.id, entry!.id)))).toMatch(/append-only/);
    expect(await failure(db.delete(s.decisionLogs).where(eq(s.decisionLogs.id, entry!.id)))).toMatch(/append-only/);
  });

  it("rejects changing a locked agent version", async () => {
    const version = await lockedVersion();
    expect(await failure(db.update(s.agentVersions).set({ instructions: "changed" }).where(eq(s.agentVersions.id, version.id)))).toMatch(/locked/);
  });
});
