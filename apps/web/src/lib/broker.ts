import "server-only";
import { alpacaSandboxFromEnv, type BrokerAdapter } from "@tradent/broker";

/** The Alpaca sandbox broker, or null when its keys aren't configured. */
export function getBroker(): BrokerAdapter | null {
  try {
    return alpacaSandboxFromEnv();
  } catch {
    return null;
  }
}
