import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** The Anthropic client, or null when ANTHROPIC_API_KEY isn't set. */
export function getAnthropic(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}
