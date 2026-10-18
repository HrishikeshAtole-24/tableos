/**
 * Pure fee rules (spec §2.3). Kept free of I/O so they can be tested exhaustively.
 */

export interface FeeConfig {
  feePerOrderPaise: number;
  monthlyCapPaise: number;
}

/** Fee for the next accepted order given fees already charged this month. */
export function orderFee(cfg: FeeConfig, feesChargedThisMonthPaise: number, flatPlanActive: boolean): number {
  if (flatPlanActive) return 0;
  return Math.max(0, Math.min(cfg.feePerOrderPaise, cfg.monthlyCapPaise - feesChargedThisMonthPaise));
}

export interface GraceConfig {
  graceFloorPaise: number;
  graceHours: number;
}

/** Grace has ended when the balance is below the floor or zero was reached too long ago. */
export function graceEnded(cfg: GraceConfig, balancePaise: number, zeroReachedAt: Date | null, now: Date): boolean {
  if (balancePaise < cfg.graceFloorPaise) return true;
  if (balancePaise > 0 || !zeroReachedAt) return false;
  return now.getTime() - zeroReachedAt.getTime() >= cfg.graceHours * 3_600_000;
}

export function graceEndsAt(cfg: GraceConfig, zeroReachedAt: Date | null): Date | null {
  return zeroReachedAt ? new Date(zeroReachedAt.getTime() + cfg.graceHours * 3_600_000) : null;
}

/**
 * Alert threshold newly crossed by a balance change, or null. `levels` are descending
 * (e.g. [10000, 2000]); an alert fires once per crossing until a recharge resets it.
 */
export function crossedAlertLevel(levels: number[], balancePaise: number, lastAlertLevel: number | null): number | null {
  const sorted = [...levels].sort((a, b) => a - b); // ascending: lowest first
  for (const level of sorted) {
    if (balancePaise <= level && (lastAlertLevel === null || level < lastAlertLevel)) return level;
  }
  return null;
}

export function gstOn(amountPaise: number, gstRateBp: number): number {
  return Math.round((amountPaise * gstRateBp) / 10_000);
}
