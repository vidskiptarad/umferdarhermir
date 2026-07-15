import { describe, it, expect } from 'vitest';
import { applyScenario, freeFlowTime, World } from '../world';
import { capacityVehPerS } from '../junction';
import { singleSegCorridor, twoSegCorridor, roundabout } from './fixtures';
import type { Scenario } from '../../types';

describe('applyScenario', () => {
  it('config override to a barrier config forces barrier + no overtaking', () => {
    const model = singleSegCorridor(10000, 'S1', { overtaking: true, barrier: false });
    const scenario: Scenario = {
      segmentOverrides: [{ segmentId: 'seg0', config: 'D2', maxspeedKmh: 110 }],
      junctionOverrides: [],
    };
    const r = applyScenario(model, scenario);
    expect(r.segments[0].config).toBe('D2');
    expect(r.segments[0].barrier).toBe(true);
    expect(r.segments[0].overtakingAllowed).toBe(false);
    expect(r.segments[0].maxspeedKmh).toBe(110);
    // original untouched (pure)
    expect(model.segments[0].config).toBe('S1');
  });

  it('junction override converts to grade-separated with capacity removed', () => {
    const model = singleSegCorridor(10000, 'S1', { junctions: [roundabout(5000, 800)] });
    const r = applyScenario(model, {
      segmentOverrides: [],
      junctionOverrides: [{ junctionId: 'rbt', type: 'grade-separated' }],
    });
    expect(r.junctions[0].type).toBe('grade-separated');
    expect(r.junctions[0].conflictingVph).toBe(0);
    expect(r.junctions[0].throughSpeedKmh).toBe(90); // containing segment limit
  });

  it('speedLimitAdoption scales desired speed by only the adopted fraction of Δ', () => {
    const model = singleSegCorridor(10000, 'D2', { maxspeed: 90 });
    const world = new World(model, {
      segmentOverrides: [{ segmentId: 'seg0', maxspeedKmh: 110 }],
      junctionOverrides: [],
      speedLimitAdoption: 0.7,
    });
    // adjLimit = 90 + 0.7*(110-90) = 104 ⇒ factor = 104/90
    expect(world.segAdjFactor[0]).toBeCloseTo(104 / 90, 6);
  });
});

describe('freeFlowTime', () => {
  it('hand-checked on a 2-segment model (no junctions)', () => {
    const model = twoSegCorridor(); // 5000 @90, 5000 @72
    const v0 = 5000 / (92 * (90 / 90) / 3.6); // 195.65 s
    const v1 = 5000 / (92 * (72 / 90) / 3.6); // 244.57 s
    const expected = v0 + v1;
    expect(freeFlowTime(model, 0)).toBeCloseTo(expected, 2);
    expect(freeFlowTime(model, 1)).toBeCloseTo(expected, 2); // symmetric
  });

  it('adds junction through-speed slowdown', () => {
    const model = singleSegCorridor(10000, 'S1', { junctions: [roundabout(5000, 800)] });
    const base = 10000 / (92 / 3.6);
    const vFree = 92 / 3.6;
    const vThr = 30 / 3.6;
    const extra = 160 * (1 / vThr - 1 / vFree);
    expect(freeFlowTime(model, 0)).toBeCloseTo(base + extra, 2);
  });
});

describe('junction capacity', () => {
  it('Harders/HCM formula, finite and decreasing as conflicting flow rises', () => {
    const cLow = capacityVehPerS(200);
    const cHigh = capacityVehPerS(1200);
    expect(cLow).toBeGreaterThan(cHigh);
    expect(capacityVehPerS(0)).toBeCloseTo(1 / 2.8, 6); // limit as q→0
  });
});
