"use server";

import { revalidatePath } from "next/cache";
import { FollowError, startFollow, stopFollow } from "@tradent/agent";
import { getBroker } from "@/lib/broker";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type FollowResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

// DEFAULT: any signed-in account can paper-follow, developers included.
async function asUser(fn: (userId: string) => Promise<unknown>): Promise<FollowResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to follow agents." };
  try {
    await fn(user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof FollowError) return { ok: false, error: e.message };
    console.error("Follow action failed:", e);
    return { ok: false, error: "Something went wrong on our side. Nothing was changed." };
  }
}

export async function followAgent(versionId: string, virtualAmount: number): Promise<FollowResult> {
  if (!UUID.test(versionId)) return { ok: false, error: "Unknown agent." };
  return asUser((userId) => startFollow(getDb(), userId, versionId, virtualAmount, getBroker()));
}

export async function unfollowAgent(followId: string): Promise<FollowResult> {
  if (!UUID.test(followId)) return { ok: false, error: "Unknown follow." };
  return asUser((userId) => stopFollow(getDb(), userId, followId, getBroker()));
}
