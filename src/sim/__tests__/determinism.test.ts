import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { singleSegCorridor, makeDemand, emptyScenario } from './fixtures';

function runAgg(seed: number) {
  const sim = new Simulation(
    singleSegCorridor(15000, 'S1', { overtaking: true }),
    emptyScenario,
    makeDemand(500, 400, 0.15),
    'fridaySummer',
    { seed },
  );
  sim.stepHours(1.5);
  return sim.aggregates();
}

describe('determinism', () => {
  it('identical seed ⇒ identical aggregates', () => {
    const a = runAgg(123);
    const b = runAgg(123);
    expect(a.vehKm).toBe(b.vehKm);
    expect(a.trips.length).toBe(b.trips.length);
    expect(a.meanTravelTimeS).toEqual(b.meanTravelTimeS);
    expect(a.ptsf).toEqual(b.ptsf);
    expect(a.vehKmBySegment).toEqual(b.vehKmBySegment);
  });

  it('different seed ⇒ different microscopic outcome', () => {
    const a = runAgg(1);
    const b = runAgg(2);
    expect(a.meanTravelTimeS.fwd).not.toBe(b.meanTravelTimeS.fwd);
  });
});

describe('snapshot buffer sanity', () => {
  it('count matches active vehicles; offsets in range; buffers reused', () => {
    const sim = new Simulation(
      singleSegCorridor(10000, 'D2'),
      emptyScenario,
      makeDemand(600, 600, 0.1),
      'typicalWeekday',
      { seed: 9 },
    );
    sim.stepHours(0.5);
    const s1 = sim.snapshot();
    expect(s1.count).toBeGreaterThan(0);
    expect(s1.offsetM.length).toBeGreaterThanOrEqual(s1.count);
    for (let i = 0; i < s1.count; i++) {
      expect(s1.offsetM[i]).toBeGreaterThanOrEqual(0);
      expect(s1.offsetM[i]).toBeLessThanOrEqual(10000);
      expect(s1.dir[i] === 0 || s1.dir[i] === 1).toBe(true);
    }
    // buffers are reused across calls (same backing array reference)
    const s2 = sim.snapshot();
    expect(s2.offsetM).toBe(s1.offsetM);
  });
});
