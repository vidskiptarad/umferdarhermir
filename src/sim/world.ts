/**
 * World resolution: scenario application, free-flow travel time, and the flat
 * SoA lookup structures the hot loop uses (segment arrays, junction gates).
 */
import type {
  CorridorModel,
  Scenario,
  SegmentConfig,
  JunctionDef,
} from '../types';
import { capacityVehPerS, ZONE_HALF_M } from './junction';

export const MEAN_CAR_V0_KMH = 92; // research/04 §4, research/06 §1 (free-flow mean)
export const DEFAULT_ADOPTION = 0.7; // CONTRACTS.md speedLimitAdoption default
const MIN_DESIRED_KMH = 30;

function configHasBarrier(c: SegmentConfig): boolean {
  return c !== 'S1';
}

/**
 * Resolve a scenario into a concrete CorridorModel (pure; exported for UI+econ).
 * - segment overrides replace config / maxspeed; a barrier config forces
 *   barrier:true, overtakingAllowed:false.
 * - junction overrides convert the node to grade-separated: through speed = the
 *   containing segment's limit, capacity constraint removed (conflictingVph 0).
 */
export function applyScenario(model: CorridorModel, scenario: Scenario): CorridorModel {
  const segments = model.segments.map((s) => ({ ...s }));

  for (const ov of scenario.segmentOverrides) {
    const seg = segments.find((s) => s.id === ov.segmentId);
    if (!seg) continue;
    if (ov.config !== undefined) {
      seg.config = ov.config;
      if (configHasBarrier(ov.config)) {
        seg.barrier = true;
        seg.overtakingAllowed = false;
      } else {
        seg.barrier = false;
      }
    }
    if (ov.maxspeedKmh !== undefined) seg.maxspeedKmh = ov.maxspeedKmh;
  }

  const segAt = (offsetM: number) =>
    segments.find((s) => offsetM >= s.fromM && offsetM < s.toM) ??
    segments[segments.length - 1];

  const junctions = model.junctions.map((j) => ({ ...j }));
  for (const ov of scenario.junctionOverrides) {
    const j = junctions.find((x) => x.id === ov.junctionId);
    if (!j) continue;
    j.type = 'grade-separated';
    j.throughSpeedKmh = segAt(j.offsetM).maxspeedKmh;
    j.conflictingVph = 0;
  }

  return { ...model, segments, junctions };
}

/**
 * Free-flow travel time (s) for a direction at the desired-speed mean, including
 * junction through-speed slowdowns. Pure; uses the model's posted limits as the
 * desired-speed anchor (mean car does MEAN_CAR_V0_KMH scaled by limit/90).
 *
 * Junction slowdown is approximated as traversing the 2·ZONE_HALF_M zone at the
 * through speed instead of the free speed (hand-checkable; ignores accel/decel
 * transients).
 *
 * Documented limitations of this PURE function:
 * - Symmetric in direction: `dir` does not change the result today — kept for
 *   signature/forward-compat.
 * - Grade-free: FF is anchored on the mean CAR, whose grade losses (≤ ~10% at
 *   8%) are within this estimate's tolerance; the running engine DOES apply
 *   grade to per-vehicle desired speeds (see Simulation.desired).
 * - speedLimitAdoption is NOT applied here: adoption is defined against the
 *   PRE-scenario limit, which a resolved CorridorModel no longer carries. The
 *   engine's SimAggregates.freeFlowTravelTimeS DOES apply it (World.freeFlowTimeS),
 *   so delay-vs-freeflow economics are adoption-consistent. For a baseline
 *   (no-override) model both functions agree exactly.
 */
