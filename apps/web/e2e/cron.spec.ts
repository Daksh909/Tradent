import { expect, test } from "@playwright/test";

test("the scheduler endpoint needs the cron secret, and says when broker or AI keys are missing", async ({ request }) => {
  expect((await request.get("/api/cron/tick")).status()).toBe(401);
  expect((await request.get("/api/cron/tick", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const res = await request.get("/api/cron/tick", { headers: { authorization: "Bearer e2e-cron-secret-0123456789" } });
  expect(res.status()).toBe(503);
  expect((await res.json()).error).toContain("Alpaca sandbox keys");
});
