"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { USER_COOKIE } from "@/lib/session";

/** Demo-only user switcher (see lib/session.ts). */
export async function switchDemoUser(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid user id");
  (await cookies()).set(USER_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
