import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { gRequiredS, shouldStartOvertake } from '../overtake';
import { singleSegCorridor, makeDemand, emptyScenario } from './fixtures';

function runS1(overtaking: boolean, fwd: number, rev: number) {
  const sim = new Simulation(
    singleSegCorridor(12000, 'S1', { overtaking }),
    emptyScenario,
    makeDemand(fwd, rev, 0.18),
    'typicalWeekday',
    { seed: 42 },
  );
  sim.stepHours(1);
  const a = sim.aggregates();
  return {
    kmh: (12000 / a.meanTravelTimeS.fwd) * 3.6,
    ptsf: a.ptsf.fwd,
    trips: a.trips.filter((t) => t.dir === 0).length,
  };
}

describe('overtake gap-acceptance (unit)', () => {
  it('g_required decreases with Δv (research/04 §2b)', () => {
    expect(gRequiredS(20)).toBeCloseTo(12, 5);
    expect(gRequiredS(40)).toBeCloseTo(9, 5);
    expect(gRequiredS(20)).toBeGreaterThan(gRequiredS(40));
  });
  it('rejects when the oncoming vehicle is too close, accepts a huge gap', () => {
    const base = {
      ownSpeed: 22, ownV0: 26, leaderSpeed: 20, gapM: 20, leaderLen: 5,
      s0: 2, segLimitMs: 25, oncomingSpeed: 25,
    };
    expect(shouldStartOvertake({ ...base, oncomingDistM: 120 })).toBe(false);
    expect(shouldStartOvertake({ ...base, oncomingDistM: 2000 })).toBe(true);
  });
});

describe('S1 platoon formation & overtaking (emergent)', () => {
  const noOv = runS1(false, 450, 0);
  const ov0 = runS1(true, 450, 0);
  const ov900 = runS1(true, 450, 900);

  it('without overtaking, a platoon forms (high PTSF)', () => {
    expect(noOv.ptsf).toBeGreaterThan(0.5);
  });

  it('with overtaking + zero oncoming, cars escape (PTSF collapses, speed holds)', () => {
    expect(ov0.ptsf).toBeLessThan(noOv.ptsf - 0.15);
    // At this flow (450 veh/h ≈ half of 1+1 capacity) escaping a platoon costs
    // a maneuver detour, so the MEAN speed gain is small/noisy — PTSF is the
    // discriminating escape metric. Speed must only not degrade beyond
    // maneuver-overhead noise.
    expect(ov0.kmh).toBeGreaterThanOrEqual(noOv.kmh - 1.5);
  });

  it('with heavy oncoming, few overtakes get through (platoon persists)', () => {
    expect(ov900.ptsf).toBeGreaterThan(ov0.ptsf + 0.05);
  });
});
