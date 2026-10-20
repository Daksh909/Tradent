# Defaults

Gap-filling choices made during the build, not decisions from SPEC.md's Decision log. Each one is marked `// DEFAULT:` in code. Change any of them by editing the code and this list.

| Default | Value | Where |
| --- | --- | --- |
| Paper account starting cash | $100,000 per agent version | `packages/core/src/constants.ts` |
| Max position size | 20% of equity; developers can tighten, not loosen | `packages/core/src/risk.ts` |
| Daily loss stop | 5%, then the agent stops for the day | `packages/core/src/risk.ts` |
| Trust record tamper evidence | SHA-256 hash chain over canonical JSON, per agent version | `packages/core/src/hash.ts` |
| ORM | Drizzle with postgres.js | `packages/db` |
| Cadence unit | Minutes between decisions during market hours | `agent_versions.cadence_minutes` |
| Sandbox account identity | Synthetic platform identity per paper account (no real person) | `packages/broker/src/alpaca.ts` |
| Sandbox funding | Test ACH relationship plus an incoming transfer for the starting cash | `packages/broker/src/alpaca.ts` |
| Order time in force | `day` | `packages/broker/src/alpaca.ts` |
| Options data label | "Options indicative" (Alpaca's free options feed) | `packages/broker/src/types.ts` |
| Model turns per decision | At most 6; a decision with no `propose_orders` call is logged as no action | `packages/agent/src/runner.ts` |
| Model effort | `medium` | `packages/agent/src/runner.ts` |
| Fallback on a policy decline | Sonnet and Opus use Anthropic's server-side fallback; the serving model is saved in the log and priced at its own rate | `packages/agent/src/runner.ts`, `pricing.ts` |
| Short selling | Not allowed; sells are capped at what's held, and no uncovered option writing | `packages/agent/src/guardrails.ts` |
| Options order type | Limit orders only | `packages/agent/src/guardrails.ts` |
| Price for the position check | Limit price, else the IEX mid quote | `packages/agent/src/runner.ts` |
| Worker wake-up | Every 60 seconds; a slow tick never overlaps the next | `apps/worker/src/main.ts` |
| Cadence clock | A version is due once its cadence has passed since its last logged decision; skipped runs (cap, closed, daily stop) log nothing and retry next tick | `packages/agent/src/scheduler.ts` |
| Spend cap timing | Checked before each decision, one developer's agents run one at a time, so a developer can go past $10 by at most one decision | `packages/agent/src/scheduler.ts` |
| DailyMetrics time | 5 minutes after the close on trading days (broker calendar), from the broker's account equity | `packages/agent/src/scheduler.ts` |
| Killed agents' metrics | Still recorded daily, since they may still hold positions | `packages/agent/src/scheduler.ts` |
| Trade count | Fills dated by their New York trading day | `packages/agent/src/scheduler.ts` |
| Sign-in library | Better Auth, since Auth.js's own README recommends it for new projects (Decision 17 picks Google and GitHub) | `apps/web/src/lib/auth.ts` |
| Demo sign-in | Pick any user without a password, only when `TRADENT_DEMO_SIGN_IN=true` (local development and tests) | `apps/web/src/lib/session.ts` |
| New accounts | Investors; anyone can turn on developer tools in Settings | `apps/web/src/lib/auth.ts`, `apps/web/src/app/actions.ts` |
| Account linking | Better Auth's default (on): Google and GitHub sign-ins with the same provider-verified email share one account | `apps/web/src/lib/auth.ts` |
| Market status refresh | Every 60 seconds from the broker's market clock; shows "unavailable" without Alpaca keys | `apps/web/src/components/market-status.tsx` |
| Fonts | System font stack (no web font download) | `apps/web/src/app/globals.css` |
| Navigation | Discover (Library), Build (Studio, Forward tests), Trade (Trading, Portfolio), Account (Spend, Settings); Build and Spend shown to developers only | `apps/web/src/lib/nav.ts` |
| Paper badge color | Amber, in the top bar of every page | `apps/web/src/components/paper-badge.tsx` |
| Library contents | Per agent, its newest version that meets the listing rule; killed agents are left out | `packages/agent/src/library.ts` |
| Library order | Highest total return first | `packages/agent/src/library.ts` |
| Listing status | The worker marks a forward-testing agent listed after each DailyMetrics run once a version meets the rule | `apps/worker/src/main.ts` |
| Agent detail version | The newest locked version unless one is picked | `packages/agent/src/library.ts` |
| Decision reasoning on Agent detail | Each trade shows its decision time and the model's reasoning, which the spec's Trading page also shows to everyone; prompts never | `apps/web/src/app/(app)/agents/[agentId]/page.tsx` |
| Follow and Fork buttons | Shown but disabled until paper-follow (step 7) and Studio (step 6c) exist; Fork only for developers | `apps/web/src/app/(app)/agents/[agentId]/page.tsx` |
| Lineage view | A simple parents-to-version diagram; a React Flow graph can replace it | `apps/web/src/app/(app)/agents/[agentId]/page.tsx` |
