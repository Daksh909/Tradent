CREATE TYPE "public"."agent_model" AS ENUM('haiku', 'sonnet', 'opus');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'forward_testing', 'listed', 'retired');--> statement-breakpoint
CREATE TYPE "public"."guardrail_result" AS ENUM('approved', 'rejected', 'no_action');--> statement-breakpoint
CREATE TYPE "public"."instrument_type" AS ENUM('equity', 'option');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('market', 'limit', 'stop', 'stop_limit');--> statement-breakpoint
CREATE TYPE "public"."strategy_type" AS ENUM('entry_rule', 'exit_rule', 'signal', 'tradingview_alert', 'tool_setup');--> statement-breakpoint
CREATE TABLE "agent_version_strategies" (
	"agent_version_id" uuid NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	CONSTRAINT "agent_version_strategies_agent_version_id_strategy_version_id_pk" PRIMARY KEY("agent_version_id","strategy_version_id")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version_ids" uuid[] DEFAULT '{}' NOT NULL,
	"instructions" text NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_limits" jsonb NOT NULL,
	"model" "agent_model" NOT NULL,
	"cadence_minutes" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_summary" text NOT NULL,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"killed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"agent_version_id" uuid NOT NULL,
	"date" date NOT NULL,
	"equity" numeric(18, 6) NOT NULL,
	"daily_return" numeric(12, 8) NOT NULL,
	"max_drawdown" numeric(12, 8) NOT NULL,
	"trade_count" integer NOT NULL,
	CONSTRAINT "daily_metrics_agent_version_id_date_pk" PRIMARY KEY("agent_version_id","date")
);
--> statement-breakpoint
CREATE TABLE "decision_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inputs_snapshot" jsonb NOT NULL,
	"prompt_hash" text NOT NULL,
	"model_id" text NOT NULL,
	"output" jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guardrail_result" "guardrail_result" NOT NULL,
	"guardrail_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(18, 6) NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"broker_fill_id" text NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"filled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fills_broker_fill_id_unique" UNIQUE("broker_fill_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"virtual_amount" numeric(18, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"paper_account_id" uuid NOT NULL,
	"broker_order_id" text,
	"symbol" text NOT NULL,
	"instrument" "instrument_type" NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"type" "order_type" NOT NULL,
	"limit_price" numeric(18, 6),
	"broker_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"broker" text DEFAULT 'alpaca_sandbox' NOT NULL,
	"external_account_id" text,
	"starting_cash" numeric(18, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_accounts_agent_version_id_unique" UNIQUE("agent_version_id")
);
--> statement-breakpoint
CREATE TABLE "signal_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_source_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_by_decision_id" uuid
);
--> statement-breakpoint
CREATE TABLE "signal_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"webhook_secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smoke_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "spend_ledger" (
	"developer_id" uuid NOT NULL,
	"month" date NOT NULL,
	"dollars_spent" numeric(18, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "spend_ledger_developer_id_month_pk" PRIMARY KEY("developer_id","month")
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_description" text NOT NULL,
	"type" "strategy_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"is_developer" boolean DEFAULT false NOT NULL,
	"is_investor" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_version_strategies" ADD CONSTRAINT "agent_version_strategies_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_strategies" ADD CONSTRAINT "agent_version_strategies_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fills" ADD CONSTRAINT "fills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decision_logs_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paper_account_id_paper_accounts_id_fk" FOREIGN KEY ("paper_account_id") REFERENCES "public"."paper_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_accounts" ADD CONSTRAINT "paper_accounts_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_alerts" ADD CONSTRAINT "signal_alerts_signal_source_id_signal_sources_id_fk" FOREIGN KEY ("signal_source_id") REFERENCES "public"."signal_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_alerts" ADD CONSTRAINT "signal_alerts_consumed_by_decision_id_decision_logs_id_fk" FOREIGN KEY ("consumed_by_decision_id") REFERENCES "public"."decision_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_sources" ADD CONSTRAINT "signal_sources_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smoke_test_runs" ADD CONSTRAINT "smoke_test_runs_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_developer_id_users_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_logs_version_seq" ON "decision_logs" USING btree ("agent_version_id","seq");--> statement-breakpoint
CREATE INDEX "follows_investor" ON "follows" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "orders_account" ON "orders" USING btree ("paper_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_strategy_version" ON "strategy_versions" USING btree ("strategy_id","version");