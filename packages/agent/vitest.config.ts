import { defineConfig } from "vitest/config";

// The scheduler tests pick up every active agent in the database, so test files run one at a time.
export default defineConfig({ test: { fileParallelism: false } });
