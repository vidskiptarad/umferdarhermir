/**
 * Overtaking gap-acceptance on 1+1 (S1) segments.
 *
 * research/04 §2 + CONTRACTS.md "Engine internals":
 *   g_required(Δv) = 6 + 120 / max(Δv_kmh, 5)   seconds
 *   sight distance cap = 600 m
 *   only START overtakes projected to complete within 400 m.
 *
 * The heavy lifting (finding the leader, the oncoming stream, and mutating lane
 * state) lives in simulation.ts; this module is the pure decision math so it can
 * be unit-tested in isolation.
 */

export const SIGHT_M = 600;          // AASHTO PSD ~615 m at 90 km/h (research/04 §2b)
export const MAX_OVERTAKE_M = 400;   // cap on maneuver distance (CONTRACTS.md)
export const REMERGE_MARGIN_M = 6;   // extra clearance before pulling back in

/** Required clear time to the oncoming stream, seconds (research/04 §2b). */
export function gRequiredS(dvKmh: number): number {
  return 6 + 120 / Math.max(dvKmh, 5);
}

/**
 * Time (s) to complete the pass: close the gap, pass the leader, and re-establish
 * a safe gap ahead of it, at the speed advantage dvMs.
 *   distance to cover ≈ gap + leaderLen + s0 + margin
 */
export function overtakeTimeS(gapM: number, leaderLen: number, s0: number, dvMs: number): number {
  const dist = gapM + leaderLen + s0 + REMERGE_MARGIN_M;
  return dist / Math.max(dvMs, 0.5);
}

export interface OvertakeDecisionInput {
  ownSpeed: number;      // m/s
  ownV0: number;         // desired speed m/s (the speed used to pass)
  leaderSpeed: number;   // m/s
  gapM: number;          // bumper-to-bumper gap to slow leader
  leaderLen: number;
  s0: number;
  segLimitMs: number;    // posted-limit speed for hypothetical oncoming vehicle
  /**
   * Nearest oncoming vehicle within sight: physical distance ahead (m) and its
   * speed (m/s). Pass null if no oncoming vehicle is visible within SIGHT_M.
   */
  oncomingDistM: number | null;
  oncomingSpeed: number;
}

/** Decide whether to start an overtake. Pure — no side effects. */
export function shouldStartOvertake(inp: OvertakeDecisionInput): boolean {
  const dvMs = inp.ownV0 - inp.leaderSpeed;
  if (dvMs < 1.0) return false;                 // no real speed advantage
  // Only bother if actually held back near the leader.
  if (inp.gapM > 120) return false;

  const dvKmh = dvMs * 3.6;
  const gReq = gRequiredS(dvKmh);

  // Projected maneuver time/distance; abort if it needs more than the cap.
  const tPass = overtakeTimeS(inp.gapM, inp.leaderLen, inp.s0, dvMs);
  const passDistM = inp.ownSpeed * tPass;       // road distance consumed
  if (passDistM > MAX_OVERTAKE_M) return false;

  // Clearance vs the oncoming stream.
  if (inp.oncomingDistM == null) {
    // Nobody visible: require clearance against a hypothetical vehicle appearing
    // at the sight limit and closing at own speed + segment limit.
    const closing = inp.ownSpeed + inp.segLimitMs;
    const tToSight = SIGHT_M / Math.max(closing, 0.5);
    return tToSight >= gReq;
  }
  const closing = inp.ownSpeed + inp.oncomingSpeed;
  const tToMeet = inp.oncomingDistM / Math.max(closing, 0.5);
  return tToMeet >= gReq;
}
