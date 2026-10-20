import "server-only";
import { cookies, headers } from "next/headers";
import { desc, eq } from "@tradent/db";
import * as s from "@tradent/db";
import { auth } from "./auth";
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

// DEFAULT: demo sign-in (pick any user, no password) is on only when
// TRADENT_DEMO_SIGN_IN=true, for local development and tests. Never set it on a public deployment.
export function demoSignInEnabled(): boolean {
  return process.env.TRADENT_DEMO_SIGN_IN === "true";
}

async function userById(id: string): Promise<CurrentUser | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [user] = await getDb().select(columns).from(s.users).where(eq(s.users.id, id));
  return user ?? null;
}

/** The signed-in user: a Google or GitHub session, else (demo mode only) the demo user. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) return userById(session.user.id);
  if (!demoSignInEnabled()) return null;
  const id = (await cookies()).get(USER_COOKIE)?.value;
  return id ? userById(id) : null;
}

/** Users offered by the demo switcher: the 20 newest. Empty unless demo sign-in is on. */
export async function listDemoUsers(): Promise<CurrentUser[]> {
  if (!demoSignInEnabled()) return [];
  return getDb().select(columns).from(s.users).orderBy(desc(s.users.createdAt)).limit(20);
}
