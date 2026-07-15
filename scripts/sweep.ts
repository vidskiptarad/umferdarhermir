/**
 * Scenario sweep for the blog post: run every meaningful buildout × 3 demand
 * presets (+ demand-growth sensitivity), dump per-run aggregates + hour curves
 * to data/sweep/*.json. Deterministic (seed 42). Run slices in parallel:
 *   npx tsx scripts/sweep.ts 0 4   # slice 0 of 4
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Simulation } from '../src/sim';
import type {
  CorridorDemand,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  Scenario,
  SegmentDef,
} from '../src/types';

const root = join(__dirname, '..');
const outDir = join(root, 'data', 'sweep');
mkdirSync(outDir, { recursive: true });

const PRESETS: DemandPresetId[] = ['typicalWeekday', 'fridaySummer', 'sundayReturn'];

function load(cid: CorridorId): { model: CorridorModel; demand: CorridorDemand } {
  const model = JSON.parse(readFileSync(join(root, `data/${cid}.corridor.json`), 'utf8'));
  const demand = (JSON.parse(readFileSync(join(root, 'data/demand.json'), 'utf8')) as CorridorDemand[]).find(
    (d) => d.corridorId === cid,
  )!;
  return { model, demand };
}

// ---------------------------------------------------------------- scenarios
const isTunnel = (s: SegmentDef) => s.upgradeHint === 'tunnel-bore-2';
const isOlfus = (s: SegmentDef) => s.upgradeHint === 'fourth-lane';
const isS21 = (s: SegmentDef) => s.config === 'S21F' || s.config === 'S21R';
const rural = (s: SegmentDef) => s.maxspeedKmh >= 80;

function d2(segs: SegmentDef[], speed?: number): Scenario {
  return {
    segmentOverrides: segs.map((s) => ({ segmentId: s.id, config: 'D2' as const, maxspeedKmh: speed })),
    junctionOverrides: [],
  };
}
function allJunctions(model: CorridorModel) {
  return model.junctions
    .filter((j) => j.upgradable && j.type !== 'grade-separated')
    .map((j) => ({ junctionId: j.id, type: 'grade-separated' as const }));
}
function full(model: CorridorModel, speed110: boolean): Scenario {
  return {
    segmentOverrides: model.segments
      .filter((s) => s.upgradable)
      .map((s) => ({
        segmentId: s.id,
        config: 'D2' as const,
        maxspeedKmh: speed110 && rural(s) ? 110 : undefined,
      })),
    junctionOverrides: allJunctions(model),
  };
}

function scenariosFor(cid: CorridorId, model: CorridorModel): Record<string, Scenario> {
  const segs = model.segments;
  if (cid === 'north') {
    return {
      baseline: { segmentOverrides: [], junctionOverrides: [] },
      'kjalarnes-d2': d2(segs.filter((s) => isS21(s) && !isTunnel(s) && s.upgradable)),
      tunnel2: d2(segs.filter(isTunnel)), // second bore, keeps 70 km/h
      'hvalfj-borgarnes-d2': d2(segs.filter((s) => s.config === 'S1' && !isTunnel(s) && s.upgradable)),
      'all-d2-90': full(model, false),
      'all-d2-110': full(model, true),
      // Signs-only: 110 km/h on segments that ALREADY have 2+2 or 2+1 in the
      // baseline network (no construction) — analogous to kef '110'.
      '110-existing': {
        segmentOverrides: segs
          .filter((s) => (s.config === 'D2' || isS21(s)) && s.upgradable && rural(s) && !isTunnel(s))
          .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
        junctionOverrides: [],
      },
    };
  }
  if (cid === 'south') {
    return {
      baseline: { segmentOverrides: [], junctionOverrides: [] },
      'olfus-4th': d2(segs.filter(isOlfus)),
      'hellisheidi-d2': d2(segs.filter((s) => isS21(s) && !isOlfus(s) && s.upgradable)),
      'all-d2-90': full(model, false),
      'all-d2-110': full(model, true),
      // Signs-only: 110 km/h on segments that ALREADY have 2+2 or 2+1 in the
      // baseline network (no construction) — analogous to kef '110'.
      '110-existing': {
        segmentOverrides: segs
          .filter((s) => (s.config === 'D2' || isS21(s)) && s.upgradable && rural(s) && !isTunnel(s))
          .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
        junctionOverrides: [],
      },
    };
  }
  return {
    baseline: { segmentOverrides: [], junctionOverrides: [] },
    '110': {
      segmentOverrides: segs.filter((s) => s.config === 'D2' && s.upgradable && rural(s)).map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
      junctionOverrides: [],
    },
    junctions: { segmentOverrides: [], junctionOverrides: allJunctions(model) },
    both: {
      segmentOverrides: segs.filter((s) => s.config === 'D2' && s.upgradable && rural(s)).map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
      junctionOverrides: allJunctions(model),
    },
  };
}

// ---------------------------------------------------------------- run list
interface Job {
  cid: CorridorId;
  scenarioName: string;
  preset: DemandPresetId;
  scale: number;
}
const jobs: Job[] = [];
for (const cid of ['north', 'south', 'kef'] as CorridorId[]) {
  const { model } = load(cid);
  const scen = scenariosFor(cid, model);
  for (const name of Object.keys(scen)) {
    // baseline @1.0 already precomputed (baselines.json) EXCEPT we need hour
    // curves for the friday chart — run baseline fridaySummer only.
    for (const preset of PRESETS) {
      if (name === 'baseline' && !(preset === 'fridaySummer')) continue;
      jobs.push({ cid, scenarioName: name, preset, scale: 1 });
    }
  }
}
// demand-growth sensitivity (~2035: 2.3%/yr for 9 yrs ≈ ×1.23) — flagships + baselines
for (const cid of ['north', 'south'] as CorridorId[]) {
  for (const preset of PRESETS) {
    jobs.push({ cid, scenarioName: 'baseline', preset, scale: 1.23 });
    jobs.push({ cid, scenarioName: 'all-d2-110', preset, scale: 1.23 });
  }
}

// ---------------------------------------------------------------- execute slice
const sliceI = Number(process.argv[2] ?? 0);
const sliceN = Number(process.argv[3] ?? 1);

function hourCurves(trips: { dir: number; entryTimeS: number; travelTimeS: number }[]) {
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const t of trips) if (t.dir === 0) byHour[Math.floor(t.entryTimeS / 3600) % 24].push(t.travelTimeS);
  return byHour.map((arr) => {
    if (arr.length < 5) return null;
    arr.sort((a, b) => a - b);
    return Math.round(arr[Math.floor(arr.length / 2)]);
  });
}

for (let i = 0; i < jobs.length; i++) {
  if (i % sliceN !== sliceI) continue;
  const job = jobs[i];
  const file = join(outDir, `${job.cid}__${job.scenarioName}__${job.preset}__${job.scale}.json`);
  if (existsSync(file)) {
    console.log(`skip ${file}`);
    continue;
  }
  const { model, demand } = load(job.cid);
  const scenario = scenariosFor(job.cid, model)[job.scenarioName];
  const t0 = Date.now();
  const sim = new Simulation(model, scenario, demand, job.preset, { seed: 42, demandScale: job.scale });
  sim.stepHours(24);
  const agg = sim.aggregates();
  const out = {
    ...job,
    hourMedianFwdS: hourCurves(agg.trips),
    aggregates: {
      ...agg,
      trips: agg.trips.map((t) => ({
        dir: t.dir,
        isTruck: t.isTruck,
        travelTimeS: Math.round(t.travelTimeS),
        entryTimeS: 0,
        followingTimeS: 0,
      })),
    },
  };
  writeFileSync(file, JSON.stringify(out));
  console.log(`${job.cid} ${job.scenarioName} ${job.preset} x${job.scale}: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('slice done');
