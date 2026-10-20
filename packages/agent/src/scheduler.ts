// Decides which agent versions run now, and writes DailyMetrics after the close
// (CLAUDE.md build step 4). The worker calls these on a timer.
import { and, eq, gte, inArray, isNotNull, lt, sql } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import type { BrokerAdapter } from "@tradent/broker";
import { updateListingStatus } from "./library";
import { runDecision, type RunResult, type RunnerDeps } from "./runner";

const ACTIVE = ["forward_testing", "listed"] as const;

// DEFAULT: daily metrics are written this many minutes after the close.
export const METRICS_DELAY_MINUTES = 5;

/** The date and "HH:MM" time in New York for an instant. */
export function newYorkTime(d: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Locked versions of active agents with a funded paper account whose cadence
 * has elapsed since their last logged decision. Killed agents are left out.
 */
export async function dueVersions(db: Db, now: Date): Promise<{ versionId: string; ownerId: string }[]> {
  const last = db
    .select({ versionId: s.decisionLogs.agentVersionId, at: sql<Date>`max(${s.decisionLogs.decidedAt})`.as("at") })
    .from(s.decisionLogs)
    .groupBy(s.decisionLogs.agentVersionId)
    .as("last");
  return db
    .select({ versionId: s.agentVersions.id, ownerId: s.agents.ownerId })
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .innerJoin(s.paperAccounts, eq(s.paperAccounts.agentVersionId, s.agentVersions.id))
    .leftJoin(last, eq(last.versionId, s.agentVersions.id))
    .where(
      and(
        isNotNull(s.agentVersions.lockedAt),
        isNotNull(s.paperAccounts.externalAccountId),
        inArray(s.agents.status, [...ACTIVE]),
        eq(s.agents.killed, false),
        sql`(${last.at} is null or ${last.at} <= ${now.toISOString()}::timestamptz - make_interval(mins => ${s.agentVersions.cadenceMinutes}))`,
      ),
    );
}

export interface TickResult {
  marketOpen: boolean;
  results: { versionId: string; result: RunResult | { status: "error"; message: string } }[];
}

/**
 * Run every due version once. A developer's versions run one after another so
 * the spend cap is checked against up-to-date spend; developers run in parallel.
 */
export async function tick(deps: RunnerDeps): Promise<TickResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (!(await deps.broker.getClock()).isOpen) return { marketOpen: false, results: [] };

  const byOwner = new Map<string, string[]>();
  for (const v of await dueVersions(deps.db, now)) byOwner.set(v.ownerId, [...(byOwner.get(v.ownerId) ?? []), v.versionId]);

  const results: TickResult["results"] = [];
  await Promise.all(
    [...byOwner.values()].map(async (versionIds) => {
      for (const versionId of versionIds) {
        try {
          results.push({ versionId, result: await runDecision(deps, versionId) });
        } catch (e) {
          results.push({ versionId, result: { status: "error", message: (e as Error).message } });
        }
      }
    }),
  );
  return { marketOpen: true, results };
}

/** The trading day whose metrics are due now, or null (not a trading day, or the close is too recent). */
export async function metricsDueDate(broker: BrokerAdapter, now: Date): Promise<string | null> {
  const ny = newYorkTime(now);
  const [day] = await broker.getCalendar(ny.date, ny.date);
  if (!day || day.date !== ny.date) return null;
  return ny.time >= addMinutes(day.close, METRICS_DELAY_MINUTES) ? ny.date : null;
}

/**
 * One DailyMetrics row per active version for a trading day, from the broker's
 * account equity. Rows already written are left alone, so this is safe to re-run.
 */
