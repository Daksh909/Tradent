import { timingSafeEqual } from "node:crypto";
import { schedulerPass } from "@tradent/agent";
import { getModelClient } from "@/lib/anthropic";
import { getBroker } from "@/lib/broker";
import { getDb } from "@/lib/db";

// One scheduler pass per call, for hosts without an always-on worker (Vercel).
// A GitHub Actions schedule calls it every 5 minutes with the CRON_SECRET bearer token.
// DEFAULT: up to 60 seconds per pass.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const broker = getBroker();
  const anthropic = getModelClient();
  if (!broker || !anthropic) return Response.json({ error: "The scheduler needs the Alpaca sandbox keys and GEMINI_API_KEY or ANTHROPIC_API_KEY" }, { status: 503 });
  const events = await schedulerPass({ db: getDb(), broker, anthropic });
  for (const e of events) console.log(JSON.stringify({ at: new Date().toISOString(), ...e }));
  return Response.json({ events });
}

export const GET = handle;
export const POST = handle;
