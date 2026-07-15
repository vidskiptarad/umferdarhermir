/**
 * Economics module for the Umferð traffic simulator.
 *
 * Pure, dependency-free TypeScript (importable in a Web Worker and under Node/tsx).
 * All unit values are 2026 ISK and cite research/03-value-of-time-economics.md.
 *
 * Public API (see src/types.ts):
 *   defaultEconParams(): EconParams
 *   computeBenefits(baseline, upgraded, annualization, demand, baseModel, scenario, params): BenefitBreakdown
 *
 * Method summary
 * --------------
 * TIME. Baseline and upgraded runs simulate the SAME demand. For each annualization
 * day, per vehicle class (car / truck) and per direction we split the per-run
 * veh-hours into a DELAY part (travel − free-flow of that run's own model) and a
 * FREE-FLOW part (count × free-flow time). The saving in the delay part is valued at
 * the CONGESTED VoT; the saving in the free-flow part (which is where a raised speed
 * limit / better geometry shows up) is valued at the FREE-FLOW VoT. This reproduces
 * the identity  delaySaving + freeFlowSaving == baselineTravel − upgradedTravel, and
 * matches CONTRACTS.md "Economics conventions" — congested VoT to delay, free-flow
 * VoT to the rest. Each run's delay datum is its OWN model's free-flow time, so a
 * free-flow improvement (higher limit / better geometry) lands in the free-flow part.
 *   (research/03 §3, §8; CONTRACTS.md "Economics conventions".)
 *
 * SAFETY. accidents/yr per segment = rate(config) × vehKm/yr / 1e6. A segment whose
 * config changes S1 → S21F/S21R/D2 has its baseline accident COST multiplied by
 * (1 − reduction); the avoided cost is baselineCost × reduction. Segments that only
 * get a speed-limit raise (config unchanged) contribute zero safety benefit.
 *   (research/03 §4 (Vegagerðin 2005), §5; CONTRACTS.md "Economics conventions".)
 *
 * GROWTH + NPV. The year-1 benefit (time + safety) grows at trafficGrowthPerYear and
 * is discounted at discountRate1 for years 1–35 and discountRate2 thereafter, summed
 * over horizonYears. undiscounted30 is the same stream without discounting.
 *   (research/03 §3, §8.)
 */

import type {
  AnnualizationInput,
  BenefitBreakdown,
  CorridorDemand,
  CorridorModel,
  EconParams,
  Scenario,
  SegmentConfig,
  SimAggregates,
} from '../types';

// The discount rate switches after this many years (research/03 §3: 3.5% real for
// the first 35 years, 2.5% after — Sundabraut/TERESA convention).
const DISCOUNT_RATE_SWITCH_YEAR = 35;

/**
 * Recommended parameter set, research/03 §8 (all 2026 ISK). Every figure below is a
 * transfer of a Danish/Nordic value rolled forward on Icelandic CPI (research/03 §7).
 */
export function defaultEconParams(): EconParams {
  return {
    // VoT per vehicle-hour, occupancy embedded — research/03 §8 "Car — average" / "HGV".
    votCarFreeFlow: 5510, // research/03 §8: car average, free-flow
    votCarCongested: 8260, // research/03 §8: car average, congestion (~1.5× free-flow)
    votTruckFreeFlow: 11980, // research/03 §8: HGV, free-flow
    votTruckCongested: 16770, // research/03 §8: HGV, congestion
    // Average accident cost — research/03 §5 (Kostnaður umferðarslysa 2014 → 2026 ×1.619).
    costPerAvgAccident: 9.7e6, // research/03 §5: "Average accident" 9.7 M ISK (2026)
    // Accident rate per million veh-km by config.
    accidentRatePerMvkm: {
      // ASSUMPTION (CONTRACTS.md "Economics conventions"): calibrated so results are
      // sane against research/03 §4 (Vegagerðin 2005). S1 baseline 0.35; barrier
      // configs lower. S21F and S21R share the 2+1 rate.
      S1: 0.35, // ASSUMPTION per CONTRACTS.md
      S21F: 0.2, // ASSUMPTION per CONTRACTS.md
      S21R: 0.2, // ASSUMPTION per CONTRACTS.md
      D2: 0.15, // ASSUMPTION per CONTRACTS.md
    },
    // Accident-COST reduction when upgrading FROM S1 — research/03 §4 (2005 study):
    // 2+1 with wire barrier 47–56% → 0.51; 2+2 grade-separated 58–64% → 0.61.
    accidentCostReduction: { S21: 0.51, D2: 0.61 }, // research/03 §4
    trafficGrowthPerYear: 0.023, // research/03 §3/§8: 2.3%/yr (Sundabraut regional model)
    discountRate1: 0.035, // research/03 §3: 3.5% real, years 1–35
    discountRate2: 0.025, // research/03 §3: 2.5% real, after year 35
    horizonYears: 30, // research/03 §3: 30-year analysis period from opening
  };
}