export async function writeDailyMetrics(db: Db, broker: BrokerAdapter, date: string, onlyVersionIds?: string[]): Promise<number> {
  const versions = await db
    .select({ versionId: s.agentVersions.id, accountId: s.paperAccounts.id, externalAccountId: s.paperAccounts.externalAccountId, startingCash: s.paperAccounts.startingCash })
    .from(s.agentVersions)
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .innerJoin(s.paperAccounts, eq(s.paperAccounts.agentVersionId, s.agentVersions.id))
    // Killed agents still hold positions, so their record keeps going.
    .where(
      and(
        isNotNull(s.agentVersions.lockedAt),
        isNotNull(s.paperAccounts.externalAccountId),
        inArray(s.agents.status, [...ACTIVE]),
        onlyVersionIds ? inArray(s.agentVersions.id, onlyVersionIds) : undefined,
      ),
    );

  // Fills are dated by the New York trading day they happened on.
  const dayStart = sql`(${date}::date)::timestamp at time zone 'America/New_York'`;
  const dayEnd = sql`(${date}::date + 1)::timestamp at time zone 'America/New_York'`;

  let written = 0;
  for (const v of versions) {
    // Already written: skip before asking the broker, so repeated passes stay cheap.
    const [done] = await db.select({ date: s.dailyMetrics.date }).from(s.dailyMetrics).where(and(eq(s.dailyMetrics.agentVersionId, v.versionId), eq(s.dailyMetrics.date, date)));
    if (done) continue;
    const history = await db
      .select({ equity: s.dailyMetrics.equity, maxDrawdown: s.dailyMetrics.maxDrawdown })
      .from(s.dailyMetrics)
      .where(and(eq(s.dailyMetrics.agentVersionId, v.versionId), lt(s.dailyMetrics.date, date)))
      .orderBy(s.dailyMetrics.date);
    const startingCash = Number(v.startingCash);
    const prevEquity = history.length ? Number(history[history.length - 1]!.equity) : startingCash;
    const equity = (await broker.getAccount(v.externalAccountId!)).equity;
    const peak = Math.max(startingCash, equity, ...history.map((h) => Number(h.equity)));
    const priorDrawdown = history.length ? Number(history[history.length - 1]!.maxDrawdown) : 0;
    const maxDrawdown = Math.max(priorDrawdown, peak > 0 ? (peak - equity) / peak : 0);

    const [trades] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.fills)
      .innerJoin(s.orders, eq(s.fills.orderId, s.orders.id))
      .where(and(eq(s.orders.paperAccountId, v.accountId), gte(s.fills.filledAt, dayStart), lt(s.fills.filledAt, dayEnd)));

    const inserted = await db
      .insert(s.dailyMetrics)
      .values({
        agentVersionId: v.versionId,
        date,
        equity: equity.toFixed(6),
        dailyReturn: (prevEquity > 0 ? equity / prevEquity - 1 : 0).toFixed(8),
        maxDrawdown: maxDrawdown.toFixed(8),
        tradeCount: trades?.n ?? 0,
      })
      .onConflictDoNothing()
      .returning({ date: s.dailyMetrics.date });
    written += inserted.length;
  }
  return written;
}

// DEFAULT: a pass holds the scheduler lease for at most 5 minutes, so a crashed pass can't block the next ones for long.
const LEASE_SECONDS = 300;

export type PassEvent = { event: string } & Record<string, unknown>;

/**
 * One scheduler pass: due decisions while the market is open, otherwise the
 * day's DailyMetrics and listing updates once the close has settled. Safe to
 * repeat; overlapping passes are skipped. The worker and the cron endpoint both call this.
 */
export async function schedulerPass(deps: RunnerDeps): Promise<PassEvent[]> {
  const now = (deps.now ?? (() => new Date()))();
  const until = new Date(now.getTime() + LEASE_SECONDS * 1000);
  const [lease] = await deps.db
    .insert(s.schedulerLeases)
    .values({ name: "scheduler", heldUntil: until })
    .onConflictDoUpdate({ target: s.schedulerLeases.name, set: { heldUntil: until }, where: lt(s.schedulerLeases.heldUntil, now) })
    .returning({ heldUntil: s.schedulerLeases.heldUntil });
  if (!lease) return [{ event: "skipped", reason: "another pass is running" }];

  const events: PassEvent[] = [];
  try {
    const { marketOpen, results } = await tick(deps);
    for (const r of results) events.push({ event: "decision", versionId: r.versionId, ...r.result });
    if (!marketOpen) {
      const date = await metricsDueDate(deps.broker, now);
      if (date) {
        events.push({ event: "daily_metrics", date, written: await writeDailyMetrics(deps.db, deps.broker, date) });
        events.push({ event: "listing", newlyListed: await updateListingStatus(deps.db) });
      }
    }
  } finally {
    await deps.db.delete(s.schedulerLeases).where(eq(s.schedulerLeases.name, "scheduler"));
  }
  return events;
}
