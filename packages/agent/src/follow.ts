// Paper-follow (Decision 1): an investor follows a listed agent version with
// virtual money. The follower holds virtualAmount / agentEquityAtStart of
// everything the version's paper account holds, so their return tracks the
// agent's broker-backed record from the moment they follow. Nothing here places
// orders: mirrored trades are the agent's broker fills, scaled.
import type { BrokerAdapter, Position } from "@tradent/broker";
import { and, asc, desc, eq, gt, inArray, isNull } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { publicVersions, withRecords } from "./library";

// DEFAULT: virtual amounts from $1,000 to $1,000,000, $10,000 suggested.
export const MIN_FOLLOW_USD = 1_000;
export const MAX_FOLLOW_USD = 1_000_000;
export const DEFAULT_FOLLOW_USD = 10_000;

export class FollowError extends Error {}

/**
 * The account's equity now: the broker's live figure when it can be read,
 * otherwise the last DailyMetrics close, otherwise its starting cash.
 */
export async function accountEquity(db: Db, versionId: string, broker?: BrokerAdapter | null): Promise<number> {
  const [account] = await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, versionId));
  if (!account) throw new FollowError("This agent has no paper account.");
  if (broker && account.externalAccountId) {
    try {
      return (await broker.getAccount(account.externalAccountId)).equity;
    } catch (err) {
      console.error("broker equity unavailable, using the last close", err);
    }
  }
  const [last] = await db
    .select({ equity: s.dailyMetrics.equity })
    .from(s.dailyMetrics)
    .where(eq(s.dailyMetrics.agentVersionId, versionId))
    .orderBy(desc(s.dailyMetrics.date))
    .limit(1);
  return Number(last?.equity ?? account.startingCash);
}

/** Starts following a Library-listed version. One active follow per investor and version. */
export async function startFollow(db: Db, investorId: string, versionId: string, virtualAmount: number, broker?: BrokerAdapter | null) {
  if (!Number.isFinite(virtualAmount) || virtualAmount < MIN_FOLLOW_USD || virtualAmount > MAX_FOLLOW_USD)
    throw new FollowError(`Pick an amount from $${MIN_FOLLOW_USD.toLocaleString("en-US")} to $${MAX_FOLLOW_USD.toLocaleString("en-US")}.`);
  const [version] = await withRecords(db, await publicVersions(db).where(eq(s.agentVersions.id, versionId)));
  if (!version?.listed || version.killed) throw new FollowError("Only agents listed in the Library can be followed.");
  const [active] = await db
    .select({ id: s.follows.id })
    .from(s.follows)
    .where(and(eq(s.follows.investorId, investorId), eq(s.follows.agentVersionId, versionId), isNull(s.follows.stoppedAt)));
  if (active) throw new FollowError("You already follow this agent.");
  const equity = await accountEquity(db, versionId, broker);
  if (equity <= 0) throw new FollowError("This agent's account has no equity to follow.");
  const [row] = await db
    .insert(s.follows)
    .values({ investorId, agentVersionId: versionId, virtualAmount: virtualAmount.toFixed(2), agentEquityAtStart: equity.toFixed(6) })
    .returning();
  return row!;
}

/** Stops a follow, freezing its value at the account's equity now. */
export async function stopFollow(db: Db, investorId: string, followId: string, broker?: BrokerAdapter | null) {
  const [f] = await db
    .select()
    .from(s.follows)
    .where(and(eq(s.follows.id, followId), eq(s.follows.investorId, investorId), isNull(s.follows.stoppedAt)));
  if (!f) throw new FollowError("That follow isn't active.");
  const equity = await accountEquity(db, f.agentVersionId, broker);
  await db.update(s.follows).set({ stoppedAt: new Date(), agentEquityAtStop: equity.toFixed(6) }).where(eq(s.follows.id, f.id));
}

/** The agent's positions scaled to one follower. */
export function scalePositions(positions: Position[], scale: number): Position[] {
  return positions.map((p) => ({ ...p, quantity: p.quantity * scale, marketValue: p.marketValue * scale, unrealizedPl: p.unrealizedPl * scale }));
}

export interface MirroredFill {
  fillId: string;
  filledAt: Date;
  symbol: string;
  instrument: "equity" | "option";
  side: "buy" | "sell";
  /** The agent's broker fill quantity times the follow's scale. */
  quantity: number;
  price: number;
}

export interface FollowView {
  followId: string;
  versionId: string;
  agentId: string;
  agentName: string;
  version: number;
  startedAt: Date;
  stoppedAt: Date | null;
  virtualAmount: number;
  /** Share of the agent's account the follower holds. */
  scale: number;
  /** Value at the last close, or at the stop for a stopped follow. */
  value: number;
  /** Paper account id at the broker, for server-side position reads only. */
  externalAccountId: string | null;
  curve: { date: string; value: number }[];
  fills: MirroredFill[];
}

export interface Portfolio {
  active: FollowView[];
  stopped: FollowView[];
  /** Combined value of active follows per close, from the first follow onwards. */
  curve: { date: string; value: number }[];
  invested: number;
  value: number;
}

