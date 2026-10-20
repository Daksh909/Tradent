"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { issueWebhookSecret } from "@tradent/agent";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** Creates or replaces an agent's TradingView webhook secret; the URL is shown once. */
export async function newWebhookUrl(agentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user?.isDeveloper) return { ok: false, error: "Webhooks are for developers." };
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return { ok: false, error: "Unknown agent." };
  const issued = await issueWebhookSecret(getDb(), user.id, agentId);
  if (!issued) return { ok: false, error: "Only the agent's developer can do this." };
  // DEFAULT: the URL uses BETTER_AUTH_URL, the app's public address, falling back to this request's host.
  const h = await headers();
  const base = process.env.BETTER_AUTH_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  revalidatePath("/spend");
  return { ok: true, url: `${base.replace(/\/$/, "")}/api/webhooks/tradingview/${issued.sourceId}/${issued.secret}` };
}
