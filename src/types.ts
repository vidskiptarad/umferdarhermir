/**
 * Shared contracts for the Umferð traffic simulator.
 * This file is the source of truth — pipeline, sim engine, economics, and UI
 * all code against these types. See CONTRACTS.md for semantics.
 */

// ---------------------------------------------------------------------------
// Corridor model (produced by scripts/pipeline, stored in data/<id>.corridor.json)
// ---------------------------------------------------------------------------

export type CorridorId = 'north' | 'south' | 'kef';

/**
 * Lane configuration of a segment.
 *  S1   = 1+1 undivided        (overtaking via oncoming lane where allowed)
 *  S21F = 2+1, 2 lanes forward (median barrier, no crossing)
 *  S21R = 2+1, 2 lanes reverse (median barrier, no crossing)
 *  D2   = 2+2 divided          (median barrier)
 * "forward" = direction 0 = away from Reykjavík.
 */
export type SegmentConfig = 'S1' | 'S21F' | 'S21R' | 'D2';

export interface SegmentDef {
  id: string;              // stable, e.g. "north-07"
  name: string;            // human label, e.g. "Kjalarnes (Móar–Hvalfjarðarvegur)"
  fromM: number;           // corridor offset, meters (fromM < toM)
  toM: number;
  config: SegmentConfig;
  maxspeedKmh: number;     // posted limit
  gradePct: number;        // signed, in the forward direction (+ uphill forward)
  overtakingAllowed: boolean; // only meaningful for S1: legal passing via oncoming lane
  barrier: boolean;        // physical median barrier (always true for S21*/D2)
  upgradable: boolean;     // UI offers config/speed toggles on this segment
  /** Optional upgrade the UI may apply. Omitted = default rules (see CONTRACTS.md). */
  upgradeHint?: 'tunnel-bore-2' | 'fourth-lane' | 'none';
  aadt2025: number;        // annual avg daily traffic, both directions
  sdu2025: number;         // summer daily
  vdu2025: number;         // winter daily
}

export type JunctionType = 'roundabout' | 'signal' | 'grade-separated' | 't-junction';

export interface JunctionDef {
  id: string;
  name: string;
  offsetM: number;
  type: JunctionType;
  /** Vehicles must slow to this through the node (roundabout ≈ 30, signal ≈ n/a, grade ≈ none). */
  throughSpeedKmh: number;
  /** Conflicting/entering flow (veh/h, both approaches) used by the gap-acceptance capacity server. */
  conflictingVph: number;
  /** If true, an upgrade scenario may convert this node to grade-separated. */
  upgradable: boolean;
}

export interface CountStation {
  id: string;              // Vegagerðin IDSTOD, e.g. "36"
  name: string;            // e.g. "Kjalarnes"
  offsetM: number;
  hasSpeed: boolean;       // MEDALHRADI reported
}

export interface CorridorModel {
  id: CorridorId;
  name: string;            // e.g. "Reykjavík – Borgarnes"
  ref: string;             // road ref, "1" or "41"
  lengthM: number;
  /** WGS84 [lon, lat] polyline, ordered start (Reykjavík end) → end, densified ≤ ~50 m spacing. */
  centerline: [number, number][];
  /** Cumulative distance (m) per centerline vertex; same length as centerline; [0] = 0. */
  vertexOffsetsM: number[];
  segments: SegmentDef[];  // contiguous, sorted, covering [0, lengthM]
  junctions: JunctionDef[];
  stations: CountStation[];
}

// ---------------------------------------------------------------------------
// Demand (produced by pipeline into data/demand.json)
// ---------------------------------------------------------------------------

export type DemandPresetId = 'typicalWeekday' | 'fridaySummer' | 'sundayReturn';

export interface DemandProfile {
  /** Fraction of daily traffic per hour-of-day, forward direction (away from Rvk). Sums to ~1 with rev. */
  hourSharesFwd: number[]; // length 24; hourSharesFwd[h] + hourSharesRev[h] summed over h == 1
  hourSharesRev: number[];
  /** Multiplier applied to the corridor's AADT to get this day's total (e.g. SDU/AADT for summer Friday). */
  dayFactor: number;
}

export interface CorridorDemand {
  corridorId: CorridorId;
  /** Daily two-way vehicles at the demand reference point (rural mid-corridor), from 2025 data. */
  aadtRef: number;
  truckShare: number;      // 0..1, heavy vehicles
  presets: Record<DemandPresetId, DemandProfile>;
}

// ---------------------------------------------------------------------------
// Scenario (UI state → engine input)
// ---------------------------------------------------------------------------

export interface SegmentOverride {
  segmentId: string;
  config?: SegmentConfig;       // e.g. S1 → D2
  maxspeedKmh?: number;         // e.g. 90 → 110
}

export interface JunctionOverride {
  junctionId: string;
  type: 'grade-separated';      // only supported upgrade
}

export interface Scenario {
  segmentOverrides: SegmentOverride[];
  junctionOverrides: JunctionOverride[];
  /** Desired-speed response to a raised limit: fraction of the +Δlimit drivers adopt (default 0.7). */
  speedLimitAdoption?: number;
}