export async function getPortfolio(db: Db, investorId: string): Promise<Portfolio> {
  const rows = await db
    .select({
      followId: s.follows.id,
      versionId: s.follows.agentVersionId,
      agentId: s.agents.id,
      agentName: s.agents.name,
      version: s.agentVersions.version,
      startedAt: s.follows.startedAt,
      stoppedAt: s.follows.stoppedAt,
      virtualAmount: s.follows.virtualAmount,
      equityAtStart: s.follows.agentEquityAtStart,
      equityAtStop: s.follows.agentEquityAtStop,
      paperAccountId: s.paperAccounts.id,
      externalAccountId: s.paperAccounts.externalAccountId,
    })
    .from(s.follows)
    .innerJoin(s.agentVersions, eq(s.follows.agentVersionId, s.agentVersions.id))
    .innerJoin(s.agents, eq(s.agentVersions.agentId, s.agents.id))
    .innerJoin(s.paperAccounts, eq(s.paperAccounts.agentVersionId, s.agentVersions.id))
    .where(eq(s.follows.investorId, investorId))
    .orderBy(desc(s.follows.startedAt));

  const ids = [...new Set(rows.map((r) => r.versionId))];
  const metrics = ids.length
    ? await db
        .select({ versionId: s.dailyMetrics.agentVersionId, date: s.dailyMetrics.date, equity: s.dailyMetrics.equity })
        .from(s.dailyMetrics)
        .where(inArray(s.dailyMetrics.agentVersionId, ids))
        .orderBy(asc(s.dailyMetrics.date))
    : [];
  const fills = rows.length
    ? await db
        .select({
          paperAccountId: s.orders.paperAccountId,
          fillId: s.fills.id,
          filledAt: s.fills.filledAt,
          symbol: s.orders.symbol,
          instrument: s.orders.instrument,
          side: s.orders.side,
          quantity: s.fills.quantity,
          price: s.fills.price,
        })
        .from(s.fills)
        .innerJoin(s.orders, eq(s.fills.orderId, s.orders.id))
        .where(and(inArray(s.orders.paperAccountId, rows.map((r) => r.paperAccountId)), gt(s.fills.filledAt, rows.reduce((a, r) => (r.startedAt < a ? r.startedAt : a), rows[0]!.startedAt))))
        .orderBy(desc(s.fills.filledAt))
    : [];

  const views: FollowView[] = rows.map((r) => {
    const amount = Number(r.virtualAmount);
    const scale = amount / Number(r.equityAtStart);
    const startDay = r.startedAt.toISOString().slice(0, 10);
    const stopDay = r.stoppedAt?.toISOString().slice(0, 10);
    // DEFAULT: the first close counted is the one after the follow's start day.
    const closes = metrics.filter((m) => m.versionId === r.versionId && m.date > startDay && (!stopDay || m.date < stopDay));
    const curve = [{ date: startDay, value: amount }, ...closes.map((m) => ({ date: m.date, value: Number(m.equity) * scale }))];
    if (r.stoppedAt && r.equityAtStop) curve.push({ date: stopDay!, value: Number(r.equityAtStop) * scale });
    return {
      followId: r.followId,
      versionId: r.versionId,
      agentId: r.agentId,
      agentName: r.agentName,
      version: r.version,
      startedAt: r.startedAt,
      stoppedAt: r.stoppedAt,
      virtualAmount: amount,
      scale,
      value: curve[curve.length - 1]!.value,
      externalAccountId: r.externalAccountId,
      curve,
      fills: fills
        .filter((f) => f.paperAccountId === r.paperAccountId && f.filledAt > r.startedAt && (!r.stoppedAt || f.filledAt <= r.stoppedAt))
        .map((f) => ({ fillId: f.fillId, filledAt: f.filledAt, symbol: f.symbol, instrument: f.instrument, side: f.side, quantity: Number(f.quantity) * scale, price: Number(f.price) })),
    };
  });

  const active = views.filter((v) => !v.stoppedAt);
  // Each active follow's value on a date is its latest point on or before it.
  const dates = [...new Set(active.flatMap((v) => v.curve.map((p) => p.date)))].sort();
  const curve = dates.map((date) => ({
    date,
    value: active.reduce((sum, v) => sum + ([...v.curve].reverse().find((p) => p.date <= date)?.value ?? 0), 0),
  }));
  return {
    active,
    stopped: views.filter((v) => v.stoppedAt),
    curve,
    invested: active.reduce((sum, v) => sum + v.virtualAmount, 0),
    value: active.reduce((sum, v) => sum + v.value, 0),
  };
}

/** The investor's active follow of a version, for the Follow button. */
export async function activeFollow(db: Db, investorId: string, versionId: string) {
  const [f] = await db
    .select({ id: s.follows.id, virtualAmount: s.follows.virtualAmount })
    .from(s.follows)
    .where(and(eq(s.follows.investorId, investorId), eq(s.follows.agentVersionId, versionId), isNull(s.follows.stoppedAt)));
  return f ? { followId: f.id, virtualAmount: Number(f.virtualAmount) } : null;
}
