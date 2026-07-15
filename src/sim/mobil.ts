/**
 * MOBIL lane-change model for multi-lane sections (S21 two-lane side, D2).
 *
 * research/04 §3 + CONTRACTS.md: p=0.35, b_safe=4, Δa_th=0.2, keep-right bias 0.2.
 * Lane 0 = right (driving) lane, lane 1 = left (passing) lane; European asymmetric
 * keep-right rule.
 *
 * Pure math: the caller supplies IIDM accelerations for the current and
 * prospective configurations. Returns whether the change is worthwhile & safe.
 */

export const MOBIL = {
  p: 0.35,          // politeness
  bSafe: 4,         // max imposed deceleration on the new follower (m/s^2)
  aThr: 0.2,        // switching threshold (m/s^2)
  keepRight: 0.2,   // keep-right bias magnitude (m/s^2)
};

export interface MobilInput {
  /** own accel now (current lane) and if moved to target lane */
  aCur: number;
  aTilde: number;
  /** new follower (in target lane): accel now, and after `c` cuts in */
  anCur: number;
  anTilde: number;
  /** old follower (in current lane): accel now, and after `c` leaves */
  aoCur: number;
  aoTilde: number;
  /** true if the target lane is the LEFT (passing) lane */
  toLeft: boolean;
}

/** MOBIL decision. Returns true if the lane change should be performed. */
export function mobilChange(inp: MobilInput): boolean {
  // Safety: don't force the new follower to brake harder than b_safe.
  if (inp.anTilde < -MOBIL.bSafe) return false;

  // Keep-right asymmetric bias: moving LEFT is discouraged (+bias to threshold),
  // moving RIGHT is encouraged (−bias).
  const bias = inp.toLeft ? MOBIL.keepRight : -MOBIL.keepRight;

  const gain = (inp.aTilde - inp.aCur)
    + MOBIL.p * ((inp.anTilde - inp.anCur) + (inp.aoTilde - inp.aoCur));

  return gain > MOBIL.aThr + bias;
}
