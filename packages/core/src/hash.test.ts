import { describe, expect, it } from "vitest";
import { GENESIS_HASH, canonicalJson, decisionHash, verifyChain } from "./hash";

function chain(bodies: Record<string, unknown>[]) {
  let prev = GENESIS_HASH;
  return bodies.map((body) => {
    const hash = decisionHash(prev, body);
    const e = { prevHash: prev, hash, body };
    prev = hash;
    return e;
  });
}

describe("decision hash chain", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
  it("verifies an intact chain", () => {
    expect(verifyChain(chain([{ n: 1 }, { n: 2 }, { n: 3 }]))).toBe(-1);
  });
  it("detects an edited entry", () => {
    const c = chain([{ n: 1 }, { n: 2 }, { n: 3 }]);
    c[1]!.body = { n: 99 };
    expect(verifyChain(c)).toBe(1);
  });
});
