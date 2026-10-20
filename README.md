# Tradent

Agentic trading platform MVP, paper trading only. `SPEC.md` is the product spec, `CLAUDE.md` holds the build rules, and `DEFAULTS.md` lists choices you can change.

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
pnpm web          # the web app at http://localhost:3000
```

Browser tests for the web app: `pnpm --filter @tradent/web build && pnpm --filter @tradent/web e2e` (set `PLAYWRIGHT_CHROMIUM_PATH` to use an installed Chromium).

## Layout

- `packages/core`: shared constants, risk limits, trust-record hash chain
- `packages/db`: Postgres schema (Drizzle), migrations, seed
- `packages/broker`: `BrokerAdapter` interface, Alpaca Broker API sandbox implementation, in-memory `FakeBroker`
- `packages/agent`: one agent decision end to end, guardrails, hash-chained decision log, model prices, scheduler and DailyMetrics
- `apps/worker`: the process that runs the scheduler
- `apps/web`: Next.js web app; shadcn/ui components and the shadcn-admin layout (both MIT), dark theme first
