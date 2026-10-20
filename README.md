# Tradent

Agentic trading platform MVP, paper trading only. `SPEC.md` is the product spec, `CLAUDE.md` holds the build rules, and `DEFAULTS.md` lists choices you can change. To put it online, follow `DEPLOY.md` (Vercel, Neon Postgres, GitHub Actions timer).

## What's in it

- **Library**: listed agents (30 trading days and 20 trades of forward testing, "Young record" under 90 days) and a Strategies tab
- **Agent detail**: equity chart, risk limits, strategies, tools, lineage, every trade with the AI's reasoning; prompts stay private
- **Studio** (developers): chat builder, drag-and-connect canvas, smoke test, fork and combine listed agents, start a forward test
- **Forward tests** (developers): progress to listing, daily metrics, the hash-chained decision log with a tamper check, kill switch
- **Trading**: candlestick chart with fills linked to decisions, watchlist with data-source labels, option chain, positions, orders, account
- **Portfolio**: paper-follow listed agents with virtual money, scaled positions and mirrored trades
- **Spend**: AI spend against the $10 monthly cap, and each agent's TradingView webhook
- Sign-in with Google and GitHub (Better Auth)

## Run it locally

Needs Node 22+, pnpm 10 and Docker.

```sh
cp .env.example .env
pnpm install
pnpm db:up        # Postgres 16 in Docker
pnpm db:migrate
pnpm db:seed      # demo users, strategies, one agent
pnpm test
```

To run agents, copy `.env.example` to `.env`, fill in Anthropic and Alpaca Broker API sandbox keys, then:

```
pnpm worker       # runs due agent decisions every minute in market hours, DailyMetrics after the close
pnpm web          # the web app at http://localhost:3000 (set TRADENT_DEMO_SIGN_IN=true to sign in without OAuth apps)
```

Browser tests for the web app: `pnpm --filter @tradent/web build && pnpm --filter @tradent/web e2e` (set `PLAYWRIGHT_CHROMIUM_PATH` to use an installed Chromium).

## Layout

- `packages/core`: shared constants, risk limits, trust-record hash chain
- `packages/db`: Postgres schema (Drizzle), migrations, seed
- `packages/broker`: `BrokerAdapter` interface, Alpaca Broker API sandbox implementation, in-memory `FakeBroker`
- `packages/agent`: agent decisions end to end, guardrails, hash-chained decision log, model prices, scheduler and DailyMetrics, Library, Studio, paper-follow, spend and TradingView webhooks
- `apps/worker`: the always-on process that runs the scheduler (locally or on a server)
- `apps/web`: Next.js web app; shadcn/ui components and the shadcn-admin layout (both MIT), dark theme first; `/api/cron/tick` runs one scheduler pass on hosts without the worker
- `.github/workflows`: CI, and the 5-minute scheduler timer for the hosted site
