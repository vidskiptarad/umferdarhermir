import { describe, expect, it } from 'vitest';
import type {
  AnnualizationInput,
  CorridorDemand,
  CorridorModel,
  Scenario,
  SegmentConfig,
  SegmentDef,
  SimAggregates,
  TripRecord,
} from '../../types';
import { computeBenefits, defaultEconParams } from '../index';

// --- fixtures --------------------------------------------------------------

function trip(dir: 0 | 1, travelTimeS: number, isTruck: boolean): TripRecord {
  return { dir, entryTimeS: 0, travelTimeS, isTruck, followingTimeS: 0 };
}

/** Build a SimAggregates with N car + M truck trips in the fwd direction (dir 0). */
function makeAgg(opts: {
  carCount: number;
  carTravelS: number;
  truckCount: number;
  truckTravelS: number;
  ffFwdS: number;
  vehKmBySegment: Record<string, number>;
}): SimAggregates {
  const trips: TripRecord[] = [];
  for (let i = 0; i < opts.carCount; i++) trips.push(trip(0, opts.carTravelS, false));
  for (let i = 0; i < opts.truckCount; i++) trips.push(trip(0, opts.truckTravelS, true));
  const vehKm = Object.values(opts.vehKmBySegment).reduce((a, b) => a + b, 0);
  return {
    simulatedHours: 24,
    trips,
    vehKm,
    vehKmBySegment: opts.vehKmBySegment,
    freeFlowTravelTimeS: { fwd: opts.ffFwdS, rev: opts.ffFwdS },
    meanTravelTimeS: { fwd: 0, rev: 0 },
    p50TravelTimeS: { fwd: 0, rev: 0 },
    p85TravelTimeS: { fwd: 0, rev: 0 },
    meanDelayS: { fwd: 0, rev: 0 },
    ptsf: { fwd: 0, rev: 0 },
  };
}

function seg(id: string, config: SegmentConfig): SegmentDef {
  return {
    id,
    name: id,
    fromM: 0,
    toM: 1000,
    config,
    maxspeedKmh: 90,
    gradePct: 0,
    overtakingAllowed: true,
    barrier: false,
    upgradable: true,
    aadt2025: 10000,
    sdu2025: 12000,
    vdu2025: 9000,
  };
}

function makeModel(segments: SegmentDef[]): CorridorModel {
  return {
    id: 'north',
    name: 'test',
    ref: '1',
    lengthM: 1000,
    centerline: [
      [0, 0],
      [0, 1],
    ],
    vertexOffsetsM: [0, 1000],
    segments,
    junctions: [],
    stations: [],
  };
}

const demandStub: CorridorDemand = {
  corridorId: 'north',
  aadtRef: 10000,
  truckShare: 0.1,
  presets: {} as CorridorDemand['presets'],
};

// --- worked example --------------------------------------------------------
//
// One annualization day standing for 365 days/year (fwd only).
//   Cars:   1000 trips, baseline travel 3600 s, upgraded 3300 s  (save 300 s)
//   Trucks:  100 trips, baseline travel 4200 s, upgraded 3900 s  (save 300 s)
//   Free-flow travel time: baseline 3000 s, upgraded 2900 s      (100 s FF gain)
//   Segments: seg-a S1 → D2 (safety upgrade), seg-b S1 speed-only (no safety)
//   vehKm/day: seg-a 50 000, seg-b 40 000
//
// All expected numbers below are worked by hand in explicit arithmetic.

