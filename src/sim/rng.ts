/**
 * Deterministic seeded RNG for the Umferð engine.
 *
 * mulberry32 — tiny, fast, good statistical quality for simulation use.
 * The whole engine draws randomness ONLY from an instance of this class, so a
 * given seed reproduces a run bit-for-bit (CONTRACTS.md "Determinism").
 * No Date.now / Math.random anywhere.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    // Force to uint32; avoid a zero state producing a short cycle.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Standard normal via Box–Muller (single draw; deterministic). */
  normal(mean = 0, sd = 1): number {
    // Guard against log(0).
    let u1 = this.next();
    if (u1 < 1e-12) u1 = 1e-12;
    const u2 = this.next();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    return mean + sd * mag * Math.cos(2 * Math.PI * u2);
  }

  /** Truncated normal — resample until inside [lo, hi] (research/04 §4). */
  truncNormal(mean: number, sd: number, lo: number, hi: number): number {
    for (let i = 0; i < 64; i++) {
      const x = this.normal(mean, sd);
      if (x >= lo && x <= hi) return x;
    }
    // Fallback after pathological params: clamp a fresh draw.
    return Math.min(hi, Math.max(lo, this.normal(mean, sd)));
  }

  /** Exponential inter-arrival for a Poisson process of rate `lambda` (per unit). */
  exponential(lambda: number): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    return -Math.log(u) / lambda;
  }
}
