import { describe, it, expect } from 'vitest';
import { Simulation } from '../simulation';
import { singleSegCorridor, makeDemand, emptyScenario, roundabout } from './fixtures';

function run(grade: boolean) {
  const model = singleSegCorridor(10000, 'D2', { junctions: [roundabout(5000, 1200)] });
  const scenario = grade
    ? { segmentOverrides: [], junctionOverrides: [{ junctionId: 'rbt', type: 'grade-separated' as const }] }
    : emptyScenario;
  const sim = new Simulation(model, scenario, makeDemand(900, 0, 0.1), 'typicalWeekday', { seed: 5 });
  sim.stepHours(50 / 60);
  const a = sim.aggregates();
  return { delay: a.meanDelayS.fwd, trips: a.trips.filter((t) => t.dir === 0).length };
}

describe('junction capacity gate', () => {
  const rbt = run(false);
  const grade = run(true);

  it('a saturated roundabout produces a queue and large delay', () => {
    expect(rbt.delay).toBeGreaterThan(100);
  });
  it('grade-separating the node removes almost all of that delay', () => {
    expect(grade.delay).toBeLessThan(rbt.delay / 3);
  });
  it('the queue throttles throughput (fewer completed trips than grade-separated)', () => {
    expect(rbt.trips).toBeLessThan(grade.trips);
  });
});
