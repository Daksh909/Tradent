import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { geminiClient, ModelUnavailableError, routedClient, type GeminiModels } from "./gemini";
import { responseCost } from "./pricing";
import type { MessagesClient } from "./runner";

function fakeGemini(replies: Partial<GenerateContentResponse>[]) {
  const calls: GenerateContentParameters[] = [];
  const models: GeminiModels = {
    async generateContent(params) {
      calls.push(structuredClone(params));
      return replies[calls.length - 1] as GenerateContentResponse;
    },
  };
  return { calls, client: geminiClient(models) };
}

const TOOL: Anthropic.Beta.BetaTool = { name: "get_quotes", description: "Quotes", input_schema: { type: "object", properties: { symbols: { type: "array", items: { type: "string" } } } } };

describe("Gemini behind the Anthropic-shaped client", () => {
  it("translates a tool round trip and sends Gemini's own parts back", async () => {
    const { calls, client } = fakeGemini([
      {
        modelVersion: "gemini-3.8-flash",
        candidates: [{ content: { role: "model", parts: [{ text: "thinking", thought: true, thoughtSignature: "sig" }, { functionCall: { name: "get_quotes", args: { symbols: ["SPY"] } }, thoughtSignature: "sig2" }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
      },
      { candidates: [{ finishReason: "STOP" as never, content: { role: "model", parts: [{ text: "Done" }] } }], usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 3 } },
    ]);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: "Decide" }];
    const first = await client.beta.messages.create({ model: "gemini-3.8-flash", max_tokens: 1000, system: "Be careful", tools: [TOOL], messages });

    expect(first.stop_reason).toBe("tool_use");
    const use = first.content.find((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock;
    expect(use).toMatchObject({ name: "get_quotes", input: { symbols: ["SPY"] } });
    expect(first.content.some((b) => b.type === "text")).toBe(false); // Thoughts aren't shown as text.
    expect(first.usage).toMatchObject({ input_tokens: 100, output_tokens: 25 });
    expect(calls[0]!.config).toMatchObject({ systemInstruction: "Be careful", maxOutputTokens: 1000, tools: [{ functionDeclarations: [{ name: "get_quotes", parametersJsonSchema: TOOL.input_schema }] }] });
    // Free tier: no dollars recorded.
    expect(responseCost("gemini-3.8-flash", first.usage)).toBe(0);

    messages.push({ role: "assistant", content: first.content });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: JSON.stringify([{ symbol: "SPY", bid: 1 }]) }] });
    const second = await client.beta.messages.create({ model: "gemini-3.8-flash", max_tokens: 1000, tools: [TOOL], messages });

    expect(second.stop_reason).toBe("end_turn");
    expect(second.content).toEqual([{ type: "text", text: "Done", citations: null }]);
    const sent = calls[1]!.contents as { role: string; parts: Record<string, any>[] }[];
    // The model's turn goes back with its thought signatures, and the result matches the call's id.
    expect(sent[1]!.parts[0]).toMatchObject({ thought: true, thoughtSignature: "sig" });
    expect(sent[1]!.parts[1]).toMatchObject({ thoughtSignature: "sig2", functionCall: { id: use.id, name: "get_quotes" } });
    expect(sent[2]).toEqual({ role: "user", parts: [{ functionResponse: { id: use.id, name: "get_quotes", response: { output: [{ symbol: "SPY", bid: 1 }] } } }] });
  });

  it("forces a named tool and reports blocked replies as refusals", async () => {
    const { calls, client } = fakeGemini([{ candidates: [{ finishReason: "SAFETY" as never, content: { role: "model", parts: [] } }] }]);
    const res = await client.beta.messages.create({ model: "gemini-3.8-flash", max_tokens: 100, tools: [TOOL], tool_choice: { type: "tool", name: "get_quotes" }, messages: [{ role: "user", content: "x" }] });
    expect(calls[0]!.config?.toolConfig).toEqual({ functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["get_quotes"] } });
    expect(res.stop_reason).toBe("refusal");
  });

  it("routes each model to its provider and says which key is missing", async () => {
    const seen: string[] = [];
    const stub = (name: string): MessagesClient => ({ beta: { messages: { create: async (p) => (seen.push(`${name}:${p.model}`), {} as Anthropic.Beta.BetaMessage) } } });
    const both = routedClient({ anthropic: stub("claude"), gemini: stub("gemini") });
    await both.beta.messages.create({ model: "gemini-3.8-flash", max_tokens: 1, messages: [] });
    await both.beta.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] });
    expect(seen).toEqual(["gemini:gemini-3.8-flash", "claude:claude-sonnet-5-5"]);

    const geminiOnly = routedClient({ anthropic: null, gemini: stub("gemini") });
    await expect(geminiOnly.beta.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] })).rejects.toBeInstanceOf(ModelUnavailableError);
  });
});
