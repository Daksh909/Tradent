import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const fixture = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as { follower: string; listedAgent: string; listedAgentName: string; secretPrompt: string };

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "tradent_demo_user", value: fixture().follower, url: "http://localhost:3100" }]);
});

test("an investor paper-follows a listed agent, sees it in Portfolio, then stops", async ({ page }) => {
  const f = fixture();
  await page.goto("/portfolio");
  await expect(page.getByTestId("portfolio-empty")).toBeVisible();

  await page.goto(`/agents/${f.listedAgent}`);
  await page.getByTestId("follow-button").click();
  await page.getByTestId("follow-amount").fill("500");
  await page.getByTestId("follow-confirm").click();
  // The browser refuses amounts under the minimum; the server checks the bounds too (follow.test.ts).
  expect(await page.getByTestId("follow-amount").evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
  await page.getByTestId("follow-amount").fill("25000");
  await page.getByTestId("follow-confirm").click();
  await expect(page.getByTestId("following")).toContainText("$25,000");

  await page.getByTestId("following").click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByTestId("portfolio-value")).toHaveText("$25,000.00");
  await expect(page.getByTestId("active-follows")).toContainText(f.listedAgentName);
  // No broker keys in tests: positions say so instead of showing made-up numbers.
  await expect(page.getByTestId("follow-detail")).toContainText("Positions are unavailable");
  expect(await page.content()).not.toContain(f.secretPrompt);

  await page.getByTestId("unfollow-button").click();
  await expect(page.getByTestId("stopped-follows")).toContainText(f.listedAgentName);
  await expect(page.getByTestId("active-follows")).toHaveCount(0);
});
