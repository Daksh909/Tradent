import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const fixture = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as { developer: string; investor: string; youngName: string };

// The fixture's simulated decisions are dated October 2026, so the by-version table is checked only in that month.
test("Spend shows this month's AI use against the $10 cap", async ({ page, context }) => {
  const f = fixture();
  await context.addCookies([{ name: "tradent_demo_user", value: f.developer, url: "http://localhost:3100" }]);
  await page.goto("/spend");
  await expect(page.getByTestId("spent")).toBeVisible();
  await expect(page.getByText("of $10 free AI use")).toBeVisible();
  if (new Date().toISOString().startsWith("2026-10")) await expect(page.getByTestId("spend-by-version")).toContainText(f.youngName);
});

test("investors don't see Spend", async ({ page, context }) => {
  await context.addCookies([{ name: "tradent_demo_user", value: fixture().investor, url: "http://localhost:3100" }]);
  await page.goto("/spend");
  await expect(page.getByText("This page is for developers.")).toBeVisible();
});
