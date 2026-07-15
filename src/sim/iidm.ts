/**
 * Improved Intelligent Driver Model (IIDM) — car-following acceleration.
 *
 * research/04 §1: IIDM blends the free-acceleration and interaction terms so a
 * vehicle with v > v0 does NOT overbrake, and the equilibrium gap is exactly the
 * desired gap s0 + v*T (no spurious 1/sqrt(1-(v/v0)^δ) inflation). Same six
 * parameters as classic IDM.
 *
 * Treiber & Kesting, *Traffic Flow Dynamics* (2013), eq. for IIDM.
 */

export interface IdmParams {
  T: number;      // desired time headway (s)
  a: number;      // max acceleration (m/s^2)
  b: number;      // comfortable deceleration (m/s^2)
  s0: number;     // minimum standstill gap (m)
  delta: number;  // acceleration exponent (=4)
  len: number;    // vehicle length (m)
}

// CONTRACTS.md "Engine internals": cars T=1.3 a=1.2 b=1.8 s0=2 δ=4 len=5.
export const CAR: IdmParams = { T: 1.3, a: 1.2, b: 1.8, s0: 2, delta: 4, len: 5 };
// trucks T=1.7 a=0.4 b=1.5 s0=3 len=14 (research/04 §1 table).
export const TRUCK: IdmParams = { T: 1.7, a: 0.4, b: 1.5, s0: 3, delta: 4, len: 14 };

/**
 * IIDM acceleration.
 * @param v      own speed (m/s)
 * @param vLead  leader speed (m/s); pass v for "no leader" together with s=Infinity
 * @param s      bumper-to-bumper gap to leader (m). Use Infinity for free driving.
 * @param v0     desired speed (m/s)
 */
export function iidmAccel(
  v: number,
  vLead: number,
  s: number,
  v0: number,
  T: number,
  a: number,
  b: number,
  s0: number,
  delta: number,
): number {
  if (v0 < 0.1) v0 = 0.1;

  // Free-flow acceleration term (works for v>v0 without overbraking).
  let aFree: number;
  if (v <= v0) {
    aFree = a * (1 - Math.pow(v / v0, delta));
  } else {
    // v > v0: gentle relaxation back to v0, bounded (research/04 §1 IIDM fix).
    aFree = -b * (1 - Math.pow(v0 / Math.max(v, 0.01), (a * delta) / b));
  }

  if (!isFinite(s) || s >= 1e8) {
    // No leader → pure free acceleration.
    return aFree;
  }
  if (s < 0.1) s = 0.1;

  const dv = v - vLead;
  let interact = v * T + (v * dv) / (2 * Math.sqrt(a * b));
  if (interact < 0) interact = 0;               // IIDM max(0, ...) term
  const sStar = s0 + interact;                  // desired dynamic gap
  const z = sStar / s;

  let acc: number;
  if (v <= v0) {
    if (z >= 1) {
      acc = a * (1 - z * z);
    } else {
      const denom = aFree > 1e-6 ? aFree : 1e-6;
      acc = aFree * (1 - Math.pow(z, (2 * a) / denom));
    }
  } else {
    if (z >= 1) {
      acc = aFree + a * (1 - z * z);
    } else {
      acc = aFree;
    }
  }
  return acc;
}

/** Convenience wrapper taking an IdmParams bundle. */
export function accel(v: number, vLead: number, s: number, v0: number, p: IdmParams): number {
  return iidmAccel(v, vLead, s, v0, p.T, p.a, p.b, p.s0, p.delta);
}

/**
 * IIDM steady-state (equilibrium) gap for a follower matching leader speed.
 * At dv=0 and a=0 the IIDM sits at z=1 ⇒ s_eq = s0 + v*T exactly.
 * Used by the equilibrium-gap unit test.
 */
export function equilibriumGap(v: number, s0: number, T: number): number {
  return s0 + v * T;
}
