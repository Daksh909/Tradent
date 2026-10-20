import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const users = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as { developer: string; investor: string; toggler: string };

test("signed-out visitors land on the sign-in page, which shows the Paper badge", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId("paper-badge")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
});

for (const [provider, host, label] of [
  ["github", "github.com", "Continue with GitHub"],
  ["google", "accounts.google.com", "Continue with Google"],
] as const) {
  test(`${label} sends the browser to ${host} with our callback URL`, async ({ page }) => {
    await page.route(`https://${host}/**`, (route) => route.abort());
    await page.goto("/sign-in");
    const request = page.waitForRequest((r) => new URL(r.url()).host === host);
    await page.getByRole("button", { name: label }).click();
    const url = new URL((await request).url());
    expect(url.searchParams.get("client_id")).toBe(`e2e-${provider}-client`);
    expect(url.searchParams.get("redirect_uri")).toBe(`http://localhost:3100/api/auth/callback/${provider}`);
  });
}

test("demo sign-in, then sign out", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByTestId("demo-sign-in").getByRole("button", { name: /E2E Investor/ }).first().click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/library");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("turning on developer tools shows the build pages", async ({ page, context }) => {
  await context.addCookies([{ name: "tradent_demo_user", value: users().toggler, url: "http://localhost:3100" }]);
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Studio" })).toHaveCount(0);
  await page.getByTestId("developer-toggle").click();
  await expect(page.getByRole("link", { name: "Studio" })).toBeVisible();
  await page.getByTestId("developer-toggle").click();
  await expect(page.getByRole("link", { name: "Studio" })).toHaveCount(0);
});
