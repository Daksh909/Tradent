// One agent decision, end to end (SPEC.md "One agent decision, end to end").
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, isNull, sql } from "@tradent/db";
import { MONTHLY_AI_SPEND_CAP_USD, SITE_MONTHLY_AI_SPEND_CAP_USD, type AgentModel, type RiskLimits } from "@tradent/core";
import type { AccountSummary, BrokerAdapter, Quote } from "@tradent/broker";
import * as s from "@tradent/db";
import type { Db } from "@tradent/db";
import { appendDecision } from "./decision-log";
import { checkOrders, dailyLossHit, type ProposedOrder } from "./guardrails";
import { MODEL_IDS, responseCost } from "./pricing";

/** The slice of the Anthropic client the runner uses, so tests can fake it. */
export interface MessagesClient {
  beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> } };
}

export interface RunnerDeps {
  db: Db;
  broker: BrokerAdapter;
  anthropic: MessagesClient;
  now?: () => Date;
}

export type RunResult =
  | { status: "skipped"; reason: "not_forward_testing" | "killed" | "spend_cap" | "market_closed" | "daily_loss_stop" }
  | { status: "decided"; decisionId: string; guardrailResult: "approved" | "rejected" | "no_action"; ordersSubmitted: number; costUsd: number };

// DEFAULT: at most this many model turns per decision.
const MAX_TURNS = 6;
// DEFAULT: effort for trading decisions.
const EFFORT = "medium" as const;

export const PROPOSE_TOOL = "propose_orders";

/** Read-only tools a developer can give an agent; propose_orders is always on. */
export const DATA_TOOLS = ["get_quotes", "get_bars", "get_option_chain", "get_recent_fills"] as const;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_quotes",
    description: "Latest IEX real-time bid and ask for one or more US equity symbols.",
    input_schema: { type: "object", properties: { symbols: { type: "array", items: { type: "string" } } }, required: ["symbols"], additionalProperties: false },
    strict: true,
  },
  {
    name: "get_bars",
    description: "Price bars (IEX) for one equity symbol over the last N days.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        timeframe: { type: "string", enum: ["1Min", "5Min", "15Min", "1Hour", "1Day"] },
        days: { type: "integer", description: "How many days back, 1 to 60" },
      },
      required: ["symbol", "timeframe", "days"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_option_chain",
    description: "Option contract snapshots (indicative feed) for an underlying equity symbol.",
    input_schema: { type: "object", properties: { underlying: { type: "string" } }, required: ["underlying"], additionalProperties: false },
    strict: true,
  },
  {
    name: "get_recent_fills",
    description: "This paper account's fills reported by the broker, oldest first.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: PROPOSE_TOOL,
    description:
      "Submit this decision. Call it exactly once, last, with an empty orders list when no trade is warranted. Orders are checked against risk limits before anything reaches the broker.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string", description: "Plain-language summary of why, shown in the trust record" },
        orders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              symbol: { type: "string", description: "Equity ticker, or OCC option contract symbol" },
              instrument: { type: "string", enum: ["equity", "option"] },
              side: { type: "string", enum: ["buy", "sell"] },
              quantity: { type: "number", description: "Shares, or contracts for options" },
              type: { type: "string", enum: ["market", "limit"] },
              limit_price: { type: ["number", "null"], description: "Required for limit orders; null for market orders" },
            },
            required: ["symbol", "instrument", "side", "quantity", "type", "limit_price"],
            additionalProperties: false,
          },
        },
      },
      required: ["reasoning", "orders"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const PLATFORM_SYSTEM = `You are a trading agent on a paper-trading platform for US equities and listed options.
Each turn you get a snapshot of your paper account. Use the read-only tools if you need more data, then call ${PROPOSE_TOOL} exactly once to finish.
Your orders are checked against risk limits by the platform, and orders that break them are rejected and logged.
Options orders must be limit orders. Do not sell more than you hold.
The developer's instructions for this agent follow.`;

interface ProposalInput {
  reasoning: string;
  orders: { symbol: string; instrument: "equity" | "option"; side: "buy" | "sell"; quantity: number; type: "market" | "limit"; limit_price: number | null }[];
}

function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function monthlySpend(db: Db, developerId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ dollars: s.spendLedger.dollarsSpent })
    .from(s.spendLedger)
    .where(and(eq(s.spendLedger.developerId, developerId), eq(s.spendLedger.month, monthStart(now))));
  return Number(row?.dollars ?? 0);
}