export function freeFlowTime(model: CorridorModel, _dir: 0 | 1): number {
  const segFreeMs = (limit: number) =>
    Math.max(MIN_DESIRED_KMH, MEAN_CAR_V0_KMH * (limit / 90)) / 3.6;

  let t = 0;
  for (const s of model.segments) {
    t += (s.toM - s.fromM) / segFreeMs(s.maxspeedKmh);
  }

  const segAt = (offsetM: number) =>
    model.segments.find((s) => offsetM >= s.fromM && offsetM < s.toM) ??
    model.segments[model.segments.length - 1];

  for (const j of model.junctions) {
    if (j.type === 'grade-separated') continue;
    const vFree = segFreeMs(segAt(j.offsetM).maxspeedKmh);
    const vThr = Math.max(5, j.throughSpeedKmh) / 3.6; // clamp: signals ~0 would be infinite
    const zone = 2 * ZONE_HALF_M;
    const extra = zone * (1 / vThr - 1 / vFree);
    if (extra > 0) t += extra;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Flattened world used by the hot loop.
// ---------------------------------------------------------------------------

export interface GateState {
  offsetM: number;
  lineFwd: number;     // progress coordinate of the stop line, dir 0
  lineRev: number;     // progress coordinate, dir 1
  throughMs: number;
  isGate: boolean;     // false for grade-separated
  headwayS: number;    // 1 / capacity
  nextService: [number, number]; // per direction service-available time (s)
}

const LANES_BY_CONFIG: Record<SegmentConfig, [number, number]> = {
  // [fwdLanes, revLanes]
  S1: [1, 1],
  S21F: [2, 1],
  S21R: [1, 2],
  D2: [2, 2],
};

/**
 * Resolved, allocation-free world: parallel segment arrays + gate list.
 * `adjLimitKmh` folds in the speedLimitAdoption rule vs the ORIGINAL model.
 */
export class World {
  readonly lengthM: number;
  readonly nSeg: number;
  readonly segFrom: Float64Array;
  readonly segTo: Float64Array;
  readonly segAdjFactor: Float64Array; // adjLimitKmh / 90 (desired-speed scaling)
  readonly segGrade: Float64Array;     // signed %, + = uphill in the FWD direction
  readonly segLimitMs: Float64Array;   // posted (resolved) limit in m/s
  readonly segOvertake: Uint8Array;    // S1 legal passing
  readonly segIsS1: Uint8Array;
  readonly segFwdLanes: Uint8Array;
  readonly segRevLanes: Uint8Array;
  readonly segIds: string[];
  readonly gates: GateState[];
  readonly resolved: CorridorModel;

  constructor(original: CorridorModel, scenario: Scenario) {
    const adoption = scenario.speedLimitAdoption ?? DEFAULT_ADOPTION;
    const resolved = applyScenario(original, scenario);
    this.resolved = resolved;
    this.lengthM = resolved.lengthM;
    const segs = resolved.segments;
    this.nSeg = segs.length;
    this.segFrom = new Float64Array(this.nSeg);
    this.segTo = new Float64Array(this.nSeg);
    this.segAdjFactor = new Float64Array(this.nSeg);
    this.segGrade = new Float64Array(this.nSeg);
    this.segLimitMs = new Float64Array(this.nSeg);
    this.segOvertake = new Uint8Array(this.nSeg);
    this.segIsS1 = new Uint8Array(this.nSeg);
    this.segFwdLanes = new Uint8Array(this.nSeg);
    this.segRevLanes = new Uint8Array(this.nSeg);
    this.segIds = [];

    for (let i = 0; i < this.nSeg; i++) {
      const s = segs[i];
      const orig = original.segments.find((o) => o.id === s.id);
      const origLimit = orig ? orig.maxspeedKmh : s.maxspeedKmh;
      const newLimit = s.maxspeedKmh;
      // Adoption only applies to a RAISED limit (research/06 §4).
      const adjLimit = newLimit > origLimit
        ? origLimit + adoption * (newLimit - origLimit)
        : newLimit;
      this.segFrom[i] = s.fromM;
      this.segTo[i] = s.toM;
      this.segAdjFactor[i] = adjLimit / 90;
      this.segGrade[i] = s.gradePct;
      this.segLimitMs[i] = newLimit / 3.6;
      this.segOvertake[i] = s.overtakingAllowed && !s.barrier ? 1 : 0;
      this.segIsS1[i] = s.config === 'S1' ? 1 : 0;
      const lanes = LANES_BY_CONFIG[s.config];
      this.segFwdLanes[i] = lanes[0];
      this.segRevLanes[i] = lanes[1];
      this.segIds.push(s.id);
    }

    this.gates = resolved.junctions.map((j: JunctionDef) => {
      const isGate = j.type !== 'grade-separated';
      let cap = capacityVehPerS(j.conflictingVph);
      // SIGNAL SIMPLIFICATION (CONTRACTS.md said "through speed 0 → treat
      // simply; document your simplification"): we never model a full stop or
      // red/green cycles. A signal is the same FIFO capacity server with
      // effective capacity ×0.5, and vehicles pass at the junction's
      // through-speed zone like any other gate. Average delay ≈ right; the
      // stop-and-go microstructure is not reproduced.
      if (j.type === 'signal') cap *= 0.5;
      return {
        offsetM: j.offsetM,
        lineFwd: j.offsetM,
        lineRev: this.lengthM - j.offsetM,
        throughMs: Math.max(3, j.throughSpeedKmh) / 3.6,
        isGate,
        headwayS: 1 / cap,
        nextService: [0, 0],
      } as GateState;
    });
    // Sort gates by offset for deterministic ordering.
    this.gates.sort((a, b) => a.offsetM - b.offsetM);
  }

  /** Segment index containing offsetM (binary search). */
  segIndexAt(offsetM: number): number {
    let lo = 0;
    let hi = this.nSeg - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segFrom[mid] <= offsetM) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Lanes available for travel in `dir` on segment `segIdx`. */
  lanesForDir(segIdx: number, dir: number): number {
    return dir === 0 ? this.segFwdLanes[segIdx] : this.segRevLanes[segIdx];
  }

  /**
   * Free-flow travel time (s) using the SAME adoption-adjusted desired speeds
   * the engine's desired() uses (segAdjFactor = adjLimit/90), so
   * SimAggregates delay-vs-freeflow is not distorted by speedLimitAdoption
   * (review MAJOR-1: the pure freeFlowTime() sees only posted limits).
   * Grade-free like the pure function (FF anchors on the mean car; car grade
   * losses ≤ ~10% at 8% are within tolerance). Direction-symmetric.
   */
  freeFlowTimeS(_dir: 0 | 1): number {
    const minMs = 30 / 3.6;
    let t = 0;
    for (let i = 0; i < this.nSeg; i++) {
      const v = Math.max(minMs, (MEAN_CAR_V0_KMH * this.segAdjFactor[i]) / 3.6);
      t += (this.segTo[i] - this.segFrom[i]) / v;
    }
    for (const g of this.gates) {
      if (!g.isGate) continue;
      const segIdx = this.segIndexAt(Math.min(g.offsetM, this.lengthM - 1));
      const vFree = Math.max(minMs, (MEAN_CAR_V0_KMH * this.segAdjFactor[segIdx]) / 3.6);
      const vThr = Math.max(5 / 3.6, g.throughMs); // same clamp as pure freeFlowTime
      const extra = 2 * ZONE_HALF_M * (1 / vThr - 1 / vFree);
      if (extra > 0) t += extra;
    }
    return t;
  }
}
