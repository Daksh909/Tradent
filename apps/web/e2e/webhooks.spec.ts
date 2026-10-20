import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const fixture = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as { developer: string; investor: string; youngName: string };

test("a developer creates a TradingView webhook and an alert is stored for the next decision", async ({ page, context, request }) => {
  const f = fixture();
  await context.addCookies([{ name: "tradent_demo_user", value: f.developer, url: "http://localhost:3100" }]);
  await page.goto("/spend");
  const row = page.getByTestId("webhook-row").filter({ hasText: f.youngName });
  await row.getByTestId("webhook-new").click();
  const url = await row.getByTestId("webhook-url").inputValue();
  expect(url).toMatch(/\/api\/webhooks\/tradingview\/[0-9a-f-]{36}\/[\w-]{32}$/);

  const path = new URL(url).pathname;
  expect((await request.post(path, { data: '{"ticker":"SPY","action":"buy"}' })).status()).toBe(202);
  expect((await request.post(path.replace(/[^/]+$/, "wrong-secret"), { data: "{}" })).status()).toBe(401);

  await page.reload();
  await expect(page.getByTestId("webhook-row").filter({ hasText: f.youngName })).toContainText("1 alert waiting for the next decision");
  // The secret is shown once, never again.
  expect(await page.content()).not.toContain(path.split("/").pop()!);
});

test("investors don't see webhooks", async ({ page, context }) => {
  await context.addCookies([{ name: "tradent_demo_user", value: fixture().investor, url: "http://localhost:3100" }]);
  await page.goto("/spend");
  await expect(page.getByTestId("webhooks")).toHaveCount(0);
});