describe('computeBenefits — worked example', () => {
  const params = defaultEconParams();
  const DPY = 365;

  const baseline = [
    makeAgg({
      carCount: 1000,
      carTravelS: 3600,
      truckCount: 100,
      truckTravelS: 4200,
      ffFwdS: 3000,
      vehKmBySegment: { 'seg-a': 50000, 'seg-b': 40000 },
    }),
  ];
  const upgraded = [
    makeAgg({
      carCount: 1000,
      carTravelS: 3300,
      truckCount: 100,
      truckTravelS: 3900,
      ffFwdS: 2900,
      vehKmBySegment: { 'seg-a': 50000, 'seg-b': 40000 },
    }),
  ];
  const annualization: AnnualizationInput = {
    days: [{ preset: 'typicalWeekday', daysPerYear: DPY }],
  };
  const model = makeModel([seg('seg-a', 'S1'), seg('seg-b', 'S1')]);
  const scenario: Scenario = {
    segmentOverrides: [
      { segmentId: 'seg-a', config: 'D2' }, // S1 → D2, safety benefit
      { segmentId: 'seg-b', maxspeedKmh: 110 }, // speed only, config unchanged → no safety
    ],
    junctionOverrides: [],
  };

  const r = computeBenefits(baseline, upgraded, annualization, demandStub, model, scenario, params);

  // Time — car. delaySaving 200 000 s @ 8260, freeSaving 100 000 s @ 5510.
  const timeCarPerDay = (200000 * 8260 + 100000 * 5510) / 3600; // = 611 944.444…
  const timeCar = timeCarPerDay * DPY; // = 223 359 722.22…
  // Time — truck. delaySaving 20 000 s @ 16770, freeSaving 10 000 s @ 11980.
  const timeTruckPerDay = (20000 * 16770 + 10000 * 11980) / 3600; // = 126 444.444…
  const timeTruck = timeTruckPerDay * DPY; // = 46 152 222.22…
  const timeSavings = timeCar + timeTruck; // = 269 511 944.44…

  // Safety — seg-a only. baseline accidents/yr = 0.35 × (50 000×365)/1e6.
  const vehKmYr = 50000 * DPY; // 18 250 000
  const baselineAccidents = 0.35 * (vehKmYr / 1e6); // 6.3875
  const avoided = baselineAccidents * 0.61; // 3.896375
  const safety = avoided * 9.7e6; // 37 794 837.5

  const year1 = timeSavings + safety; // 307 306 781.94…

  it('splits time savings by class with congested/free-flow VoT', () => {
    expect(r.detail.timeCar).toBeCloseTo(timeCar, 2);
    expect(r.detail.timeTruck).toBeCloseTo(timeTruck, 2);
    expect(r.timeSavingsISKPerYear).toBeCloseTo(timeSavings, 2);
  });

  it('reports veh-hours saved per year (total travel-time delta)', () => {
    const vehHours = ((1000 * 300 + 100 * 300) / 3600) * DPY; // 33 458.333…
    expect(r.vehHoursSavedPerYear).toBeCloseTo(vehHours, 4);
  });

  it('computes safety benefit only for the S1 → D2 segment', () => {
    expect(r.detail.accidentsAvoidedPerYear).toBeCloseTo(avoided, 6);
    expect(r.safetyBenefitISKPerYear).toBeCloseTo(safety, 2);
  });

  it('totals time + safety', () => {
    expect(r.totalISKPerYear).toBeCloseTo(year1, 2);
  });

  it('discounts a growing stream and matches a closed-form geometric sum', () => {
    const g = 0.023;
    const r1 = 0.035;
    // Undiscounted: B1 × ((1+g)^30 − 1) / g.
    const undisc = (year1 * (Math.pow(1 + g, 30) - 1)) / g;
    expect(r.undiscounted30ISK).toBeCloseTo(undisc, 0);

    // NPV: B1/(1+r1) × Σ_{t=0}^{29} k^t, k = (1+g)/(1+r1) (all years ≤ 35, one rate).
    const k = (1 + g) / (1 + r1);
    const npvClosed = (year1 / (1 + r1)) * ((1 - Math.pow(k, 30)) / (1 - k));
    expect(r.npv30ISK).toBeCloseTo(npvClosed, 0);
    // Sanity: discounting must shrink the stream but stay positive.
    expect(r.npv30ISK).toBeLessThan(r.undiscounted30ISK);
    expect(r.npv30ISK).toBeGreaterThan(year1);
  });
});

// --- zero-diff -------------------------------------------------------------

describe('computeBenefits — zero difference', () => {
  it('yields zero benefits when upgraded == baseline and no config change', () => {
    const params = defaultEconParams();
    const agg = makeAgg({
      carCount: 500,
      carTravelS: 3200,
      truckCount: 50,
      truckTravelS: 3800,
      ffFwdS: 3000,
      vehKmBySegment: { 'seg-a': 30000 },
    });
    const annualization: AnnualizationInput = {
      days: [{ preset: 'typicalWeekday', daysPerYear: 300 }],
    };
    const model = makeModel([seg('seg-a', 'S1')]);
    const scenario: Scenario = { segmentOverrides: [], junctionOverrides: [] };
    const r = computeBenefits([agg], [agg], annualization, demandStub, model, scenario, params);
    expect(r.timeSavingsISKPerYear).toBe(0);
    expect(r.safetyBenefitISKPerYear).toBe(0);
    expect(r.totalISKPerYear).toBe(0);
    expect(r.npv30ISK).toBe(0);
    expect(r.undiscounted30ISK).toBe(0);
    expect(r.vehHoursSavedPerYear).toBe(0);
    expect(r.detail.accidentsAvoidedPerYear).toBe(0);
  });
});

