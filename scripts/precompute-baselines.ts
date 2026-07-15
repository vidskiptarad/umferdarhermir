/**
 * Precompute baseline (empty-scenario) 24h aggregates for all corridors × presets.
 * Deterministic (seed 42), so results are valid until data/ or the engine changes.
 * Output: data/baselines.json — loaded by the app at startup to skip ~10 min of
 * in-browser baseline simulation.
 *
 * Trips are stripped to the fields the UI/econ actually read (dir, isTruck,
 * travelTimeS) with travelTimeS rounded to whole seconds to keep the file small;
 * entryTimeS/followingTimeS are zeroed (unused downstream).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Simulation } from '../src/sim';
import type { CorridorDemand, CorridorModel, DemandPresetId, SimAggregates } from '../src/types';

const root = join(__dirname, '..');
const CORRIDORS = ['north', 'south', 'kef'] as const;
const PRESETS: DemandPresetId[] = ['typicalWeekday', 'fridaySummer', 'sundayReturn'];
const EMPTY = { segmentOverrides: [], junctionOverrides: [] };

const demandAll = JSON.parse(readFileSync(join(root, 'data/demand.json'), 'utf8')) as CorridorDemand[];

const out: Record<string, SimAggregates> = {};
for (const cid of CORRIDORS) {
  const model = JSON.parse(readFileSync(join(root, `data/${cid}.corridor.json`), 'utf8')) as CorridorModel;
  const demand = demandAll.find((d) => d.corridorId === cid)!;
  for (const preset of PRESETS) {
    const t0 = Date.now();
    const sim = new Simulation(model, EMPTY, demand, preset, { seed: 42 });
    sim.stepHours(24);
    const agg = sim.aggregates();
    agg.trips = agg.trips.map((t) => ({
      dir: t.dir,
      isTruck: t.isTruck,
      travelTimeS: Math.round(t.travelTimeS),
      entryTimeS: 0,
      followingTimeS: 0,
    }));
    out[`${cid}|${preset}`] = agg;
    console.log(`${cid} ${preset}: ${agg.trips.length} trips, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

const path = join(root, 'data/baselines.json');
writeFileSync(path, JSON.stringify(out));
console.log(`wrote ${path} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);
