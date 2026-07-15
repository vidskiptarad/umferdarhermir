import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { singleSegCorridor, makeDemand, emptyScenario, worstGap } from './fixtures';

/**
 * Regression for the entry-stacking BLOCKER: entryClear() used a strict
 * pos > 0 leader search, so a vehicle sitting at pos 0 was invisible and
 * queued vehicles were injected on top of it (−14 m gaps at 500/500 veh/h).
 *
 * S1 corridor, heavy bidirectional inflow with slow trucks (18% share so
 * platoons + overtaking churn constantly), 2 sim-hours: the TRUE bumper gap
 * (progress axis, leader's length) must never go negative.
 */
describe('collision-freedom under heavy bidirectional inflow', () => {
  it('true bumper gap never < 0 over 2 sim-hours (S1, 900/900 veh/h, trucks)', () => {
    const L = 8000;
    const sim = new Simulation(
      singleSegCorridor(L, 'S1', { overtaking: true }),
      emptyScenario,
      makeDemand(900, 900, 0.18),
      'typicalWeekday',
      { seed: 11 },
    );
    const steps = Math.round((2 * 3600) / 0.25);
    let worst = Infinity;
    for (let i = 0; i < steps; i++) {
      sim.step();
      if (i % 4 === 0) { // check every sim-second
        worst = Math.min(worst, worstGap(sim.snapshot(), L));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(-0.01); // float-noise epsilon only
  });

  it('entry saturation does not stack vehicles at the entry point', () => {
    // 3000 veh/h one-way saturates the entry; count fwd lane-0 vehicles within
    // 6 m of the entry — more than one means overlapping injections.
    const sim = new Simulation(
      singleSegCorridor(5000, 'S1', { overtaking: false }),
      emptyScenario,
      makeDemand(3000, 0, 0),
      'typicalWeekday',
      { seed: 5 },
    );
    let maxStacked = 0;
    for (let step = 0; step < 2000; step++) {
      sim.step();
      const s = sim.snapshot();
      let atEntry = 0;
      for (let i = 0; i < s.count; i++) {
        if (s.dir[i] === 0 && s.lane[i] === 0 && s.offsetM[i] < 6) atEntry++;
      }
      maxStacked = Math.max(maxStacked, atEntry);
    }
    expect(maxStacked).toBeLessThanOrEqual(1);
  });
});
