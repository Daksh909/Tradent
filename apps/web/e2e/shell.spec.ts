import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

const users = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as { developer: string; investor: string };

async function signInAs(context: BrowserContext, id: string) {
  await context.addCookies([{ name: "tradent_demo_user", value: id, url: "http://localhost:3100" }]);
}

const PAGES = ["/library", "/studio", "/forward-tests", "/trading", "/portfolio", "/spend", "/settings"];

test("every page shows the Paper badge and the market status", async ({ page, context }) => {
  await signInAs(context, users().developer);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByTestId("paper-badge"), path).toBeVisible();
    await expect(page.getByTestId("market-status"), path).toBeVisible();
  }
});

test("the home page opens the Library", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
});

test("market status says it is unavailable without broker keys", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByTestId("market-status")).toHaveAttribute("data-status", "unavailable");
});

test("developers see the build pages and investors don't", async ({ page, context }) => {
  await signInAs(context, users().developer);
  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Studio" })).toBeVisible();

  await signInAs(context, users().investor);
  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Studio" })).toHaveCount(0);
  await page.goto("/studio");
  await expect(page.getByText("This page is for developers.")).toBeVisible();
});

test("the demo user switcher changes who is signed in", async ({ page, context }) => {
  await signInAs(context, users().developer);
  await page.goto("/library");
  await page.getByTestId("user-menu").click();
  await page.getByText("Switch demo user").click();
  await page.getByRole("menuitem", { name: /E2E Investor/ }).first().click();
  await expect(page.getByTestId("user-menu")).toContainText("E2E Investor");
  await expect(page.getByRole("link", { name: "Studio" })).toHaveCount(0);
});

test("the command palette opens with Ctrl+K and navigates", async ({ page, context }) => {
  await signInAs(context, users().developer);
  await page.goto("/library");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Type a page or command...").fill("Trading");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/trading$/);
});

test("the dark theme is the default", async ({ page }) => {
  await page.goto("/library");
  await expect(page.locator("html")).toHaveClass(/dark/);
});
