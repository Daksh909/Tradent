import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

type Fixture = { developer: string; investor: string; listedAgentName: string; listedVersion: string; youngVersion: string; youngName: string; secretPrompt: string };
const fixture = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as Fixture;
const signInAs = (context: BrowserContext, id: string) => context.addCookies([{ name: "tradent_demo_user", value: id, url: "http://localhost:3100" }]);

test("Forward tests lists the developer's tests with listing progress", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.developer);
  await page.goto("/forward-tests");
  const table = page.getByTestId("forward-tests-table");
  await expect(table.getByRole("row", { name: new RegExp(f.youngName) })).toContainText("5 of 30");
  await expect(table.getByRole("row", { name: new RegExp(f.youngName) })).toContainText("4 of 20");
  await expect(table.getByRole("row", { name: new RegExp(f.listedAgentName) })).toContainText("Listed");
});

test("a forward test shows daily metrics, a verified decision log and the kill switch", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.developer);
  await page.goto(`/forward-tests/${f.youngVersion}`);
  await expect(page.getByTestId("chain-status")).toContainText("Decision log verified");
  await expect(page.getByTestId("daily-metrics").locator("tbody tr")).toHaveCount(5);
  await expect(page.getByTestId("decision-card")).toHaveCount(4);
  await expect(page.getByTestId("decision-card").first()).toContainText("AI cost");

  await page.getByTestId("kill-switch").click();
  await expect(page.getByTestId("kill-switch")).toHaveText("Restart agent");
  await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
  await page.getByTestId("kill-switch").click();
  await expect(page.getByTestId("kill-switch")).toHaveText("Stop agent");
});

test("investors can't open another developer's forward test", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.investor);
  await page.goto(`/forward-tests/${f.youngVersion}`);
  await expect(page.getByText("This page is for developers.")).toBeVisible();
});

test("Trading shows a listed agent's decisions and fills, and says when market data is unavailable", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.investor);
  await page.goto(`/trading?version=${f.listedVersion}`);
  await expect(page.getByTestId("agent-switcher")).toHaveValue(f.listedVersion);
  await expect(page.getByTestId("decision-feed").getByTestId("decision-card").first()).toContainText("(simulated record)");
  await expect(page.getByTestId("decision-feed")).not.toContainText("AI cost");
  await expect(page.getByTestId("chart-unavailable")).toContainText("broker keys");
  await page.getByRole("tab", { name: /Fills/ }).click();
  await expect(page.getByTestId("fills-table").locator("tbody tr")).toHaveCount(20);
});

test("Trading never shows an investor a developer's unlisted agent or any prompt", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.investor);
  const res = await page.goto(`/trading?version=${f.youngVersion}`);
  await expect(page.getByTestId("agent-switcher")).not.toHaveValue(f.youngVersion);
  await expect(page.getByTestId("agent-switcher").locator(`option[value="${f.youngVersion}"]`)).toHaveCount(0);
  expect(await res!.text()).not.toContain(f.secretPrompt);
  expect(await page.content()).not.toContain(f.secretPrompt);
});

test("developers can watch their own unlisted agent on Trading, with its AI cost", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.developer);
  await page.goto(`/trading?version=${f.youngVersion}`);
  await expect(page.getByTestId("agent-switcher")).toHaveValue(f.youngVersion);
  await expect(page.getByTestId("decision-feed").getByTestId("decision-card").first()).toContainText("AI cost");
});
