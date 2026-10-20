// Appends to the hash-chained, append-only trust record (CLAUDE.md hard rule 3).
import { desc, eq, sql } from "@tradent/db";
import { GENESIS_HASH, decisionHash, verifyChain } from "@tradent/core";
import { decisionLogs, type Db } from "@tradent/db";

export type DecisionBody = Omit<typeof decisionLogs.$inferInsert, "id" | "seq" | "prevHash" | "hash" | "decidedAt"> & { decidedAt: Date };

/** The fields a hash covers, in a form that survives a database round trip. */
function hashable(seq: number, b: DecisionBody): Record<string, unknown> {
  return {
    agentVersionId: b.agentVersionId,
    seq,
    decidedAt: b.decidedAt.toISOString(),
    inputsSnapshot: b.inputsSnapshot,
    promptHash: b.promptHash,
    modelId: b.modelId,
    output: b.output,
    toolCalls: b.toolCalls ?? [],
    proposedOrders: b.proposedOrders ?? [],
    guardrailResult: b.guardrailResult,
    guardrailDetail: b.guardrailDetail ?? {},
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    costUsd: Number(b.costUsd).toFixed(6),
  };
}

export async function appendDecision(db: Db, body: DecisionBody) {
  return db.transaction(async (tx) => {
    // Serialize appends per agent version so two writers can't fork the chain.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${body.agentVersionId}))`);
    const [last] = await tx
      .select({ seq: decisionLogs.seq, hash: decisionLogs.hash })
      .from(decisionLogs)
      .where(eq(decisionLogs.agentVersionId, body.agentVersionId))
      .orderBy(desc(decisionLogs.seq))
      .limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const hash = decisionHash(prevHash, hashable(seq, body));
    const [row] = await tx
      .insert(decisionLogs)
      .values({ ...body, costUsd: Number(body.costUsd).toFixed(6), seq, prevHash, hash })
      .returning();
    return row!;
  });
}

/** Index of the first broken entry in a version's chain, or -1 if intact. */
export async function verifyDecisionChain(db: Db, agentVersionId: string): Promise<number> {
  const rows = await db.select().from(decisionLogs).where(eq(decisionLogs.agentVersionId, agentVersionId)).orderBy(decisionLogs.seq);
  return verifyChain(rows.map((r) => ({ prevHash: r.prevHash, hash: r.hash, body: hashable(r.seq, r) })));
}
