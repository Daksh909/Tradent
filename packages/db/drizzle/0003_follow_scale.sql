ALTER TABLE "follows" ADD COLUMN "agent_equity_at_start" numeric(18, 6);--> statement-breakpoint
-- Follows made before this column existed are scaled against the account's starting cash.
UPDATE "follows" f SET "agent_equity_at_start" = coalesce((SELECT p."starting_cash" FROM "paper_accounts" p WHERE p."agent_version_id" = f."agent_version_id"), f."virtual_amount");--> statement-breakpoint
ALTER TABLE "follows" ALTER COLUMN "agent_equity_at_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "agent_equity_at_stop" numeric(18, 6);--> statement-breakpoint
CREATE UNIQUE INDEX "follows_one_active" ON "follows" USING btree ("investor_id","agent_version_id") WHERE stopped_at is null;
