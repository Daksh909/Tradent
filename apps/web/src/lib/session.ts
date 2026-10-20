import "server-only";
import { cookies } from "next/headers";
import { asc, desc, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { getDb } from "./db";

export const USER_COOKIE = "tradent_demo_user";

export type CurrentUser = Pick<typeof s.users.$inferSelect, "id" | "email" | "displayName" | "isDeveloper" | "isInvestor" | "isAdmin">;

const columns = {
  id: s.users.id,
  email: s.users.email,
  displayName: s.users.displayName,
  isDeveloper: s.users.isDeveloper,
  isInvestor: s.users.isInvestor,
  isAdmin: s.users.isAdmin,
};

// DEFAULT: no real sign-in yet. The user is picked with a demo switcher and kept
// in a cookie; replace this with real authentication before anyone outside uses the app.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const db = getDb();
  const id = (await cookies()).get(USER_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const [user] = await db.select(columns).from(s.users).where(eq(s.users.id, id));
    if (user) return user;
  }
  const [first] = await db.select(columns).from(s.users).orderBy(asc(s.users.createdAt)).limit(1);
  return first ?? null;
}

/** Users offered by the demo switcher: the 20 newest. */
export async function listDemoUsers(): Promise<CurrentUser[]> {
  return getDb().select(columns).from(s.users).orderBy(desc(s.users.createdAt)).limit(20);
}
