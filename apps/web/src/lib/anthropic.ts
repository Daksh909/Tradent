import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { geminiFromKey, routedClient, type MessagesClient } from "@tradent/agent";
import type { AgentModel } from "@tradent/core";

/** The Anthropic client, or null when ANTHROPIC_API_KEY isn't set. */
export function getAnthropic(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

/** Claude and Gemini behind one client (Decision 22), or null when neither key is set. */
export function getModelClient(): MessagesClient | null {
  const anthropic = getAnthropic();
  const gemini = process.env.GEMINI_API_KEY ? geminiFromKey(process.env.GEMINI_API_KEY) : null;
  return anthropic || gemini ? routedClient({ anthropic, gemini }) : null;
}

/** The model new drafts and the chat builder use: Claude when it's set up, otherwise free Gemini. */
export function defaultModel(): AgentModel {
  return !process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY ? "gemini_flash" : "sonnet";
}