/** All developers' AI spend this month. */
export async function siteMonthlySpend(db: Db, now: Date): Promise<number> {
  const [row] = await db
    .select({ dollars: sql<string>`coalesce(sum(${s.spendLedger.dollarsSpent}), 0)` })
    .from(s.spendLedger)
    .where(eq(s.spendLedger.month, monthStart(now)));
  return Number(row?.dollars ?? 0);
}

/** The site-wide cap; TRADENT_SITE_AI_CAP_USD overrides the default. */
export function siteSpendCapUsd(): number {
  const v = Number(process.env.TRADENT_SITE_AI_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : SITE_MONTHLY_AI_SPEND_CAP_USD;
}

/** Which cap, if any, stops this developer's AI calls now. */
export async function spendCapReached(db: Db, developerId: string, now: Date, siteCap = siteSpendCapUsd()): Promise<"developer" | "site" | null> {
  if ((await monthlySpend(db, developerId, now)) >= MONTHLY_AI_SPEND_CAP_USD) return "developer";
  if ((await siteMonthlySpend(db, now)) >= siteCap) return "site";
  return null;
}

export async function addSpend(db: Db, developerId: string, now: Date, dollars: number) {
  await db
    .insert(s.spendLedger)
    .values({ developerId, month: monthStart(now), dollarsSpent: dollars.toFixed(6) })
    .onConflictDoUpdate({
      target: [s.spendLedger.developerId, s.spendLedger.month],
      set: { dollarsSpent: sql`${s.spendLedger.dollarsSpent} + ${dollars.toFixed(6)}` },
    });
}

function midPrice(q: Quote): number {
  if (q.bid > 0 && q.ask > 0) return (q.bid + q.ask) / 2;
  return q.ask || q.bid;
}

export async function runDecision(deps: RunnerDeps, agentVersionId: string): Promise<RunResult> {
  const { db, broker, anthropic } = deps;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();

  const version = await db.query.agentVersions.findFirst({ where: eq(s.agentVersions.id, agentVersionId), with: { agent: true } });
  if (!version) throw new Error(`Unknown agent version ${agentVersionId}`);
  const [account] = await db.select().from(s.paperAccounts).where(eq(s.paperAccounts.agentVersionId, agentVersionId));
  if (!account?.externalAccountId) throw new Error(`Agent version ${agentVersionId} has no funded paper account`);

  // Step 1: only forward-testing, live agents whose developer is under the cap, during market hours.
  if (version.agent.killed) return { status: "skipped", reason: "killed" };
  if (version.agent.status !== "forward_testing" && version.agent.status !== "listed") return { status: "skipped", reason: "not_forward_testing" };
  if (await spendCapReached(db, version.agent.ownerId, startedAt)) return { status: "skipped", reason: "spend_cap" };
  if (!(await broker.getClock()).isOpen) return { status: "skipped", reason: "market_closed" };

  const riskLimits = version.riskLimits as RiskLimits;
  const brokerAccountId = account.externalAccountId;
  const summary = await broker.getAccount(brokerAccountId);
  if (dailyLossHit(summary, riskLimits)) return { status: "skipped", reason: "daily_loss_stop" };

  const alerts = await db
    .select({ id: s.signalAlerts.id, payload: s.signalAlerts.payload, receivedAt: s.signalAlerts.receivedAt })
    .from(s.signalAlerts)
    .innerJoin(s.signalSources, eq(s.signalAlerts.signalSourceId, s.signalSources.id))
    .where(and(eq(s.signalSources.agentId, version.agentId), isNull(s.signalAlerts.consumedByDecisionId)));

  // Steps 2-4: the model decides, then guardrails check its orders.
  const { inputsSnapshot, promptHash, servedBy, output, toolCalls, proposedOrders, outcome, inputTokens, outputTokens, costUsd } = await decide(anthropic, {
    model: version.model as AgentModel,
    instructions: version.instructions,
    riskLimits,
    killed: version.agent.killed,
    broker,
    brokerAccountId,
    account: summary,
    alerts: alerts.map((a) => ({ payload: a.payload, receivedAt: a.receivedAt.toISOString() })),
    tools: version.tools,
    now: startedAt,
  });

  // Step 6 comes first: the decision is written before any order is sent.
  const decision = await appendDecision(db, {
    agentVersionId,
    decidedAt: startedAt,
    inputsSnapshot,
    promptHash,
    modelId: servedBy,
    output,
    toolCalls,
    proposedOrders,
    guardrailResult: outcome.result,
    guardrailDetail: { stopForDay: outcome.stopForDay, checks: outcome.checks.map((c) => ({ symbol: c.order.symbol, approved: c.approved, reasons: c.reasons })) },
    inputTokens,
    outputTokens,
    costUsd: costUsd.toFixed(6),
  });
  await addSpend(db, version.agent.ownerId, startedAt, costUsd);
  if (alerts.length) {
    for (const a of alerts) await db.update(s.signalAlerts).set({ consumedByDecisionId: decision.id }).where(eq(s.signalAlerts.id, a.id));
  }

  // Step 5: approved orders go to the broker; our order id is the client order id.
  let ordersSubmitted = 0;
  for (const check of outcome.checks.filter((c) => c.approved)) {
    const o = check.order;
    const [row] = await db
      .insert(s.orders)
      .values({
        decisionId: decision.id,
        paperAccountId: account.id,
        symbol: o.symbol,
        instrument: o.instrument,
        side: o.side,
        quantity: String(o.quantity),
        type: o.type,
        limitPrice: o.limitPrice === undefined ? null : String(o.limitPrice),
      })
      .returning();
    try {
      const placed = await broker.submitOrder(brokerAccountId, { ...o, clientOrderId: row!.id });
      await db.update(s.orders).set({ brokerOrderId: placed.brokerOrderId, brokerStatus: placed.status }).where(eq(s.orders.id, row!.id));
      ordersSubmitted++;
    } catch (e) {
      await db.update(s.orders).set({ brokerStatus: `submit_failed: ${(e as Error).message}`.slice(0, 500) }).where(eq(s.orders.id, row!.id));
    }
  }
  await syncFills(db, broker, account.id, brokerAccountId);

  return { status: "decided", decisionId: decision.id, guardrailResult: outcome.result, ordersSubmitted, costUsd };
}

export interface DecisionContext {
  model: AgentModel;
  instructions: string;
  riskLimits: RiskLimits;
  killed: boolean;
  /** Market data and the account the tools read. */
  broker: BrokerAdapter;
  brokerAccountId: string;
  account: AccountSummary;
  alerts: { payload: unknown; receivedAt: string }[];
  /** The version's tools; propose_orders is always offered. Empty means every tool. */
  tools: string[];
  now: Date;
}

/**
 * The model's decision and the guardrail check, without writing or sending
 * anything. runDecision logs and acts on it; the smoke test only shows it.
 */
export async function decide(anthropic: MessagesClient, ctx: DecisionContext) {
  const { broker, brokerAccountId, riskLimits } = ctx;
  const positions = await broker.getPositions(brokerAccountId);
  const watch = [...new Set([...riskLimits.allowedSymbols, ...positions.filter((p) => p.instrument === "equity").map((p) => p.symbol)])];
  const quotes = watch.length ? await broker.getLatestQuotes(watch) : [];

  const inputsSnapshot = {
    time: ctx.now.toISOString(),
    account: ctx.account,
    positions,
    quotes,
    tradingViewAlerts: ctx.alerts,
    riskLimits,
  };

  const model = MODEL_IDS[ctx.model];
  const system = `${PLATFORM_SYSTEM}\n\n${ctx.instructions}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Account snapshot:\n${JSON.stringify(inputsSnapshot, null, 2)}` },
  ];
  const tools = ctx.tools.length ? TOOLS.filter((t) => t.name === PROPOSE_TOOL || ctx.tools.includes(t.name)) : TOOLS;
  const promptHash = createHash("sha256").update(JSON.stringify({ system, tools })).digest("hex");
  const toolCalls: { name: string; input: unknown; result: unknown }[] = [];
  let proposal: ProposalInput | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let servedBy = model;
  let stopReason: string | null = null;
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS && !proposal; turn++) {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      tools,
      messages,
      output_config: { effort: EFFORT },
      // Server-side fallback on a policy decline; Haiku has none.
      ...(ctx.model === "haiku" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    });
    inputTokens += res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
    outputTokens += res.usage.output_tokens;
    costUsd += responseCost(model, res.usage);
    servedBy = res.model;
    stopReason = res.stop_reason;
    finalText = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n") || finalText;
    if (res.stop_reason === "refusal") break;

    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      let result: unknown;
      let isError = false;
      try {
        if (!tools.some((t) => t.name === use.name)) throw new Error(`Tool ${use.name} isn't enabled for this agent`);
        result = await runTool(broker, brokerAccountId, use, ctx.now);
        if (use.name === PROPOSE_TOOL) proposal = use.input as ProposalInput;
      } catch (e) {
        isError = true;
        result = { error: (e as Error).message };
      }
      toolCalls.push({ name: use.name, input: use.input, result });
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result), is_error: isError });
    }
    if (!proposal) messages.push({ role: "user", content: results });
  }

  // TypeScript can't see the assignment inside the loop's try block.
  const final = proposal as ProposalInput | null;

  // Guardrails, outside the model.
  const proposedOrders: ProposedOrder[] = (final?.orders ?? []).map((o) => ({
    symbol: o.symbol.toUpperCase(),
    instrument: o.instrument,
    side: o.side,
    quantity: o.quantity,
    type: o.type,
    ...(o.limit_price === null ? {} : { limitPrice: o.limit_price }),
  }));
  const prices: Record<string, number> = Object.fromEntries(quotes.map((q) => [q.symbol, midPrice(q)]));
  const missing = proposedOrders.filter((o) => o.instrument === "equity" && prices[o.symbol] === undefined).map((o) => o.symbol);
  if (missing.length) for (const q of await broker.getLatestQuotes([...new Set(missing)])) prices[q.symbol] = midPrice(q);
  const outcome = checkOrders({ orders: proposedOrders, riskLimits, account: ctx.account, positions, prices, killed: ctx.killed });

  return {
    inputsSnapshot,
    promptHash,
    servedBy,
    output: { reasoning: final?.reasoning ?? null, text: finalText, stopReason, proposalMade: final !== null },
    toolCalls,
    proposedOrders,
    outcome,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

async function runTool(broker: BrokerAdapter, accountId: string, use: Anthropic.Beta.BetaToolUseBlock, now: Date): Promise<unknown> {
  const input = use.input as Record<string, any>;
  switch (use.name) {
    case "get_quotes":
      return broker.getLatestQuotes((input.symbols as string[]).slice(0, 20));
    case "get_bars": {
      const days = Math.min(Math.max(Number(input.days) || 1, 1), 60);
      return broker.getBars(input.symbol, input.timeframe, { start: new Date(now.getTime() - days * 86_400_000).toISOString() });
    }
    case "get_option_chain":
      return broker.getOptionChain(input.underlying);
    case "get_recent_fills":
      return broker.getFills(accountId);
    case PROPOSE_TOOL:
      return { recorded: true };
    default:
      throw new Error(`Unknown tool ${use.name}`);
  }
}

/** Copy the broker's fills into our tables; fills never come from anywhere else. */
export async function syncFills(db: Db, broker: BrokerAdapter, paperAccountId: string, brokerAccountId: string) {
  const fills = await broker.getFills(brokerAccountId);
  if (fills.length === 0) return 0;
  const ours = await db.select({ id: s.orders.id, brokerOrderId: s.orders.brokerOrderId }).from(s.orders).where(eq(s.orders.paperAccountId, paperAccountId));
  const byBrokerId = new Map(ours.filter((o) => o.brokerOrderId).map((o) => [o.brokerOrderId!, o.id]));
  const rows = fills.flatMap((f) => {
    const orderId = byBrokerId.get(f.brokerOrderId);
    return orderId ? [{ orderId, brokerFillId: f.brokerFillId, price: String(f.price), quantity: String(f.quantity), filledAt: new Date(f.filledAt) }] : [];
  });
  if (rows.length === 0) return 0;
  const inserted = await db.insert(s.fills).values(rows).onConflictDoNothing({ target: s.fills.brokerFillId }).returning({ id: s.fills.id });
  return inserted.length;
}
