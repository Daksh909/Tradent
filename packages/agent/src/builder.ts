// The Studio chat builder: a developer describes a manual strategy in plain
// words and Claude drafts the agent (SPEC.md "Agent builder"). The draft is
// only a suggestion the developer edits; nothing is saved until they save.
import type Anthropic from "@anthropic-ai/sdk";
import { clampRiskLimits, type AgentModel } from "@tradent/core";
import type { Db } from "@tradent/db";
import { MODEL_IDS, responseCost } from "./pricing";
import { DATA_TOOLS, addSpend, spendCapReached, type MessagesClient } from "./runner";
import { CADENCES, StudioError, type Draft, type StrategyType } from "./studio";

// DEFAULT: the chat builder runs on Sonnet 5.5, and its cost counts toward the developer's $10 cap.
export const BUILDER_MODEL: AgentModel = "sonnet";
const DRAFT_TOOL = "draft_agent";

const STRATEGY_TYPES: StrategyType[] = ["entry_rule", "exit_rule", "signal", "tradingview_alert", "tool_setup"];

const TOOL: Anthropic.Beta.BetaTool = {
  name: DRAFT_TOOL,
  description: "Return the drafted agent and a short reply to the developer. Always call this once.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "A short, plain-language message to the developer: what you drafted and any question you have" },
      name: { type: "string", description: "Short agent name" },
      public_summary: { type: "string", description: "Two or three sentences investors will read. No hype, no promises of returns" },
      instructions: { type: "string", description: "The agent's private instructions: the full trading rules the model follows at each decision" },
      symbols: { type: "array", items: { type: "string" }, description: "US equity tickers the agent may trade" },
      model: { type: "string", enum: ["haiku", "sonnet", "opus"] },
      cadence_minutes: { type: "integer", enum: [...CADENCES], description: "Minutes between decisions during market hours" },
      tools: { type: "array", items: { type: "string", enum: [...DATA_TOOLS] }, description: "Read-only data tools the agent needs" },
      trading_view_alerts: { type: "boolean", description: "Whether the strategy is triggered by the developer's TradingView alerts" },
      max_position_pct: { type: "number", description: "Max share of equity in one position, 0 to 0.2" },
      max_daily_loss_pct: { type: "number", description: "Daily loss that stops the agent for the day, 0 to 0.05" },
      strategies: {
        type: "array",
        description: "The strategy as reusable building blocks",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: STRATEGY_TYPES },
            description: { type: "string", description: "One sentence, public" },
          },
          required: ["name", "type", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply", "name", "public_summary", "instructions", "symbols", "model", "cadence_minutes", "tools", "trading_view_alerts", "max_position_pct", "max_daily_loss_pct", "strategies"],
    additionalProperties: false,
  },
  strict: true,
};

const SYSTEM = `You help developers on a paper-trading platform turn a manual trading strategy into an AI trading agent.
The platform trades US equities and listed options on simulated (paper) accounts only.
At each decision the agent gets an account snapshot and may call read-only tools: get_quotes (IEX real-time quotes), get_bars (price bars), get_option_chain, get_recent_fills. It then proposes orders, which the platform checks against risk limits outside the model.
Platform limits: at most 20% of equity per position and a 5% daily loss stop; you may only tighten them. Options orders must be limit orders.
Decisions run only during the regular session. Pick the slowest cadence that fits the strategy, since each decision costs AI money and the developer has $10 a month.
Write the instructions as concrete rules the agent can follow from the data it has. Keep the public summary factual and free of performance claims.
If the developer's description leaves something important open, make a sensible choice, say what you chose in your reply, and ask about it.
When the developer sends a current draft, revise it rather than starting over.`;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface BuilderReply {
  reply: string;
  draft: Pick<Draft, "name" | "publicSummary" | "instructions" | "model" | "cadenceMinutes" | "symbols" | "tools" | "tradingViewAlerts" | "maxPositionPct" | "maxDailyLossPct" | "strategies">;
  costUsd: number;
}

interface DraftInput {
  reply: string;
  name: string;
  public_summary: string;
  instructions: string;
  symbols: string[];
  model: AgentModel;
  cadence_minutes: number;
  tools: string[];
  trading_view_alerts: boolean;
  max_position_pct: number;
  max_daily_loss_pct: number;
  strategies: { name: string; type: StrategyType; description: string }[];
}

/** One chat turn. The newest user message comes last in history; the current draft, if any, gives context. */
export async function chatWithBuilder(deps: { db: Db; anthropic: MessagesClient; now?: () => Date }, ownerId: string, history: ChatTurn[], current?: Partial<Draft>): Promise<BuilderReply> {
  const now = (deps.now ?? (() => new Date()))();
  if (history.length === 0 || history[history.length - 1]!.role !== "user") throw new StudioError("Send a message first.");
  if (history.some((t) => t.text.length > 8000) || history.length > 40) throw new StudioError("This chat is too long; start a new draft.");
  const cap = await spendCapReached(deps.db, ownerId, now);
  if (cap === "developer") throw new StudioError("You've used this month's $10 of AI. The builder resumes next month.");
  if (cap === "site") throw new StudioError("Tradent's free AI for this month is used up. The builder resumes next month.");

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
  if (current) {
    const last = messages[messages.length - 1]!;
    // The current draft is private to this developer, so it may include the instructions.
    last.content = `${last.content as string}\n\nCurrent draft:\n${JSON.stringify(current, null, 2)}`;
  }

  const model = MODEL_IDS[BUILDER_MODEL];
  const res = await deps.anthropic.beta.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: DRAFT_TOOL },
    messages,
  });
  const costUsd = responseCost(model, res.usage);
  await addSpend(deps.db, ownerId, now, costUsd);

  const use = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === DRAFT_TOOL);
  if (!use || res.stop_reason === "max_tokens") throw new StudioError("The builder didn't return a draft. Try rephrasing.");
  const d = use.input as DraftInput;
  const limits = clampRiskLimits({ maxPositionPct: d.max_position_pct, maxDailyLossPct: d.max_daily_loss_pct });
  return {
    reply: d.reply,
    costUsd,
    draft: {
      name: d.name,
      publicSummary: d.public_summary,
      instructions: d.instructions,
      model: d.model,
      cadenceMinutes: (CADENCES as readonly number[]).includes(d.cadence_minutes) ? d.cadence_minutes : 60,
      symbols: d.symbols.map((x) => x.toUpperCase()),
      tools: d.tools.filter((t) => (DATA_TOOLS as readonly string[]).includes(t)),
      tradingViewAlerts: d.trading_view_alerts,
      maxPositionPct: limits.maxPositionPct > 0 ? limits.maxPositionPct : 0.2,
      maxDailyLossPct: limits.maxDailyLossPct > 0 ? limits.maxDailyLossPct : 0.05,
      strategies: d.strategies.map((st) => ({ name: st.name, type: st.type, description: st.description })),
    },
  };
}
