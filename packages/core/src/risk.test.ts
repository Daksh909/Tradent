import { describe, expect, it } from "vitest";
import { clampRiskLimits } from "./risk";

describe("clampRiskLimits", () => {
  it("keeps tighter limits", () => {
    expect(clampRiskLimits({ maxPositionPct: 0.1, maxDailyLossPct: 0.02 })).toMatchObject({ maxPositionPct: 0.1, maxDailyLossPct: 0.02 });
  });
  it("never loosens past the platform defaults", () => {
    expect(clampRiskLimits({ maxPositionPct: 0.9, maxDailyLossPct: 0.5 })).toMatchObject({ maxPositionPct: 0.2, maxDailyLossPct: 0.05 });
  });
});