type VehClass = 'car' | 'truck';

/** VoT lookup for a class. research/03 §8. */
function vot(params: EconParams, cls: VehClass, congested: boolean): number {
  if (cls === 'car') return congested ? params.votCarCongested : params.votCarFreeFlow;
  return congested ? params.votTruckCongested : params.votTruckFreeFlow;
}

interface RunClassDir {
  count: number;
  sumTravelS: number;
}

/**
 * Sum trip travel time and count for one run, split by class and direction.
 * Returns [car][dir], [truck][dir]. dir index 0 = fwd, 1 = rev.
 */
function tallyRun(agg: SimAggregates): Record<VehClass, [RunClassDir, RunClassDir]> {
  const zero = (): RunClassDir => ({ count: 0, sumTravelS: 0 });
  const out: Record<VehClass, [RunClassDir, RunClassDir]> = {
    car: [zero(), zero()],
    truck: [zero(), zero()],
  };
  for (const t of agg.trips) {
    const cls: VehClass = t.isTruck ? 'truck' : 'car';
    const bucket = out[cls][t.dir];
    bucket.count += 1;
    bucket.sumTravelS += t.travelTimeS;
  }
  return out;
}

/** Free-flow travel time (s) for a run in a given direction. */
function freeFlow(agg: SimAggregates, dir: 0 | 1): number {
  return dir === 0 ? agg.freeFlowTravelTimeS.fwd : agg.freeFlowTravelTimeS.rev;
}

/** Which target config an S1 upgrade maps to for the reduction factor, or null. */
function reductionFor(
  baselineConfig: SegmentConfig,
  newConfig: SegmentConfig | undefined,
  params: EconParams,
): number | null {
  if (baselineConfig !== 'S1' || newConfig === undefined || newConfig === baselineConfig) {
    return null;
  }
  if (newConfig === 'D2') return params.accidentCostReduction.D2;
  if (newConfig === 'S21F' || newConfig === 'S21R') return params.accidentCostReduction.S21;
  return null;
}

