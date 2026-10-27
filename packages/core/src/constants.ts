// Values fixed by the Decision log in SPEC.md. Change them there first.

/** Decision 11: AI spend cap per developer per calendar month, in US dollars. */
export const MONTHLY_AI_SPEND_CAP_USD = 10;

// DEFAULT: with guest accounts anyone can become a developer, so all AI spend
// across the site stops at $50 a calendar month.
export const SITE_MONTHLY_AI_SPEND_CAP_USD = 50;

/** Decision 12: forward-test minimums before an agent version is listed. */
export const LISTING_MIN_TRADING_DAYS = 30;
export const LISTING_MIN_TRADES = 20;
/** Records shorter than this carry a "Young record" badge. */
export const YOUNG_RECORD_TRADING_DAYS = 90;

/** Decision 11: models a developer can pick per agent. Decision 22 added free Gemini Flash. */
export const AGENT_MODELS = ["haiku", "sonnet", "opus", "gemini_flash"] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

// DEFAULT: starting cash for each agent version's paper account.
export const DEFAULT_STARTING_CASH_USD = 100_000;

/** Decision 2: instruments allowed at launch. */
export const INSTRUMENT_TYPES = ["equity", "option"] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
