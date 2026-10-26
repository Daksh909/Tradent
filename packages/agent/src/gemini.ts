// Google Gemini behind the same MessagesClient the runner, builder and smoke test
// use (Decision 22). Requests and replies are translated to and from the Anthropic
// shape, so guardrails, the decision log and the spend ledger don't change.
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { FunctionCallingConfigMode, FinishReason, GoogleGenAI, type Content, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import type { MessagesClient } from "./runner";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

/** The part of the Gemini SDK this file calls, so tests can pass a fake. */
export interface GeminiModels {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

export class ModelUnavailableError extends Error {}

export const isGeminiModel = (model: string) => model.startsWith("gemini-");

// Gemini 3 models need their own parts (with thought signatures) sent back on the
// next turn. The runner pushes each reply's content array back unchanged, so the
// original parts are kept against that array.
const originalParts = new WeakMap<object, Part[]>();

function systemText(system: Params["system"]): string | undefined {
  if (!system) return undefined;
  return typeof system === "string" ? system : system.map((b) => b.text).join("\n");
}

function toContents(messages: Params["messages"]): Content[] {
  const toolNames = new Map<string, string>();
  return messages.map((m): Content => {
    if (typeof m.content === "string") return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
    const kept = originalParts.get(m.content);
    if (m.role === "assistant" && kept) {
      for (const b of m.content) if (b.type === "tool_use") toolNames.set(b.id, b.name);
      return { role: "model", parts: kept };
    }
    const parts: Part[] = m.content.flatMap((b): Part[] => {
      switch (b.type) {
        case "text":
          return [{ text: b.text }];
        case "tool_use":
          toolNames.set(b.id, b.name);
          return [{ functionCall: { id: b.id, name: b.name, args: b.input as Record<string, unknown> } }];
        case "tool_result": {
          const text = typeof b.content === "string" ? b.content : (b.content ?? []).flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
          let output: unknown = text;
          try {
            output = JSON.parse(text);
          } catch {
            // Plain text stays text.
          }
          const response = b.is_error ? { error: output } : { output };
          return [{ functionResponse: { id: b.tool_use_id, name: toolNames.get(b.tool_use_id) ?? "unknown", response } }];
        }
        default:
          return [];
      }
    });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

function toolConfig(choice: Params["tool_choice"]): GenerateContentParameters["config"] {
  if (!choice || choice.type === "auto") return {};
  if (choice.type === "tool") return { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [choice.name] } } };
  if (choice.type === "any") return { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } };
  return { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } };
}

const REFUSALS: string[] = [FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION];

/** A MessagesClient that sends each request to Gemini. */
export function geminiClient(models: GeminiModels): MessagesClient {
  return {
    beta: {
      messages: {
        async create(params: Params): Promise<Anthropic.Beta.BetaMessage> {
          const tools = (params.tools ?? []).flatMap((t) => ("input_schema" in t ? [{ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }] : []));
          const res = await models.generateContent({
            model: params.model,
            contents: toContents(params.messages),
            config: {
              systemInstruction: systemText(params.system),
              maxOutputTokens: params.max_tokens,
              ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
              ...toolConfig(params.tool_choice),
            },
          });
          const candidate = res.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];
          const content: Anthropic.Beta.BetaContentBlock[] = parts.flatMap((p): Anthropic.Beta.BetaContentBlock[] => {
            if (p.functionCall) return [{ type: "tool_use", id: p.functionCall.id ?? `gem_${randomUUID()}`, name: p.functionCall.name ?? "", input: p.functionCall.args ?? {} } as Anthropic.Beta.BetaToolUseBlock];
            if (p.text && !p.thought) return [{ type: "text", text: p.text, citations: null } as Anthropic.Beta.BetaTextBlock];
            return [];
          });
          // Keep ids we made up in the parts we send back, so tool results match their calls.
          let i = 0;
          const sentBack = parts.map((p) => {
            if (!p.functionCall) return p;
            const use = content.filter((b) => b.type === "tool_use")[i++] as Anthropic.Beta.BetaToolUseBlock;
            return { ...p, functionCall: { ...p.functionCall, id: use.id } };
          });
          originalParts.set(content, sentBack);

          const finish = candidate?.finishReason ?? (res.promptFeedback?.blockReason ? FinishReason.SAFETY : FinishReason.STOP);
          const stop_reason: Anthropic.Beta.BetaStopReason = content.some((b) => b.type === "tool_use")
            ? "tool_use"
            : finish === FinishReason.MAX_TOKENS
              ? "max_tokens"
              : REFUSALS.includes(finish)
                ? "refusal"
                : "end_turn";
          const u = res.usageMetadata;
          return {
            id: res.responseId ?? `gem_${randomUUID()}`,
            type: "message",
            role: "assistant",
            model: res.modelVersion ?? params.model,
            content,
            stop_reason,
            stop_sequence: null,
            usage: {
              input_tokens: (u?.promptTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0),
              // Gemini bills thinking tokens as output.
              output_tokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          } as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
}

/** The Gemini client for an API key. */
export function geminiFromKey(apiKey: string): MessagesClient {
  return geminiClient(new GoogleGenAI({ apiKey }).models);
}

/** Sends Gemini model ids to Gemini and the rest to Claude, whichever is configured. */
export function routedClient(clients: { anthropic: MessagesClient | null; gemini: MessagesClient | null }): MessagesClient {
  return {
    beta: {
      messages: {
        async create(params) {
          const gemini = isGeminiModel(params.model);
          const client = gemini ? clients.gemini : clients.anthropic;
          if (!client) throw new ModelUnavailableError(gemini ? "Gemini needs GEMINI_API_KEY on the server." : "Claude models need ANTHROPIC_API_KEY on the server. Pick Gemini, or add the key.");
          return client.beta.messages.create(params);
        },
      },
    },
  };
}
