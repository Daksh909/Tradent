import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { USERS_FILE } from "./global-setup";

type Fixture = { developer: string; investor: string; listedAgent: string; listedAgentName: string; listedVersion: string; youngVersion: string; youngName: string; secretPrompt: string };
const fixture = () => JSON.parse(readFileSync(USERS_FILE, "utf8")) as Fixture;
const signInAs = (context: BrowserContext, id: string) => context.addCookies([{ name: "tradent_demo_user", value: id, url: "http://localhost:3100" }]);
const canvas = (page: Page) => page.getByTestId("studio-canvas");

test("a developer drafts, saves and edits a new agent", async ({ page, context }) => {
  await signInAs(context, fixture().developer);
  await page.goto("/studio?new=1");
  await page.getByTestId("agent-name").fill(`Studio E2E ${Date.now()}`);
  await page.getByTestId("public-summary").fill("Buys SPY dips on paper.");
  await canvas(page).getByText("AI model: Sonnet 5.5").click();
  await expect(page.getByTestId("cost-estimate")).toContainText("$3.82");
  await page.getByTestId("instructions").fill("Buy SPY when RSI(14) < 30.");
  await page.getByTestId("model-select").selectOption("haiku");
  await expect(canvas(page).getByText("AI model: Haiku 5.5")).toBeVisible();

  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("studio-notice")).toHaveText("Saved as version 1.");
  await expect(page).toHaveURL(/\/studio\?version=/);
  await expect(page.getByTestId("save-version")).toHaveText("Saved");

  await page.getByRole("button", { name: "Add strategy block" }).click();
  await expect(canvas(page).getByText("New strategy")).toBeVisible();
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("studio-notice")).toHaveText("Saved as version 1.");
});

test("Studio says what's missing instead of failing without broker or AI keys", async ({ page, context }) => {
  await signInAs(context, fixture().developer);
  await page.goto("/studio?new=1");
  await page.getByTestId("agent-name").fill(`Keyless ${Date.now()}`);
  await page.getByTestId("public-summary").fill("p");
  await canvas(page).getByText("AI model: Sonnet 5.5").click();
  await page.getByTestId("instructions").fill("Hold.");
  await page.getByTestId("save-version").click();
  await expect(page.getByTestId("studio-notice")).toHaveText("Saved as version 1.");

  await page.getByTestId("run-smoke-test").click();
  await expect(page.getByTestId("studio-notice")).toContainText("Alpaca sandbox keys");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("start-forward-test").click();
  await expect(page.getByTestId("studio-notice")).toContainText("Alpaca sandbox keys");

  await page.getByLabel("Message to the builder").fill("Buy SPY on dips");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("builder-chat")).toContainText("ANTHROPIC_API_KEY");
});

test("a locked version can't be edited in place", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.developer);
  await page.goto(`/studio?version=${f.youngVersion}`);
  await expect(page.getByTestId("locked-note")).toContainText("v1 is locked");
  await expect(page.getByTestId("save-version")).toHaveText("Save as v2");
  await expect(page.getByTestId("start-forward-test")).toBeDisabled();
});

test("forking a listed agent opens its public parts without the prompt", async ({ page, context }) => {
  const f = fixture();
  await signInAs(context, f.developer);
  await page.goto(`/agents/${f.listedAgent}`);
  await page.getByTestId("fork-button").click();
  await expect(page).toHaveURL(/\/studio\?fork=/);
  await expect(page.getByTestId("agent-name")).toHaveValue(`${f.listedAgentName} fork`);
  await expect(page.getByText("1 parent")).toBeVisible();
  await canvas(page).getByText("AI model: Sonnet 5.5").click();
  await expect(page.getByTestId("instructions")).toHaveValue("");
  expect(await page.content()).not.toContain(f.secretPrompt);
});

test("investors can't use Studio", async ({ page, context }) => {
  await signInAs(context, fixture().investor);
  await page.goto("/studio");
  await expect(page.getByText("This page is for developers.")).toBeVisible();
});
