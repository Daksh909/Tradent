# CLAUDE.md: Agentic trading platform MVP

Read `SPEC.md` before writing code. Its **Decision log** is the source of truth; if anything (including this file) disagrees with it, the Decision log wins. Don't re-open decided questions. If something the build needs isn't covered, pick the simplest option, mark it `// DEFAULT:` in code and list it in `DEFAULTS.md` so Daksh can change it.

## What we're building

A US-only, paper-only platform where developers build LLM trading agents from reusable strategies, forward-test each agent version on its own simulated broker account, and publish a tamper-evident trust record. Investors browse listed agents and paper-follow them. Equities and listed options only.

## Stack (decided)

- TypeScript everywhere, pnpm workspaces monorepo:
  - `apps/web`: Next.js (App Router), Tailwind, shadcn/ui
  - `apps/worker`: Node scheduler + agent runner
  - `packages/db`: Postgres schema and migrations (Default: Drizzle ORM)
  - `packages/broker`: `BrokerAdapter` interface + Alpaca Broker API sandbox implementation
  - `packages/core`: shared types, guardrails, cost math
- Anthropic TypeScript SDK (`@anthropic-ai/sdk`) for agent decisions and the Studio chat builder.
- UI libraries: shadcn/ui (layout patterns ported from shadcn-admin, not its Vite/TanStack Router setup), TradingView Lightweight Charts, React Flow (`@xyflow/react`), Recharts, TanStack Table.

## Hard rules (never break these)

1. **No live trading code path.** Only the Alpaca Broker API **sandbox** base URL is configured. No production broker URL may appear anywhere in the repo.
2. **The model never places orders directly.** It returns proposed orders through one strictly typed tool. Guardrails run in our code, outside the model, before anything reaches the broker.
3. **DecisionLog is append-only and hash-chained.** Every decision row stores inputs snapshot, prompt hash, model id, raw output, tool calls, proposed orders, guardrail result, tokens and cost, plus the previous row's hash. Write it before acting on the decision. No UPDATE or DELETE on this table (enforce with DB permissions or a trigger).
4. **Fills come only from the broker.** Never compute or type in a fill.
5. **AgentVersion is immutable once a forward test starts.** Any edit creates a new version with `parentVersionIds`.
6. **Prompts are private.** Investor-facing APIs and pages never return `instructions`. Test this.
7. **Spend cap:** $10 of AI spend per developer per month (SpendLedger). The scheduler skips agents of a developer at or over the cap.
8. **Default risk limits** (developer may tighten, never loosen): max 20% of equity per position; 5% daily loss, then the agent stops for the day. Kill switch per agent for its developer and for admins.
9. **Market hours only** for scheduled decisions (US equities regular session; use the broker's market clock).
10. **Smoke tests never touch the trust record** and are shown only to the agent's developer.
11. **Market data labels:** every quote shown says its source: "IEX real-time" or "SIP 15-min delayed". No paid SIP or OPRA feeds.
12. **TradingView attribution:** keep Lightweight Charts' `attributionLogo` enabled (Apache 2.0 license notice requirement).
13. **TradingView webhooks are inputs, not orders.** An alert is stored and passed to the agent's next decision; it never triggers an order by itself. Verify the per-agent webhook secret.
14. A visible "Paper" badge on every page.

## Listing rule

An agent version is listed for investors after 30 trading days **and** at least 20 trades of forward testing. Under 90 trading days it shows a "Young record" badge.

## Models and cost

Developer picks per agent: Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5. Confirm current model ids and prices with the Anthropic docs before hard-coding them; keep the price table in one config file. Record actual tokens and dollars per decision from the API usage fields.

## Suggested build order

1. Monorepo scaffold, Postgres via docker-compose, schema for every entity in SPEC.md "Data model", seed script with demo users, strategies and agents.
2. `BrokerAdapter` interface and Alpaca sandbox implementation: create and fund account (Transfer API), positions, submit/cancel order, orders and fills, quotes and bars, option chain. Include a `FakeBroker` for tests.
3. Agent runner: one decision end to end (SPEC.md "One agent decision, end to end"), guardrails, hash-chained DecisionLog, cost into SpendLedger.
4. Scheduler: cadence, market hours, spend cap, kill switch, daily-loss stop; DailyMetrics job after close.
5. Web app shell: sidebar + top bar (command palette, market status, Paper badge, user menu), dark theme first.
6. Pages: Library (Agents and Strategies tabs), Agent detail, Studio (chat builder + React Flow canvas + smoke test), Forward tests, Trading (chart with trade markers linked to decisions), Portfolio (paper-follow), Spend and settings.
7. Paper-follow: mirror a followed version's fills scaled to the investor's virtual amount.
8. TradingView webhook endpoint.

## Done means

The "Done means" checklist in SPEC.md passes, with automated tests for: guardrail rejection is logged; spend cap pauses agents; DecisionLog chain verifies and detects an edit; prompts never leak to investor endpoints; listing threshold.

## Environment variables (names only; never commit values)

`DATABASE_URL`, `ANTHROPIC_API_KEY`, `ALPACA_BROKER_API_KEY`, `ALPACA_BROKER_API_SECRET`, `ALPACA_BROKER_BASE_URL` (sandbox), `ALPACA_DATA_BASE_URL`. Provide `.env.example`.
