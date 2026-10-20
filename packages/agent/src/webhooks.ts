// TradingView webhooks (CLAUDE.md hard rule 13). An alert is stored and handed
// to the agent's next scheduled decision; it never places or triggers an order.
// TradingView lets a user set only the webhook URL and the message body, so the
// per-agent secret travels in the URL. We keep only its SHA-256 hash.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, isNull } from "@tradent/db";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";

// DEFAULT: alert bodies up to 4 KB, and at most 50 alerts waiting for an agent's next decision.
export const MAX_ALERT_BYTES = 4096;
export const MAX_PENDING_ALERTS = 50;

const sha256 = (v: string) => createHash("sha256").update(v).digest();

export interface WebhookInfo {
  agentId: string;
  agentName: string;
  sourceId: string | null;
  createdAt: Date | null;
  pendingAlerts: number;
  /** Whether the agent's newest version reads TradingView alerts (set in Studio). */
  alertsOn: boolean;
}

/** A developer's agents with their webhook, if any. */
export async function listWebhooks(db: Db, ownerId: string): Promise<WebhookInfo[]> {
  const agents = await db.select({ id: s.agents.id, name: s.agents.name }).from(s.agents).where(eq(s.agents.ownerId, ownerId)).orderBy(asc(s.agents.name));
  const out: WebhookInfo[] = [];
  for (const a of agents) {
    const [src] = await db.select().from(s.signalSources).where(eq(s.signalSources.agentId, a.id));
    const [pending] = src
      ? await db.select({ n: count() }).from(s.signalAlerts).where(and(eq(s.signalAlerts.signalSourceId, src.id), isNull(s.signalAlerts.consumedByDecisionId)))
      : [{ n: 0 }];
    const [newest] = await db
      .select({ dataSources: s.agentVersions.dataSources })
      .from(s.agentVersions)
      .where(eq(s.agentVersions.agentId, a.id))
      .orderBy(desc(s.agentVersions.version))
      .limit(1);
    out.push({ agentId: a.id, agentName: a.name, sourceId: src?.id ?? null, createdAt: src?.createdAt ?? null, pendingAlerts: pending?.n ?? 0, alertsOn: !!newest?.dataSources.includes("TradingView alerts") });
  }
  return out;
}

/**
 * Creates the agent's webhook, or replaces its secret (the old URL stops working).
 * Returns the secret once; only its hash is stored. Owner only.
 */
export async function issueWebhookSecret(db: Db, ownerId: string, agentId: string): Promise<{ sourceId: string; secret: string } | null> {
  const [agent] = await db.select({ id: s.agents.id }).from(s.agents).where(and(eq(s.agents.id, agentId), eq(s.agents.ownerId, ownerId)));
  if (!agent) return null;
  const secret = randomBytes(24).toString("base64url");
  const webhookSecretHash = sha256(secret).toString("hex");
  const [existing] = await db.select({ id: s.signalSources.id }).from(s.signalSources).where(eq(s.signalSources.agentId, agentId));
  if (existing) {
    await db.update(s.signalSources).set({ webhookSecretHash }).where(eq(s.signalSources.id, existing.id));
    return { sourceId: existing.id, secret };
  }
  const [row] = await db.insert(s.signalSources).values({ agentId, webhookSecretHash }).returning({ id: s.signalSources.id });
  return { sourceId: row!.id, secret };
}

export type AlertResult = { status: 202 } | { status: 401 | 404 | 413 | 429; error: string };

/** Stores one incoming alert after checking the agent's secret. Never creates an order. */
export async function receiveAlert(db: Db, sourceId: string, secret: string, body: string): Promise<AlertResult> {
  const [src] = await db.select().from(s.signalSources).where(eq(s.signalSources.id, sourceId));
  // The same answer for an unknown source and a wrong secret, so neither can be probed.
  if (!src || !timingSafeEqual(sha256(secret), Buffer.from(src.webhookSecretHash, "hex"))) return { status: 401, error: "Unknown webhook or wrong secret" };
  if (Buffer.byteLength(body, "utf8") > MAX_ALERT_BYTES) return { status: 413, error: `Alert bodies are limited to ${MAX_ALERT_BYTES} bytes` };
  const [pending] = await db.select({ n: count() }).from(s.signalAlerts).where(and(eq(s.signalAlerts.signalSourceId, src.id), isNull(s.signalAlerts.consumedByDecisionId)));
  if ((pending?.n ?? 0) >= MAX_PENDING_ALERTS) return { status: 429, error: "Too many alerts waiting for this agent's next decision" };

  // TradingView sends the alert message as typed: JSON when it parses, otherwise plain text.
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = { text: body };
  }
  await db.insert(s.signalAlerts).values({ signalSourceId: src.id, payload: payload ?? { text: body } });
  return { status: 202 };
}