// ---------------------------------------------------------------------------
// Simulation engine (src/sim) — public API
// ---------------------------------------------------------------------------

export interface SimOptions {
  seed: number;
  dtS?: number;              // default 0.25
  startHour?: number;        // sim clock start, default 0
  demandScale?: number;      // global multiplier on demand, default 1
}

export interface VehicleSnapshot {
  /** Parallel arrays, one entry per active vehicle. */
  count: number;
  offsetM: Float32Array;     // position along corridor
  /** Lane: 0 = normal lane of travel; 1 = passing lane / oncoming lane while overtaking. */
  lane: Uint8Array;
  dir: Uint8Array;           // 0 fwd, 1 rev
  speedMs: Float32Array;
  isTruck: Uint8Array;
}

export interface SegmentLiveStats {
  segmentId: string;
  /** Harmonic-mean speed (km/h) of vehicles in segment over the last rolling window, per direction. -1 = no data. */
  avgSpeedFwd: number;
  avgSpeedRev: number;
  vehCount: number;
}

export interface TripRecord {
  dir: 0 | 1;
  entryTimeS: number;        // sim seconds since start
  travelTimeS: number;
  isTruck: boolean;
  /** Seconds spent following (headway < 3 s behind slower leader). */
  followingTimeS: number;
}

export interface SimAggregates {
  simulatedHours: number;
  trips: TripRecord[];              // completed trips only
  vehKm: number;                    // total, all vehicles incl. active
  vehKmBySegment: Record<string, number>;
  freeFlowTravelTimeS: { fwd: number; rev: number }; // per current scenario, computed analytically
  meanTravelTimeS: { fwd: number; rev: number };
  p50TravelTimeS: { fwd: number; rev: number };
  p85TravelTimeS: { fwd: number; rev: number };
  meanDelayS: { fwd: number; rev: number };          // vs free flow
  ptsf: { fwd: number; rev: number };                // percent time spent following, 0..1
}

/**
 * The engine must expose (from src/sim/index.ts):
 *
 *   class Simulation {
 *     constructor(model: CorridorModel, scenario: Scenario, demand: CorridorDemand,
 *                 preset: DemandPresetId, opts: SimOptions)
 *     step(): void                      // advance one dt
 *     stepHours(h: number): void        // batch-advance (no snapshots needed)
 *     get timeS(): number
 *     snapshot(): VehicleSnapshot       // reuses internal buffers; copy if kept
 *     segmentStats(): SegmentLiveStats[]
 *     aggregates(): SimAggregates
 *   }
 *
 *   applyScenario(model, scenario): CorridorModel   // pure; resolves overrides (exported for UI + econ)
 *   freeFlowTime(model, dir): number                // seconds, at desired-speed mean, incl. junction slowdowns
 *
 * Engine must be: dependency-free, deterministic for a given seed, allocation-light
 * (SoA Float32Arrays), and runnable both in a Web Worker and under Node (no DOM access).
 */

// ---------------------------------------------------------------------------
// Economics (src/econ) — public API
// ---------------------------------------------------------------------------

export interface EconParams {
  /** ISK per vehicle-hour, 2026 prices (research/03 §8). */
  votCarFreeFlow: number;        // 5510
  votCarCongested: number;       // 8260
  votTruckFreeFlow: number;      // 11980
  votTruckCongested: number;     // 16770
  /** Accident cost per accident class, ISK 2026. */
  costPerAvgAccident: number;    // 9.7e6
  /** Accident rate per million veh-km by config (calibrated from Vegagerðin slysumferd layers). */
  accidentRatePerMvkm: Record<SegmentConfig, number>;
  /** Accident-cost reduction when upgrading FROM S1, by target config (research/03 §4). */
  accidentCostReduction: { S21: number; D2: number }; // e.g. 0.51, 0.61
  trafficGrowthPerYear: number;  // 0.023
  discountRate1: number;         // 0.035 (years 1–35)
  discountRate2: number;         // 0.025 (after)
  horizonYears: number;          // 30
}

export interface AnnualizationInput {
  /** Which preset each sim day represents and how many days/year it stands for. */
  days: { preset: DemandPresetId; daysPerYear: number }[];
}

export interface BenefitBreakdown {
  timeSavingsISKPerYear: number;
  safetyBenefitISKPerYear: number;
  totalISKPerYear: number;
  npv30ISK: number;              // discounted 30-yr stream with growth
  undiscounted30ISK: number;
  vehHoursSavedPerYear: number;
  detail: {
    timeCar: number; timeTruck: number;
    accidentsAvoidedPerYear: number;
  };
}

/**
 * src/econ/index.ts must export:
 *   defaultEconParams(): EconParams
 *   computeBenefits(baseline: SimAggregates[], upgraded: SimAggregates[],
 *                   annualization: AnnualizationInput, demand: CorridorDemand,
 *                   baseModel: CorridorModel, scenario: Scenario,
 *                   params: EconParams): BenefitBreakdown
 * (baseline[i] / upgraded[i] correspond to annualization.days[i]; arrays same length.)
 * Pure functions, dependency-free, unit-tested against a hand-computed example.
 */
