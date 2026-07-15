/**
 * Statistics helpers: percentiles, harmonic mean, and a rolling 120 s window of
 * per-segment / per-direction speeds (CONTRACTS.md "Rolling segment stats").
 */

/** Linear-interpolated percentile (0..1) of an unsorted numeric array. */
export function percentile(values: number[], p: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const s = values.slice().sort((x, y) => x - y);
  if (n === 1) return s[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  const frac = idx - lo;
  return s[lo] * (1 - frac) + s[hi] * frac;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

/**
 * Rolling harmonic-mean speed per (segment, direction) over a fixed time window.
 *
 * Harmonic mean of speeds is the space-mean speed — the correct average for
 * travel-time / segment-speed reporting. Implemented as a ring of per-step bins;
 * each bin holds a vehicle-sample count and a sum of 1/v, with running totals so
 * segmentStats() is O(segments).
 */
export class RollingSegStats {
  readonly nSeg: number;
  readonly nBins: number;
  private bin = 0;
  // [seg*2 + dir] indexed, each a ring buffer of length nBins.
  private cnt: Float64Array;   // sample counts per bin
  private inv: Float64Array;   // sum of 1/v (s/m) per bin
  private sumCnt: Float64Array; // running total per (seg,dir)
  private sumInv: Float64Array;

  constructor(nSeg: number, windowS: number, dtS: number) {
    this.nSeg = nSeg;
    this.nBins = Math.max(1, Math.round(windowS / dtS));
    const lanes = nSeg * 2;
    this.cnt = new Float64Array(lanes * this.nBins);
    this.inv = new Float64Array(lanes * this.nBins);
    this.sumCnt = new Float64Array(lanes);
    this.sumInv = new Float64Array(lanes);
  }

  /** Advance to a fresh bin, evicting the window's oldest contribution. */
  rotate(): void {
    this.bin = (this.bin + 1) % this.nBins;
    const base = this.bin;
    for (let k = 0; k < this.nSeg * 2; k++) {
      const idx = k * this.nBins + base;
      this.sumCnt[k] -= this.cnt[idx];
      this.sumInv[k] -= this.inv[idx];
      this.cnt[idx] = 0;
      this.inv[idx] = 0;
    }
  }

  /** Record one vehicle sample (speed m/s) in the current bin. */
  sample(segIdx: number, dir: number, speedMs: number): void {
    const v = speedMs > 0.2 ? speedMs : 0.2;
    const k = segIdx * 2 + dir;
    const idx = k * this.nBins + this.bin;
    this.cnt[idx] += 1;
    this.inv[idx] += 1 / v;
    this.sumCnt[k] += 1;
    this.sumInv[k] += 1 / v;
  }

  /** Harmonic-mean speed (km/h) over the window, or -1 if no samples. */
  harmonicKmh(segIdx: number, dir: number): number {
    const k = segIdx * 2 + dir;
    if (this.sumCnt[k] < 1 || this.sumInv[k] <= 0) return -1;
    const vMs = this.sumCnt[k] / this.sumInv[k];
    return vMs * 3.6;
  }

  vehCount(segIdx: number): number {
    return this.sumCnt[segIdx * 2] + this.sumCnt[segIdx * 2 + 1];
  }
}
