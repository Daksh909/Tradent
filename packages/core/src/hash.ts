import { createHash } from "node:crypto";

/** prev_hash of the first decision in each agent version's chain. */
export const GENESIS_HASH = "0".repeat(64);

/** Stable JSON: object keys sorted, so the same entry always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Hash of one DecisionLog entry, chained to the previous entry's hash. */
export function decisionHash(prevHash: string, entry: Record<string, unknown>): string {
  return createHash("sha256").update(prevHash).update(canonicalJson(entry)).digest("hex");
}

/** Index of the first entry whose hash doesn't match, or -1 if the chain is intact. */
export function verifyChain(entries: { prevHash: string; hash: string; body: Record<string, unknown> }[]): number {
  let prev = GENESIS_HASH;
  for (const [i, e] of entries.entries()) {
    if (e.prevHash !== prev || decisionHash(prev, e.body) !== e.hash) return i;
    prev = e.hash;
  }
  return -1;
}
