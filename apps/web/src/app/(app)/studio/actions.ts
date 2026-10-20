"use server";

import { revalidatePath } from "next/cache";
import { chatWithBuilder, publicBlocks, runSmokeTest, saveDraft, startForwardTest, StudioError, type BuilderReply, type ChatTurn, type Draft, type SmokeTestResult } from "@tradent/agent";
import { getAnthropic } from "@/lib/anthropic";
import { getBroker } from "@/lib/broker";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function asDeveloper<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user?.isDeveloper) return { ok: false, error: "Studio is for developers. Turn on developer tools in Settings." };
  try {
    return { ok: true, value: await fn(user.id) };
  } catch (e) {
    if (e instanceof StudioError) return { ok: false, error: e.message };
    console.error("Studio action failed:", e);
    return { ok: false, error: "Something went wrong on our side. Nothing was changed." };
  }
}

export async function builderChat(history: ChatTurn[], current: Partial<Draft>): Promise<ActionResult<BuilderReply>> {
  return asDeveloper(async (userId) => {
    const anthropic = getAnthropic();
    if (!anthropic) throw new StudioError("The chat builder needs ANTHROPIC_API_KEY on the server.");
    return chatWithBuilder({ db: getDb(), anthropic }, userId, history, current);
  });
}

export async function saveStudioDraft(draft: Draft): Promise<ActionResult<{ agentId: string; versionId: string; version: number }>> {
  return asDeveloper(async (userId) => {
    const saved = await saveDraft(getDb(), userId, draft);
    revalidatePath("/studio");
    return saved;
  });
}

export async function startStudioForwardTest(versionId: string): Promise<ActionResult<null>> {
  return asDeveloper(async (userId) => {
    const broker = getBroker();
    if (!broker) throw new StudioError("Starting a forward test needs the Alpaca sandbox keys on the server.");
    await startForwardTest(getDb(), broker, userId, versionId);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function studioSmokeTest(versionId: string): Promise<ActionResult<SmokeTestResult>> {
  return asDeveloper(async (userId) => {
    const broker = getBroker();
    if (!broker) throw new StudioError("The smoke test reads recent market data, so it needs the Alpaca sandbox keys on the server.");
    const anthropic = getAnthropic();
    if (!anthropic) throw new StudioError("The smoke test needs ANTHROPIC_API_KEY on the server.");
    return runSmokeTest({ db: getDb(), broker, anthropic }, userId, versionId);
  });
}

export async function blocksFrom(versionId: string) {
  return asDeveloper(async (userId) => {
    const blocks = await publicBlocks(getDb(), userId, versionId);
    if (!blocks) throw new StudioError("That agent isn't listed, so its blocks can't be reused yet.");
    return blocks;
  });
}
