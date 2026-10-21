import { defineConfig } from "vitest/config";

// The scheduler tests pick up every active agent in the database, so test files run one at a time.
// Tests share one database across runs, so the site-wide AI cap is lifted here; its own test passes a cap.
export default defineConfig({ test: { fileParallelism: false, env: { TRADENT_SITE_AI_CAP_USD: "1000000000" } } });
