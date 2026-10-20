// Developer-only reads for the Forward tests page, and the kill switch.
// These may show a developer their own decision log in full, but still never
// select instructions: the page has no need for them.
import { LISTING_MIN_TRADES, LISTING_MIN_TRADING_DAYS } from "@tradent/core";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { verifyDecisionChain } from "./decision-log";
import { publicVersions, withRecords, type PublicVersion } from "./library";

export interface ForwardTest extends PublicVersion {
  agentStatus: string;
  aiSpendUsd: number;
  decisions: number;
  /** 0 to 1 toward the listing rule: the lower of the days and trades progress. */
  progress: { days: number; trades: number };
}

async function spendByVersion(db: Db, versionIds: string[]) {
  if (versionIds.length === 0) return new Map<string, { spend: number; decisions: number }>();
  const rows = await db
    .select({ versionId: s.decisionLogs.agentVersionId, spend: sql<string>`coalesce(sum(${s.decisionLogs.costUsd}), 0)`, decisions: sql<number>`count(*)::int` })
    .from(s.decisionLogs)
    .where(inArray(s.decisionLogs.agentVersionId, versionIds))
    .groupBy(s.decisionLogs.agentVersionId);
  return new Map(rows.map((r) => [r.versionId, { spend: Number(r.spend), decisions: r.decisions }]));
}

/** Every forward test (locked version with a paper account) of one developer, newest first. */
export async function listForwardTests(db: Db, ownerId: string): Promise<ForwardTest[]> {
  const rows = await publicVersions(db)
    .where(and(eq(s.agents.ownerId, ownerId), isNotNull(s.agentVersions.lockedAt)))
    .orderBy(desc(s.agentVersions.lockedAt));
  const versions = await withRecords(db, rows);
  const spend = await spendByVersion(db, versions.map((v) => v.versionId));
  const statuses = versions.length
    ? new Map(
        (await db.select({ id: s.agents.id, status: s.agents.status }).from(s.agents).where(inArray(s.agents.id, [...new Set(versions.map((v) => v.agentId))]))).map((a) => [a.id, a.status]),
      )
    : new Map<string, string>();
  return versions.map((v) => ({
    ...v,
    agentStatus: statuses.get(v.agentId) ?? "forward_testing",
    aiSpendUsd: spend.get(v.versionId)?.spend ?? 0,
    decisions: spend.get(v.versionId)?.decisions ?? 0,
    progress: { days: Math.min(1, v.tradingDays / LISTING_MIN_TRADING_DAYS), trades: Math.min(1, v.trades / LISTING_MIN_TRADES) },
  }));
}

export interface LoggedDecision {
  id: string;
  seq: number;
  decidedAt: Date;
  modelId: string;
  reasoning: string | null;
  proposedOrders: unknown[];
  guardrailResult: "approved" | "rejected" | "no_action";
  guardrailReasons: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ForwardTestDetail {
  test: ForwardTest;
  dailyMetrics: { date: string; equity: number; dailyReturn: number; maxDrawdown: number; tradeCount: number }[];
  decisions: LoggedDecision[];
  /** Index of the first broken decision-log entry, or -1 if the chain verifies. */
  chainBreak: number;
}

/** Guardrail reasons from a decision's stored detail, one line per rejected order. */
export function guardrailReasons(detail: unknown): string[] {
  const checks = (detail as { checks?: { symbol: string; approved: boolean; reasons: string[] }[] } | null)?.checks ?? [];
  const reasons = checks.filter((c) => !c.approved).flatMap((c) => c.reasons.map((r) => `${c.symbol}: ${r}`));
  if ((detail as { stopForDay?: boolean } | null)?.stopForDay) reasons.push("Daily loss stop reached; the agent stops for the day");
  return reasons;
}

export const decisionColumns = {
  id: s.decisionLogs.id,
  seq: s.decisionLogs.seq,
  decidedAt: s.decisionLogs.decidedAt,
  modelId: s.decisionLogs.modelId,
  reasoning: sql<string | null>`${s.decisionLogs.output} ->> 'reasoning'`,
  proposedOrders: s.decisionLogs.proposedOrders,
  guardrailResult: s.decisionLogs.guardrailResult,
  guardrailDetail: s.decisionLogs.guardrailDetail,
  inputTokens: s.decisionLogs.inputTokens,
  outputTokens: s.decisionLogs.outputTokens,
  costUsd: s.decisionLogs.costUsd,
};

export function toLoggedDecision(d: { guardrailDetail: unknown; costUsd: string; proposedOrders: unknown } & Omit<LoggedDecision, "guardrailReasons" | "costUsd" | "proposedOrders">): LoggedDecision {
  const { guardrailDetail, ...rest } = d;
  return { ...rest, proposedOrders: Array.isArray(d.proposedOrders) ? d.proposedOrders : [], costUsd: Number(d.costUsd), guardrailReasons: guardrailReasons(guardrailDetail) };
}

/** One of the developer's forward tests, or null if it isn't theirs. */
export async function getForwardTest(db: Db, ownerId: string, versionId: string): Promise<ForwardTestDetail | null> {
  const test = (await listForwardTests(db, ownerId)).find((t) => t.versionId === versionId);
  if (!test) return null;
  const metrics = await db
    .select({ date: s.dailyMetrics.date, equity: s.dailyMetrics.equity, dailyReturn: s.dailyMetrics.dailyReturn, maxDrawdown: s.dailyMetrics.maxDrawdown, tradeCount: s.dailyMetrics.tradeCount })
    .from(s.dailyMetrics)
    .where(eq(s.dailyMetrics.agentVersionId, versionId))
    .orderBy(asc(s.dailyMetrics.date));
  const decisions = await db.select(decisionColumns).from(s.decisionLogs).where(eq(s.decisionLogs.agentVersionId, versionId)).orderBy(desc(s.decisionLogs.seq)).limit(200);
  return {
    test,
    dailyMetrics: metrics.map((m) => ({ date: m.date, equity: Number(m.equity), dailyReturn: Number(m.dailyReturn), maxDrawdown: Number(m.maxDrawdown), tradeCount: m.tradeCount })),
    decisions: decisions.map(toLoggedDecision),
    chainBreak: await verifyDecisionChain(db, versionId),
  };
}

/** Turn an agent's kill switch on or off. Only its developer or an admin may. */
export async function setKillSwitch(db: Db, actor: { id: string; isAdmin: boolean }, agentId: string, killed: boolean): Promise<boolean> {
  const updated = await db
    .update(s.agents)
    .set({ killed })
    .where(actor.isAdmin ? eq(s.agents.id, agentId) : and(eq(s.agents.id, agentId), eq(s.agents.ownerId, actor.id)))
    .returning({ id: s.agents.id });
  return updated.length === 1;
}
