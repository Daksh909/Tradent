import "server-only";
import { createDb, type Db } from "@tradent/db";

// One pool per server process, kept across hot reloads in development.
const g = globalThis as unknown as { tradentDb?: Db };

export function getDb(): Db {
  g.tradentDb ??= createDb().db;
  return g.tradentDb;
}
