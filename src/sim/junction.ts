/**
 * Junction / roundabout capacity as a gap-acceptance server (research/04 §7).
 *
 *   C = q·exp(−q·t_c) / (1 − exp(−q·t_f))     veh/s,  q = conflictingVph / 3600
 *   t_c = 4.5 s, t_f = 2.8 s (CONTRACTS.md)
 *
 * The engine implements the node as a FIFO gate that releases the front-of-queue
 * vehicle no faster than one per 1/C seconds (see simulation.ts), plus a low-v0
 * through-speed zone of ±80 m.
 *
 * Signals (CONTRACTS.md simplification): modelled as the same capacity server
 * with effective capacity ×0.5 — we do NOT simulate red/green cycles.
 */

export const TC_S = 4.5;
export const TF_S = 2.8;
export const ZONE_HALF_M = 80; // through-speed zone half-width

/** Analytic gap-acceptance capacity, veh/s. Robust as q → 0 (→ 1/t_f). */
export function capacityVehPerS(conflictingVph: number, tc = TC_S, tf = TF_S): number {
  const q = Math.max(conflictingVph, 0) / 3600;
  if (q < 1e-6) return 1 / tf; // limit of the Harders formula as q→0
  const c = (q * Math.exp(-q * tc)) / (1 - Math.exp(-q * tf));
  return c > 1e-6 ? c : 1e-6;
}
