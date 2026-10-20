import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@tradent/core", "@tradent/db", "@tradent/broker"],
  serverExternalPackages: ["postgres"],
};

export default config;
