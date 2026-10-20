"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setKillSwitch } from "@tradent/agent";
import { eq } from "@tradent/db";
import * as s from "@tradent/db";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { demoSignInEnabled, getCurrentUser, USER_COOKIE } from "@/lib/session";

/** Demo-only sign-in (see lib/session.ts). */
export async function switchDemoUser(userId: string) {
  if (!demoSignInEnabled()) throw new Error("Demo sign-in is off");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid user id");
  (await cookies()).set(USER_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  (await cookies()).delete(USER_COOKIE);
  redirect("/sign-in");
}

// DEFAULT: anyone can turn developer tools on for their own account.
export async function setDeveloper(enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  await getDb().update(s.users).set({ isDeveloper: enabled, updatedAt: new Date() }).where(eq(s.users.id, user.id));
  revalidatePath("/", "layout");
}

/** The kill switch: the agent's developer or an admin (CLAUDE.md hard rule 8). */
export async function setAgentKilled(agentId: string, killed: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) throw new Error("Invalid agent id");
  if (!(await setKillSwitch(getDb(), user, agentId, killed))) throw new Error("Only the agent's developer or an admin can do this");
  revalidatePath("/", "layout");
}
