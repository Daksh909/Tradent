// The one place model ids and prices live (CLAUDE.md "Models and cost").
// Source: Anthropic list prices per million tokens, as cached 2026-10-06.
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentModel } from "@tradent/core";

export const MODEL_IDS: Record<AgentModel, string> = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
};

interface Price {
  input: number;
  output: number;
}

const PRICES_PER_MTOK: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  // Possible server-side fallback targets.
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

// Cache writes cost 1.25x input and cache reads 0.1x input (5-minute cache).
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

function priceFor(model: string): Price {
  const p = PRICES_PER_MTOK[model];
  // Unknown model: price it as the most expensive one we list rather than as free.
  return p ?? { input: 5, output: 25 };
}

export function tokenCost(model: string, u: TokenCounts): number {
  const p = priceFor(model);
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * CACHE_WRITE + (u.cache_read_input_tokens ?? 0) * CACHE_READ;
  return (input * p.input + u.output_tokens * p.output) / 1_000_000;
}

/**
 * Dollar cost of one API response. When a server-side fallback served the turn,
 * the serving hop is priced at the fallback model's rate.
 */
export function responseCost(requestedModel: string, usage: Anthropic.Beta.BetaUsage): number {
  const fallback = (usage.iterations ?? []).find((i): i is Anthropic.Beta.BetaFallbackMessageIterationUsage => i.type === "fallback_message");
  if (!fallback) return tokenCost(requestedModel, usage);
  // DEFAULT: hops before the fallback are priced at the requested model's rate.
  const rest = {
    input_tokens: Math.max(0, usage.input_tokens - fallback.input_tokens),
    output_tokens: Math.max(0, usage.output_tokens - fallback.output_tokens),
    cache_creation_input_tokens: Math.max(0, (usage.cache_creation_input_tokens ?? 0) - fallback.cache_creation_input_tokens),
    cache_read_input_tokens: Math.max(0, (usage.cache_read_input_tokens ?? 0) - fallback.cache_read_input_tokens),
  };
  return tokenCost(requestedModel, rest) + tokenCost(fallback.model, fallback);
}
