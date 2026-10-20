// Data model from SPEC.md "Build spec for Claude Code > Data model".
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { RiskLimits } from "@tradent/core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 18, scale: 6 });

export const agentStatus = pgEnum("agent_status", ["draft", "forward_testing", "listed", "retired"]);
export const agentModel = pgEnum("agent_model", ["haiku", "sonnet", "opus"]);
export const strategyType = pgEnum("strategy_type", ["entry_rule", "exit_rule", "signal", "tradingview_alert", "tool_setup"]);
export const orderSide = pgEnum("order_side", ["buy", "sell"]);
export const orderType = pgEnum("order_type", ["market", "limit", "stop", "stop_limit"]);
export const instrumentType = pgEnum("instrument_type", ["equity", "option"]);
export const guardrailResult = pgEnum("guardrail_result", ["approved", "rejected", "no_action"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  // One account can hold both roles.
  isDeveloper: boolean("is_developer").notNull().default(false),
  isInvestor: boolean("is_investor").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Sign-in fields Better Auth needs (Decision 17).
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Better Auth's session, account and verification tables (https://www.better-auth.com/docs/concepts/database#core-schema).
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One sign-in method linked to a user, such as their GitHub or Google identity. */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId), uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const strategies = pgTable("strategies", {
  id: id(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  publicDescription: text("public_description").notNull(),
  type: strategyType("type").notNull(),
  createdAt: createdAt(),
});

export const strategyVersions = pgTable(
  "strategy_versions",
  {
    id: id(),
    strategyId: uuid("strategy_id").notNull().references(() => strategies.id),
    version: integer("version").notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("strategy_versions_strategy_version").on(t.strategyId, t.version)],
);

export const agents = pgTable("agents", {
  id: id(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  publicSummary: text("public_summary").notNull(),
  status: agentStatus("status").notNull().default("draft"),
  // Kill switch for the developer and for platform admins.
  killed: boolean("killed").notNull().default(false),
  createdAt: createdAt(),
});

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: id(),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    version: integer("version").notNull(),
    // Forks and combinations record every parent version.
    parentVersionIds: uuid("parent_version_ids").array().notNull().default([]),
    // Private to the developer; never returned to investors (CLAUDE.md hard rule 6).
    instructions: text("instructions").notNull(),
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    dataSources: jsonb("data_sources").$type<string[]>().notNull().default([]),
    riskLimits: jsonb("risk_limits").$type<RiskLimits>().notNull(),
    model: agentModel("model").notNull(),
    // Minutes between scheduled decisions during market hours.
    cadenceMinutes: integer("cadence_minutes").notNull(),
    // Set when the forward test starts; the row is immutable after that.
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_versions_agent_version").on(t.agentId, t.version)],
);

export const agentVersionStrategies = pgTable(
  "agent_version_strategies",
  {
    agentVersionId: uuid("agent_version_id").notNull().references(() => agentVersions.id),
    strategyVersionId: uuid("strategy_version_id").notNull().references(() => strategyVersions.id),
  },
  (t) => [primaryKey({ columns: [t.agentVersionId, t.strategyVersionId] })],
);

export const paperAccounts = pgTable("paper_accounts", {
  id: id(),
  agentVersionId: uuid("agent_version_id").notNull().unique().references(() => agentVersions.id),
  broker: text("broker").notNull().default("alpaca_sandbox"),
  externalAccountId: text("external_account_id"),
  startingCash: money("starting_cash").notNull(),
  createdAt: createdAt(),
});

// Trust record. Append-only and hash-chained; see migration 0001.
export const decisionLogs = pgTable(
  "decision_logs",
  {
    id: id(),
    agentVersionId: uuid("agent_version_id").notNull().references(() => agentVersions.id),
    seq: integer("seq").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    inputsSnapshot: jsonb("inputs_snapshot").notNull(),
    promptHash: text("prompt_hash").notNull(),
    modelId: text("model_id").notNull(),
    output: jsonb("output").notNull(),
    toolCalls: jsonb("tool_calls").notNull().default([]),
    proposedOrders: jsonb("proposed_orders").notNull().default([]),
    guardrailResult: guardrailResult("guardrail_result").notNull(),
    guardrailDetail: jsonb("guardrail_detail").notNull().default({}),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: money("cost_usd").notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [uniqueIndex("decision_logs_version_seq").on(t.agentVersionId, t.seq)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    decisionId: uuid("decision_id").notNull().references(() => decisionLogs.id),
    paperAccountId: uuid("paper_account_id").notNull().references(() => paperAccounts.id),
    brokerOrderId: text("broker_order_id"),
    symbol: text("symbol").notNull(),
    instrument: instrumentType("instrument").notNull(),
    side: orderSide("side").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    type: orderType("type").notNull(),
    limitPrice: money("limit_price"),
    brokerStatus: text("broker_status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("orders_account").on(t.paperAccountId)],
);

// Fills come only from the broker (CLAUDE.md hard rule 4).
export const fills = pgTable("fills", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  brokerFillId: text("broker_fill_id").notNull().unique(),
  price: money("price").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  filledAt: timestamp("filled_at", { withTimezone: true }).notNull(),
});

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    agentVersionId: uuid("agent_version_id").notNull().references(() => agentVersions.id),
    date: date("date").notNull(),
    equity: money("equity").notNull(),
    dailyReturn: numeric("daily_return", { precision: 12, scale: 8 }).notNull(),
    maxDrawdown: numeric("max_drawdown", { precision: 12, scale: 8 }).notNull(),
    tradeCount: integer("trade_count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentVersionId, t.date] })],
);

export const follows = pgTable(
  "follows",
  {
    id: id(),
    investorId: uuid("investor_id").notNull().references(() => users.id),
    agentVersionId: uuid("agent_version_id").notNull().references(() => agentVersions.id),
    virtualAmount: money("virtual_amount").notNull(),
    startedAt: createdAt(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  },
  (t) => [index("follows_investor").on(t.investorId)],
);

export const spendLedger = pgTable(
  "spend_ledger",
  {
    developerId: uuid("developer_id").notNull().references(() => users.id),
    // First day of the calendar month.
    month: date("month").notNull(),
    dollarsSpent: money("dollars_spent").notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.developerId, t.month] })],
);

export const signalSources = pgTable("signal_sources", {
  id: id(),
  agentId: uuid("agent_id").notNull().references(() => agents.id),
  // Store a hash, never the raw secret.
  webhookSecretHash: text("webhook_secret_hash").notNull(),
  createdAt: createdAt(),
});

// Incoming TradingView alerts: inputs to the next decision, never orders.
export const signalAlerts = pgTable("signal_alerts", {
  id: id(),
  signalSourceId: uuid("signal_source_id").notNull().references(() => signalSources.id),
  payload: jsonb("payload").notNull(),
  receivedAt: createdAt(),
  consumedByDecisionId: uuid("consumed_by_decision_id").references(() => decisionLogs.id),
});

// Developer-only; never part of the trust record (CLAUDE.md hard rule 10).
export const smokeTestRuns = pgTable("smoke_test_runs", {
  id: id(),
  agentVersionId: uuid("agent_version_id").notNull().references(() => agentVersions.id),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  result: jsonb("result"),
});

export const agentsRelations = relations(agents, ({ one, many }) => ({
  owner: one(users, { fields: [agents.ownerId], references: [users.id] }),
  versions: many(agentVersions),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one, many }) => ({
  agent: one(agents, { fields: [agentVersions.agentId], references: [agents.id] }),
  strategies: many(agentVersionStrategies),
  decisions: many(decisionLogs),
}));

export const agentVersionStrategiesRelations = relations(agentVersionStrategies, ({ one }) => ({
  agentVersion: one(agentVersions, { fields: [agentVersionStrategies.agentVersionId], references: [agentVersions.id] }),
  strategyVersion: one(strategyVersions, { fields: [agentVersionStrategies.strategyVersionId], references: [strategyVersions.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
