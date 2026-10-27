// The worker: every minute, run due agent decisions during market hours, and
// write DailyMetrics once after each close. Paper only (Alpaca Broker API sandbox).
import Anthropic from "@anthropic-ai/sdk";
import { geminiFromKey, routedClient, schedulerPass } from "@tradent/agent";
import { alpacaSandboxFromEnv } from "@tradent/broker";
import { createDb } from "@tradent/db";

// DEFAULT: how often the worker wakes up.
const TICK_MS = 60_000;

const { db, client } = createDb();
const broker = alpacaSandboxFromEnv();
// Claude and Gemini, each only when its key is set (Decision 22).
const anthropic = routedClient({
  anthropic: process.env.ANTHROPIC_API_KEY ? new Anthropic() : null,
  gemini: process.env.GEMINI_API_KEY ? geminiFromKey(process.env.GEMINI_API_KEY) : null,
});
const deps = { db, broker, anthropic };

const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));

let running = false;

async function wake() {
  if (running) return; // A slow tick never overlaps the next one.
  running = true;
  try {
    for (const { event, ...data } of await schedulerPass(deps)) log(event, data);
  } catch (e) {
    log("tick_failed", { message: (e as Error).message });
  } finally {
    running = false;
  }
}

const timer = setInterval(wake, TICK_MS);
void wake();
log("worker_started", { tickMs: TICK_MS });

async function stop() {
  clearInterval(timer);
  while (running) await new Promise((r) => setTimeout(r, 200));
  await client.end();
  log("worker_stopped");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
