// The Spend page: a developer's AI spend this month against the cap (hard rule 7).
import { MONTHLY_AI_SPEND_CAP_USD, type AgentModel } from "@tradent/core";
import { and, desc, eq, gte, sql } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";

export interface SpendSummary {
  /** First day of the month, UTC, as the ledger keys it. */
  month: string;
  spent: number;
  cap: number;
  atCap: boolean;
  /** Forward-test decisions, smoke tests, and the rest (the Studio chat builder). */
  parts: { forwardTests: number; smokeTests: number; builder: number };
  byVersion: { versionId: string; agentName: string; version: number; model: AgentModel; decisions: number; costUsd: number }[];
  history: { month: string; spent: number }[];
}

export async function getSpendSummary(db: Db, ownerId: string, now = new Date()): Promise<SpendSummary> {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const from = new Date(`${month}T00:00:00Z`);

  const history = await db
    .select({ month: s.spendLedger.month, spent: s.spendLedger.dollarsSpent })
    .from(s.spendLedger)
    .where(eq(s.spendLedger.developerId, ownerId))
    .orderBy(desc(s.spendLedger.month))
    .limit(6);
  const spent = Number(history.find((h) => h.month === month)?.spent ?? 0);

  const byVersion = await db
    .select({
      versionId: s.agentVersions.id,
      agentName: s.agents.name,
      version: s.agentVersions.version,
      model: s.agentVersions.model,
      decisions: sql<number>`count(*)::int`,
      costUsd: sql<string>`sum(${s.decisionLogs.costUsd})`,
    })
    .from(s.decisionLogs)
    .innerJoin(s.agentVersions, eq(s.decisionLogs.agentVersionId, s.agentVersions.id))
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .where(and(eq(s.agents.ownerId, ownerId), gte(s.decisionLogs.decidedAt, from)))
    .groupBy(s.agentVersions.id, s.agents.name)
    .orderBy(desc(sql`sum(${s.decisionLogs.costUsd})`));

  const [smoke] = await db
    .select({ cost: sql<string>`coalesce(sum((${s.smokeTestRuns.result} ->> 'costUsd')::numeric), 0)` })
    .from(s.smokeTestRuns)
    .innerJoin(s.agentVersions, eq(s.smokeTestRuns.agentVersionId, s.agentVersions.id))
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .where(and(eq(s.agents.ownerId, ownerId), gte(s.smokeTestRuns.startedAt, from)));

  const forwardTests = byVersion.reduce((sum, v) => sum + Number(v.costUsd), 0);
  const smokeTests = Number(smoke?.cost ?? 0);
  return {
    month,
    spent,
    cap: MONTHLY_AI_SPEND_CAP_USD,
    atCap: spent >= MONTHLY_AI_SPEND_CAP_USD,
    // The ledger has no per-call rows, so the builder's share is what the other two don't explain.
    parts: { forwardTests, smokeTests, builder: Math.max(0, spent - forwardTests - smokeTests) },
    byVersion: byVersion.map((v) => ({ ...v, costUsd: Number(v.costUsd) })),
    history: history.map((h) => ({ month: h.month, spent: Number(h.spent) })),
  };
}
