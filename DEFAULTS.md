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
| Follow and Fork buttons | Follow shown but disabled until paper-follow (step 7); Fork in Studio shown to developers on listed versions | `apps/web/src/app/(app)/agents/[agentId]/page.tsx` |
| Lineage view | A simple parents-to-version diagram; a React Flow graph can replace it | `apps/web/src/app/(app)/agents/[agentId]/page.tsx` |
| Forward tests status | "Testing", "Listed" (with "young record" under 90 days) or "Stopped" when the kill switch is on | `apps/web/src/components/test-status.tsx` |
| Kill switch place | On each forward test's page; it stops the whole agent (all its versions) | `apps/web/src/app/(app)/forward-tests/[versionId]/page.tsx` |
| Decision log shown | The newest 200 decisions on a forward test, the newest 50 on Trading | `packages/agent/src/forward-tests.ts`, `packages/agent/src/trading.ts` |
| Who sees AI cost | Only the agent's developer; investors see reasoning, proposed orders and the guardrail result | `packages/agent/src/trading.ts` |
| Trading agent choice | Your own forward tests, then Library-listed agents; the first one opens by default | `packages/agent/src/trading.ts` |
| Watchlist | The agent's allowed symbols plus every stock it has traded (up to 10), SPY when there are none; change is against the previous daily close | `packages/agent/src/trading.ts`, `apps/web/src/app/(app)/trading/page.tsx` |
| Chart intervals | 1m (2 days), 5m (5 days), 15m (10 days), 1h (30 days, the default), 1D (1 year), IEX real-time bars | `apps/web/src/app/(app)/trading/page.tsx` |
| Fill markers | At the fill price, on the bar the fill falls in; fills older than the chart's range aren't marked | `apps/web/src/app/(app)/trading/page.tsx` |
| Open orders | Our order rows whose broker status isn't filled, canceled, expired, rejected, replaced or done for day | `apps/web/src/app/(app)/trading/page.tsx` |
| Broker errors on Trading | The page says the part is unavailable; the broker's error goes to the server log only | `apps/web/src/app/(app)/trading/page.tsx` |
| New Studio draft | Hourly, Sonnet 5.5, the platform's risk limits and every read-only data tool | `packages/agent/src/studio.ts` |
| Cadence choices | Every 5, 15, 30 or 60 minutes, every 2 hours, once a session (390 min) or daily | `packages/agent/src/studio.ts` |
| Saving | An unlocked version is saved in place; saving a locked version creates the next version with it as parent | `packages/agent/src/studio.ts` |
| Agent name and summary | Editable until the agent's first forward test, then fixed | `packages/agent/src/studio.ts` |
| Studio opens | Your newest version, unless a version or fork is picked | `apps/web/src/app/(app)/studio/page.tsx` |
| Tools per version | The runner offers only the version's chosen data tools plus propose_orders; a version with no tools listed gets all of them | `packages/agent/src/runner.ts` |
| Chat builder model | Sonnet 5.5 (its cost counts toward the cap per Decision 18) | `packages/agent/src/builder.ts` |
| Chat history | Kept only in the open page, not saved | `apps/web/src/components/studio/studio-workspace.tsx` |
| Smoke test | One decision on the latest market data against a fresh $100,000 scratch account; no orders, no decision log; its cost counts toward the cap; runs any time, not only in market hours | `packages/agent/src/studio.ts` |
| Combine | Adding blocks from a listed agent adds its strategies and tools and records it as a parent | `apps/web/src/components/studio/studio-workspace.tsx` |
| Cost estimate in Studio | 8,000 input and 1,000 output tokens per decision, decisions per day rounded up over a 390-minute session, 21 trading days | `packages/agent/src/pricing.ts` |
| Canvas | Built from the draft (inputs, then AI model, risk limits, broker); blocks are edited in the settings pane rather than wired by hand | `apps/web/src/components/studio/studio-canvas.tsx` |
| Spend breakdown | Forward-test decisions and smoke tests from their own records; the Studio chat builder is the rest of the ledger total | `packages/agent/src/spend.ts` |
| Spend month | Calendar month in UTC, as the spend ledger keys it | `packages/agent/src/spend.ts` |
| Follow amount | $1,000 to $1,000,000 of virtual money, $10,000 suggested | `packages/agent/src/follow.ts` |
| Following an agent that holds positions | The follower starts with a scaled copy of the agent's holdings (recommended on Daksh's open card; switching to "start in cash" is a small change) | `packages/agent/src/follow.ts` |
| Follow scale | Virtual amount divided by the agent account's equity when the follow starts: the broker's live equity when readable, otherwise the last daily close | `packages/agent/src/follow.ts` |
| Who can follow | Any signed-in account, developers included; only Library-listed, not-stopped versions; one active follow per version | `apps/web/src/app/(app)/portfolio/actions.ts` |
| Follow value | Updated at each daily close; stopping a follow freezes its value at the account's equity then | `packages/agent/src/follow.ts` |
