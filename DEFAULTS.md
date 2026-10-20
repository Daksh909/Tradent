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
