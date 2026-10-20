import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const fixture = () =>
  JSON.parse(readFileSync(USERS_FILE, "utf8")) as { investor: string; listedAgent: string; listedAgentName: string; strategyName: string; secretPrompt: string };

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "tradent_demo_user", value: fixture().investor, url: "http://localhost:3100" }]);
});

test("the Library lists an agent with 30 trading days and 20 trades", async ({ page }) => {
  const f = fixture();
  await page.goto("/library");
  const card = page.getByTestId("agent-card").filter({ hasText: f.listedAgentName });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("young-record")).toBeVisible();
  await expect(card).toContainText("Sonnet 5.5");
});

test("the Library filters agents by model", async ({ page }) => {
  const f = fixture();
  await page.goto("/library?model=opus");
  await expect(page.getByTestId("agent-card").filter({ hasText: f.listedAgentName })).toHaveCount(0);
  await page.goto("/library?model=sonnet&instrument=equity");
  await expect(page.getByTestId("agent-card").filter({ hasText: f.listedAgentName })).toBeVisible();
});

test("the Strategies tab shows which listed agents use a strategy", async ({ page }) => {
  const f = fixture();
  await page.goto("/library?tab=strategies");
  const card = page.getByTestId("strategy-card").filter({ hasText: f.strategyName });
  await expect(card).toContainText(f.listedAgentName);
});

test("Agent detail shows the record, chart with TradingView credit, and trades with their decisions", async ({ page }) => {
  const f = fixture();
  await page.goto(`/agents/${f.listedAgent}`);
  await expect(page.getByRole("heading", { name: f.listedAgentName })).toBeVisible();
  await expect(page.getByTestId("equity-chart")).toBeVisible();
  await expect(page.locator('a[href*="tradingview.com"]')).toHaveCount(1);
  await expect(page.getByTestId("trades-table").locator("tbody tr")).toHaveCount(20);
  await page.getByTestId("trades-table").locator("summary").first().click();
  await expect(page.getByTestId("trades-table")).toContainText("(simulated record)");
  await expect(page.getByTestId("follow-button")).toBeDisabled();
});

test("investor pages never contain the agent's prompt", async ({ page, request }) => {
  const f = fixture();
  for (const path of ["/library", "/library?tab=strategies", `/agents/${f.listedAgent}`]) {
    const res = await page.goto(path);
    expect(await res!.text(), path).not.toContain(f.secretPrompt);
    expect(await page.content(), path).not.toContain(f.secretPrompt);
  }
  // Also the raw server response, including the React payload sent to the browser.
  const raw = await request.get(`/agents/${f.listedAgent}`, { headers: { cookie: `tradent_demo_user=${f.investor}` } });
  expect(await raw.text()).not.toContain(f.secretPrompt);
});
