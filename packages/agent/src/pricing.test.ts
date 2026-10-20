import { describe, expect, it } from "vitest";
import { responseCost, tokenCost } from "./pricing";

describe("pricing", () => {
  it("prices input, output and cache tokens", () => {
    expect(tokenCost("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(2);
    expect(tokenCost("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(10);
    expect(tokenCost("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
  });

  it("prices the fallback hop at the serving model's rate", () => {
    const usage = {
      input_tokens: 2_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      iterations: [
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      ],
    } as unknown as Parameters<typeof responseCost>[1];
    expect(responseCost("claude-sonnet-5-5", usage)).toBeCloseTo(2 + 5);
  });
});
