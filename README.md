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

## Layout

- `packages/core`: shared constants, risk limits, trust-record hash chain
- `packages/db`: Postgres schema (Drizzle), migrations, seed
- `packages/broker`: `BrokerAdapter` interface, Alpaca Broker API sandbox implementation, in-memory `FakeBroker`
- `apps/`: web app and worker (coming in later steps)