export function computeBenefits(
  baseline: SimAggregates[],
  upgraded: SimAggregates[],
  annualization: AnnualizationInput,
  _demand: CorridorDemand,
  baseModel: CorridorModel,
  scenario: Scenario,
  params: EconParams,
): BenefitBreakdown {
  const n = annualization.days.length;
  if (baseline.length !== n || upgraded.length !== n) {
    throw new Error(
      `computeBenefits: baseline (${baseline.length}), upgraded (${upgraded.length}) and ` +
        `annualization.days (${n}) must be the same length`,
    );
  }

  // --- TIME ----------------------------------------------------------------
  // Per class, accumulate annual ISK and annual veh-hours saved. No clamping:
  // a worse upgrade yields negative savings honestly.
  let timeCar = 0;
  let timeTruck = 0;
  let vehHoursSavedPerYear = 0;

  for (let i = 0; i < n; i++) {
    const daysPerYear = annualization.days[i].daysPerYear;
    const bTally = tallyRun(baseline[i]);
    const uTally = tallyRun(upgraded[i]);

    for (const cls of ['car', 'truck'] as VehClass[]) {
      let dayISK = 0;
      let daySavedS = 0;
      for (const dir of [0, 1] as (0 | 1)[]) {
        const b = bTally[cls][dir];
        const u = uTally[cls][dir];
        const ffB = freeFlow(baseline[i], dir);
        const ffU = freeFlow(upgraded[i], dir);

        // Split each run's veh-seconds into delay and free-flow parts.
        //   delay      = travel − freeFlow(own model)
        //   freeFlow   = count × freeFlow(own model)
        const bDelayS = b.sumTravelS - b.count * ffB;
        const uDelayS = u.sumTravelS - u.count * ffU;
        const bFreeS = b.count * ffB;
        const uFreeS = u.count * ffU;

        const delaySavingS = bDelayS - uDelayS; // valued at congested VoT
        const freeSavingS = bFreeS - uFreeS; // valued at free-flow VoT

        dayISK +=
          (delaySavingS / 3600) * vot(params, cls, true) +
          (freeSavingS / 3600) * vot(params, cls, false);

        // Total veh-hours saved (for the reported aggregate) = baselineTravel − upgradedTravel.
        daySavedS += b.sumTravelS - u.sumTravelS;
      }
      const annualISK = dayISK * daysPerYear;
      if (cls === 'car') timeCar += annualISK;
      else timeTruck += annualISK;
      vehHoursSavedPerYear += (daySavedS / 3600) * daysPerYear;
    }
  }

  const timeSavingsISKPerYear = timeCar + timeTruck;

  // --- SAFETY --------------------------------------------------------------
  // Resolve baseline configs from the model (we do not depend on src/sim's
  // applyScenario). Only S1 → S21*/D2 config changes yield a safety benefit;
  // speed-limit-only overrides (config unchanged) contribute zero.
  const baseConfigById = new Map<string, SegmentConfig>();
  for (const seg of baseModel.segments) baseConfigById.set(seg.id, seg.config);

  let accidentsAvoidedPerYear = 0;
  let safetyBenefitISKPerYear = 0;

  for (const ov of scenario.segmentOverrides) {
    const baseConfig = baseConfigById.get(ov.segmentId);
    if (baseConfig === undefined) continue;
    const reduction = reductionFor(baseConfig, ov.config, params);
    if (reduction === null) continue; // no config change from S1 → barrier config

    // Annualized veh-km on this segment, from the BASELINE run (existing-road traffic).
    let vehKmPerYear = 0;
    for (let i = 0; i < n; i++) {
      const vk = baseline[i].vehKmBySegment[ov.segmentId] ?? 0;
      vehKmPerYear += vk * annualization.days[i].daysPerYear;
    }

    const baselineAccidentsPerYear =
      params.accidentRatePerMvkm[baseConfig] * (vehKmPerYear / 1e6);
    const avoided = baselineAccidentsPerYear * reduction;
    accidentsAvoidedPerYear += avoided;
    safetyBenefitISKPerYear += avoided * params.costPerAvgAccident;
  }

  // --- GROWTH + NPV --------------------------------------------------------
  const year1Benefit = timeSavingsISKPerYear + safetyBenefitISKPerYear;
  const g = params.trafficGrowthPerYear;
  let npv30ISK = 0;
  let undiscounted30ISK = 0;
  for (let year = 1; year <= params.horizonYears; year++) {
    const grown = year1Benefit * Math.pow(1 + g, year - 1);
    undiscounted30ISK += grown;
    npv30ISK += grown * discountFactor(year, params.discountRate1, params.discountRate2);
  }

  return {
    timeSavingsISKPerYear,
    safetyBenefitISKPerYear,
    totalISKPerYear: year1Benefit,
    npv30ISK,
    undiscounted30ISK,
    vehHoursSavedPerYear,
    detail: { timeCar, timeTruck, accidentsAvoidedPerYear },
  };
}

/**
 * Cumulative discount factor for an end-of-year cash flow in `year` (1-based).
 * Years 1..35 discount at r1; each year after 35 additionally discounts at r2.
 * (research/03 §3.)
 */
function discountFactor(year: number, r1: number, r2: number): number {
  if (year <= DISCOUNT_RATE_SWITCH_YEAR) {
    return 1 / Math.pow(1 + r1, year);
  }
  const base = 1 / Math.pow(1 + r1, DISCOUNT_RATE_SWITCH_YEAR);
  return base / Math.pow(1 + r2, year - DISCOUNT_RATE_SWITCH_YEAR);
}
