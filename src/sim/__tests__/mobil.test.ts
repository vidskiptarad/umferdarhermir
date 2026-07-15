import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { mobilChange } from '../mobil';
import { singleSegCorridor, makeDemand, emptyScenario, worstGap } from './fixtures';

describe('MOBIL (unit)', () => {
  it('accepts a clearly beneficial, safe change and rejects an unsafe one', () => {
    // Big incentive to move (stuck behind slow leader, target lane open), safe follower.
    expect(mobilChange({
      aCur: -2, aTilde: 1.0, anCur: 0.5, anTilde: 0.2, aoCur: -1, aoTilde: 0.5, toLeft: true,
    })).toBe(true);
    // Unsafe: new follower forced to brake harder than b_safe.
    expect(mobilChange({
      aCur: -2, aTilde: 1.0, anCur: 0, anTilde: -6, aoCur: 0, aoTilde: 0, toLeft: true,
    })).toBe(false);
  });
});

describe('D2 lane changing (emergent)', () => {
  const sim = new Simulation(
    singleSegCorridor(10000, 'D2'),
    emptyScenario,
    makeDemand(400, 0, 0.25),
    'typicalWeekday',
    { seed: 7 },
  );
  let lane0 = 0;
  let lane1 = 0;
  let worst = Infinity;
  for (let m = 0; m < 50; m++) {
    sim.stepHours(1 / 60);
    const s = sim.snapshot();
    for (let i = 0; i < s.count; i++) {
      if (s.dir[i] === 0) (s.lane[i] === 1 ? (lane1++) : (lane0++));
    }
    worst = Math.min(worst, worstGap(s, 10000));
  }

  it('fast cars use the passing lane (lane 1 is populated)', () => {
    expect(lane1).toBeGreaterThan(0);
  });
  it('keep-right holds: passing lane emptier than driving lane at low flow', () => {
    expect(lane1).toBeLessThan(lane0);
  });
  it('no collisions (true bumper gaps stay non-negative)', () => {
    expect(worst).toBeGreaterThanOrEqual(-0.01); // float-noise epsilon only
  });
});
