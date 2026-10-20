import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@tradent/db";
import { getDb } from "./db";

/** Google and GitHub, each offered only when its keys are set (Decision 17). */
function socialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    providers.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    providers.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  return providers;
}

export const enabledProviders = Object.keys(socialProviders()) as ("google" | "github")[];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    usePlural: true,
    schema: { users: schema.users, sessions: schema.sessions, accounts: schema.accounts, verifications: schema.verifications },
  }),
  user: {
    fields: { name: "displayName" },
    // Roles are ours to set, never taken from sign-in input. New accounts are investors.
    additionalFields: {
      isDeveloper: { type: "boolean", required: false, defaultValue: false, input: false },
      isInvestor: { type: "boolean", required: false, defaultValue: true, input: false },
      isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  socialProviders: socialProviders(),
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
  plugins: [nextCookies()],
});
