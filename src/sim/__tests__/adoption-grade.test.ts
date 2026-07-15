import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { singleSegCorridor, makeDemand, emptyScenario } from './fixtures';
import type { Scenario } from '../../types';

describe('speedLimitAdoption vs free-flow delay (MAJOR-1)', () => {
  it('raised-limit scenario in pure free flow reports ~zero EXTRA mean delay', () => {
    // 90 → 110 with default adoption 0.7 ⇒ drivers target 92·(104/90) km/h.
    // Before the fix, freeFlowTravelTimeS assumed the full posted 110 and a
    // 20 km ultra-light run showed ~58 s of PHANTOM delay per vehicle on top
    // of the genuine micro residual (Jensen on 1/v0 + small-Δv following,
    // present identically in the 90 km/h baseline). So compare against the
    // baseline's own residual: the adoption fix must remove the phantom part.
    const model = singleSegCorridor(20000, 'S1', { overtaking: true, maxspeed: 90 });
    const raise: Scenario = {
      segmentOverrides: [{ segmentId: 'seg0', maxspeedKmh: 110 }],
      junctionOverrides: [],
    };
    const run = (scenario: Scenario) => {
      const sim = new Simulation(model, scenario, makeDemand(50, 0, 0), 'typicalWeekday', { seed: 1 });
      sim.stepHours(2);
      return sim.aggregates();
    };
    const raised = run(raise);
    const base = run(emptyScenario);
    expect(raised.trips.length).toBeGreaterThan(50);
    // Same seed & inflow: identical vehicles, only limits differ. Without the
    // fix the raised run reported ~58 s MORE delay than baseline; with it the
    // two residuals must be within a few seconds of each other.
    expect(Math.abs(raised.meanDelayS.fwd - base.meanDelayS.fwd)).toBeLessThan(10);
    // And the raised limit genuinely speeds up trips.
    expect(raised.meanTravelTimeS.fwd).toBeLessThan(base.meanTravelTimeS.fwd);
  });

  it('baseline (no override): engine free-flow equals the pure freeFlowTime', () => {
    const model = singleSegCorridor(10000, 'S1', { overtaking: true, maxspeed: 90 });
    const sim = new Simulation(model, emptyScenario, makeDemand(10, 0, 0), 'typicalWeekday', { seed: 2 });
    sim.step();
    const ag = sim.aggregates();
    // 10000 m at 92 km/h
    expect(ag.freeFlowTravelTimeS.fwd).toBeCloseTo(10000 / (92 / 3.6), 4);
  });
});

describe('grade-dependent desired speed (MAJOR-2)', () => {
  // +8% uphill in the FWD direction. Trucks: v0_eff = v0·max(0.45, 1−0.055·8)
  // = 0.56·v0 ⇒ ~46 km/h for an ~83 km/h truck. Rev direction is DOWNHILL on
  // the same segment (signed grade flips) ⇒ no reduction.
  function meanTruckSpeedByDir(): { fwd: number; rev: number } {
    const L = 6000;
    const sim = new Simulation(
      singleSegCorridor(L, 'S1', { overtaking: false, gradePct: 8 }),
      emptyScenario,
      makeDemand(80, 80, 1.0), // all trucks, light flow (no platooning noise)
      'typicalWeekday',
      { seed: 3 },
    );
    sim.stepHours(0.6);
    const s = sim.snapshot();
    let fSum = 0; let fN = 0; let rSum = 0; let rN = 0;
    for (let i = 0; i < s.count; i++) {
      // mid-segment only: past the accel/decel transients at entry/exit
      if (s.offsetM[i] < 1500 || s.offsetM[i] > 4500) continue;
      if (s.dir[i] === 0) { fSum += s.speedMs[i]; fN++; }
      else { rSum += s.speedMs[i]; rN++; }
    }
    return { fwd: (fSum / fN) * 3.6, rev: (rSum / rN) * 3.6 };
  }
  const v = meanTruckSpeedByDir();

  it('trucks climb +8% at ≈0.45–0.6 × their flat desired speed', () => {
    // flat truck v0 ≈ 83 km/h ⇒ expect ≈ 0.56·83 ≈ 46 km/h on the climb
    expect(v.fwd).toBeGreaterThan(0.45 * 83);
    expect(v.fwd).toBeLessThan(0.6 * 83);
  });

  it('rev direction (downhill on the same segment) is unaffected', () => {
    expect(v.rev).toBeGreaterThan(75); // near flat truck speeds 78–90
    expect(v.rev).toBeGreaterThan(v.fwd * 1.5);
  });
});
