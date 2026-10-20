export interface RiskLimits {
  /** Max share of account equity in one position, 0 to 1. */
  maxPositionPct: number;
  /** Daily loss, 0 to 1, after which the agent stops for the day. */
  maxDailyLossPct: number;
  /** Symbols the agent may trade; empty means any equity or listed option. */
  allowedSymbols: string[];
}

// DEFAULT: platform ceilings. Developers may tighten these, never loosen them.
export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxPositionPct: 0.2,
  maxDailyLossPct: 0.05,
  allowedSymbols: [],
};

/** Clamp a developer's limits so they never exceed the platform defaults. */
export function clampRiskLimits(limits: Partial<RiskLimits>): RiskLimits {
  return {
    maxPositionPct: Math.min(limits.maxPositionPct ?? DEFAULT_RISK_LIMITS.maxPositionPct, DEFAULT_RISK_LIMITS.maxPositionPct),
    maxDailyLossPct: Math.min(limits.maxDailyLossPct ?? DEFAULT_RISK_LIMITS.maxDailyLossPct, DEFAULT_RISK_LIMITS.maxDailyLossPct),
    allowedSymbols: limits.allowedSymbols ?? [],
  };
}
