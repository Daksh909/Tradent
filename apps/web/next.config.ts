import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env at the repo root serves the web app and the worker.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@tradent/core", "@tradent/db", "@tradent/broker"],
  serverExternalPackages: ["postgres"],
};

export default config;