// --- negative (worse upgrade) ---------------------------------------------

describe('computeBenefits — worse upgrade is not clamped', () => {
  it('returns negative time savings when the upgrade slows traffic', () => {
    const params = defaultEconParams();
    const baseline = [
      makeAgg({
        carCount: 100,
        carTravelS: 3000,
        truckCount: 0,
        truckTravelS: 0,
        ffFwdS: 3000,
        vehKmBySegment: { 'seg-a': 10000 },
      }),
    ];
    const upgraded = [
      makeAgg({
        carCount: 100,
        carTravelS: 3600, // slower than baseline
        truckCount: 0,
        truckTravelS: 0,
        ffFwdS: 3000,
        vehKmBySegment: { 'seg-a': 10000 },
      }),
    ];
    const annualization: AnnualizationInput = {
      days: [{ preset: 'typicalWeekday', daysPerYear: 200 }],
    };
    const model = makeModel([seg('seg-a', 'S1')]);
    const scenario: Scenario = { segmentOverrides: [], junctionOverrides: [] };
    const r = computeBenefits(baseline, upgraded, annualization, demandStub, model, scenario, params);
    // 100 cars × 600 s extra delay @ congested VoT, × 200 days.
    const expected = -((100 * 600) / 3600) * 8260 * 200;
    expect(r.detail.timeCar).toBeCloseTo(expected, 2);
    expect(r.timeSavingsISKPerYear).toBeLessThan(0);
    expect(r.totalISKPerYear).toBeLessThan(0);
    expect(r.npv30ISK).toBeLessThan(0);
    expect(r.vehHoursSavedPerYear).toBeCloseTo(-((100 * 600) / 3600) * 200, 6);
  });
});

// --- two-rate discounting --------------------------------------------------

describe('computeBenefits — two-rate discounting past year 35', () => {
  it('applies discountRate2 after year 35', () => {
    const params = { ...defaultEconParams(), horizonYears: 50 };
    // Simple flat benefit: no time savings, safety only, so year-1 benefit is easy.
    const baseline = [
      makeAgg({
        carCount: 10,
        carTravelS: 3000,
        truckCount: 0,
        truckTravelS: 0,
        ffFwdS: 3000,
        vehKmBySegment: { 'seg-a': 1_000_000 },
      }),
    ];
    // Upgraded identical travel (no time benefit) so B1 == safety only.
    const upgraded = [
      makeAgg({
        carCount: 10,
        carTravelS: 3000,
        truckCount: 0,
        truckTravelS: 0,
        ffFwdS: 3000,
        vehKmBySegment: { 'seg-a': 1_000_000 },
      }),
    ];
    const annualization: AnnualizationInput = {
      days: [{ preset: 'typicalWeekday', daysPerYear: 365 }],
    };
    const model = makeModel([seg('seg-a', 'S1')]);
    const scenario: Scenario = {
      segmentOverrides: [{ segmentId: 'seg-a', config: 'D2' }],
      junctionOverrides: [],
    };
    const r = computeBenefits(baseline, upgraded, annualization, demandStub, model, scenario, params);

    expect(r.timeSavingsISKPerYear).toBe(0);
    const B1 = r.safetyBenefitISKPerYear;
    expect(r.totalISKPerYear).toBeCloseTo(B1, 2);

    const g = 0.023;
    const r1 = 0.035;
    const r2 = 0.025;
    let expectedNpv = 0;
    for (let year = 1; year <= 50; year++) {
      const grown = B1 * Math.pow(1 + g, year - 1);
      let df: number;
      if (year <= 35) df = 1 / Math.pow(1 + r1, year);
      else df = (1 / Math.pow(1 + r1, 35)) / Math.pow(1 + r2, year - 35);
      expectedNpv += grown * df;
    }
    expect(r.npv30ISK).toBeCloseTo(expectedNpv, 0);
  });
});
