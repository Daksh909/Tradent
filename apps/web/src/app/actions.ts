"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
