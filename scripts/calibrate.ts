/**
 * Umferð calibration harness — `npm run calibrate`.
 *
 * Loads data/<id>.corridor.json + data/demand.json when the pipeline has
 * produced them; otherwise runs representative SYNTHETIC corridors (built inline
 * here) and says so. Runs the baseline presets (typicalWeekday + fridaySummer),
 * seed 42, 24 sim-hours via stepHours, and prints a calibration table against the
 * CONTRACTS.md targets plus wall-clock performance (target ≥200× real-time).
 *
 * This is a Node CLI (scripts/), so Node APIs are allowed here — the engine
 * itself (src/sim) stays dependency-free.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Simulation, freeFlowTime, applyScenario } from '../src/sim/index';
import type {
  CorridorModel,
  CorridorDemand,
  CorridorId,
  Scenario,
  DemandPresetId,
  SegmentConfig,
  JunctionDef,
} from '../src/types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const EMPTY: Scenario = { segmentOverrides: [], junctionOverrides: [] };
const IDS: CorridorId[] = ['north', 'south', 'kef'];

// Free-flow one-direction time targets (min), EXTENT-CORRECTED.
// research/06 door-to-door figures (north 55–60, south ~45, kef ~40 min) cover
// the full ~74 / 57 / 47 km trips including the urban ends; the pipeline
// corridors start at the suburban edges and measure 67.8 / 47.4 / 39.6 km.
// Targets rescaled proportionally by (corridor lengthM / research km):
//   north 55–60 × 67.8/74 ≈ 50–55 · south ~45 × 47.4/57 ≈ 37–41 · kef ~40 × 39.6/47 ≈ 33–37.
const FF_TARGET: Record<CorridorId, [number, number]> = {
  north: [50, 55],
  south: [37, 41],
  kef: [33, 37],
};

// ---------------------------------------------------------------------------
// Data loading (graceful)
// ---------------------------------------------------------------------------
function tryLoadModel(id: CorridorId): CorridorModel | null {
  const p = path.join(DATA_DIR, `${id}.corridor.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CorridorModel;
  } catch {
    return null;
  }
}

function tryLoadDemand(id: CorridorId): CorridorDemand | null {
  const p = path.join(DATA_DIR, 'demand.json');
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Accept several plausible shapes from the pipeline.
    if (Array.isArray(raw)) return raw.find((d: CorridorDemand) => d.corridorId === id) ?? null;
    if (raw && raw.corridorId === id) return raw as CorridorDemand;
    if (raw && raw[id]) return raw[id] as CorridorDemand;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synthetic fallback corridors (approx research/02 structure)
// ---------------------------------------------------------------------------
let segCounter = 0;
function seg(
  fromM: number, toM: number, config: SegmentConfig, maxspeedKmh: number,
  overtaking = false, barrier = config !== 'S1',
) {
  return {
    id: `s${segCounter++}`, name: `${config}@${maxspeedKmh}`, fromM, toM, config,
    maxspeedKmh, gradePct: 0, overtakingAllowed: overtaking, barrier,
    upgradable: true, aadt2025: 6000, sdu2025: 7000, vdu2025: 5000,
  };
}
function rbt(id: string, offsetM: number, vph: number): JunctionDef {
  return { id, name: id, offsetM, type: 'roundabout', throughSpeedKmh: 30, conflictingVph: vph, upgradable: true };
}
function corridor(id: CorridorId, name: string, lengthM: number, segments: any[], junctions: JunctionDef[]): CorridorModel {
  return {
    id, name, ref: id === 'kef' ? '41' : '1', lengthM,
    centerline: [[0, 0], [0, 1]], vertexOffsetsM: [0, lengthM],
    segments, junctions, stations: [{ id: 'mid', name: 'mid', offsetM: lengthM / 2, hasSpeed: true }],
  };
}

function syntheticModel(id: CorridorId): CorridorModel {
  segCounter = 0;
  if (id === 'north') {
    return corridor('north', 'Reykjavík – Borgarnes (synthetic)', 74000, [
      seg(0, 11000, 'D2', 80),                 // capital-area divided
      seg(11000, 20000, 'S21F', 90),           // Kjalarnes 2+1
      seg(20000, 31000, 'S1', 90, true),       // rural 1+1, passing allowed
      seg(31000, 37000, 'S1', 70, false),      // Hvalfjarðargöng, no passing
      seg(37000, 74000, 'S1', 90, true),       // Hvalfjörður–Borgarnes 1+1
    ], [rbt('kjalarnes', 20000, 300), rbt('borgarnes', 73500, 250)]);
  }
  if (id === 'south') {
    return corridor('south', 'Reykjavík – Selfoss (synthetic)', 57000, [
      seg(0, 8000, 'D2', 80),
      seg(8000, 40000, 'S21F', 90),            // Hellisheiði 2+1
      seg(40000, 56000, 'S21F', 90),           // Ölfus 2+1
      seg(56000, 57000, 'S1', 50, false),      // Selfoss entrance
    ], [rbt('hveragerdi', 45000, 350)]);
  }
  return corridor('kef', 'Reykjavík – Keflavík (synthetic)', 47000, [
    seg(0, 3000, 'D2', 70),
    seg(3000, 46000, 'D2', 90),
    seg(46000, 47000, 'D2', 70),
  ], [rbt('airport', 46000, 300)]);
}

function syntheticDemand(id: CorridorId): CorridorDemand {
  // Commuter double-hump (rev AM toward Rvk, fwd PM) — mirrors pipeline shapes.
  const daylight = (h: number) => (h >= 6 && h <= 23 ? 1 : 0.3);
  const g = (h: number, c: number, w: number, a: number) => a * Math.exp(-((h - c) ** 2) / (2 * w * w));
  const fwd = Array.from({ length: 24 }, (_, h) => 0.15 * daylight(h) + g(h, 17, 1.6, 1) + g(h, 12, 3, 0.28));
  const rev = Array.from({ length: 24 }, (_, h) => 0.15 * daylight(h) + g(h, 8, 1.6, 1) + g(h, 12, 3, 0.28));
  const tot = fwd.reduce((a, b) => a + b, 0) + rev.reduce((a, b) => a + b, 0);
  const profile = {
    hourSharesFwd: fwd.map((v) => v / tot),
    hourSharesRev: rev.map((v) => v / tot),
    dayFactor: 1,
  };
  const friday = { ...profile, dayFactor: id === 'kef' ? 1.05 : 1.15 };
  const aadtRef = id === 'kef' ? 11000 : id === 'south' ? 9000 : 6000;
  return {
    corridorId: id, aadtRef, truckShare: id === 'kef' ? 0.06 : 0.1,
    presets: { typicalWeekday: profile, fridaySummer: friday, sundayReturn: friday },
  };
}

// ---------------------------------------------------------------------------
// Run + report
// ---------------------------------------------------------------------------
const fmtMin = (s: number) => (s / 60).toFixed(1);
const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

interface Row {
  corridor: string; preset: string; ffMin: number; secs: number;
  ttFwd: number; ttRev: number; kmhFwd: number; ptsfFwd: number; delayFwd: number; trips: number;
  s1PeakKmh: number; // harmonic mean speed on the far S1 stretch at the PM peak hour
}

/** Harmonic-mean fwd speed on the long rural S1 stretch (far half of corridor)
 *  sampled at the PM peak hour — the platoon-formation calibration point. */
function s1StretchPeakSpeed(sim: Simulation, model: CorridorModel): number {
  const ss = sim.segmentStats();
  const far = model.segments.filter((s) => s.config === 'S1' && s.fromM > model.lengthM * 0.5);
  const vals = far
    .map((s) => ss.find((x) => x.segmentId === s.id)?.avgSpeedFwd ?? -1)
    .filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -1;
}

function runOne(model: CorridorModel, demand: CorridorDemand, preset: DemandPresetId): Row {
  const sim = new Simulation(model, EMPTY, demand, preset, { seed: 42 });
  const t0 = process.hrtime.bigint();
  sim.stepHours(17);              // run to the PM peak
  const s1PeakKmh = s1StretchPeakSpeed(sim, model);
  sim.stepHours(7);              // finish the day
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  const a = sim.aggregates();
  const resolved = applyScenario(model, EMPTY);
  const ff = freeFlowTime(resolved, 0);
  return {
    corridor: model.id, preset, secs,
    ffMin: ff / 60,
    ttFwd: a.meanTravelTimeS.fwd, ttRev: a.meanTravelTimeS.rev,
    kmhFwd: a.meanTravelTimeS.fwd > 0 ? (model.lengthM / a.meanTravelTimeS.fwd) * 3.6 : 0,
    ptsfFwd: a.ptsf.fwd, delayFwd: a.meanDelayS.fwd, trips: a.trips.length,
    s1PeakKmh,
  };
}

function main() {
  console.log('\nUmferð calibration harness — seed 42, 24 sim-hours per run\n');

  const rows: Row[] = [];
  let usingSynthetic = false;
  const t0 = process.hrtime.bigint();

  for (const id of IDS) {
    let model = tryLoadModel(id);
    let demand = tryLoadDemand(id);
    if (!model || !demand) {
      usingSynthetic = true;
      model = syntheticModel(id);
      demand = syntheticDemand(id);
    }
    for (const preset of ['typicalWeekday', 'fridaySummer'] as DemandPresetId[]) {
      rows.push(runOne(model, demand, preset));
    }
  }

  const elapsedS = Number(process.hrtime.bigint() - t0) / 1e9;

  if (usingSynthetic) {
    console.log('  NOTE: data/*.corridor.json / data/demand.json not found — running');
    console.log('        SYNTHETIC corridors (approx research/02). Numbers are illustrative.\n');
  } else {
    console.log('  Loaded data/*.corridor.json + data/demand.json.\n');
  }

  // Table
  console.log(pad('corridor', 8), pad('preset', 15), padL('FF min', 7),
    padL('TT→ min', 9), padL('TT← min', 9), padL('km/h→', 7), padL('PTSF→', 7),
    padL('delay m', 8), padL('trips', 7), padL('secs', 6));
  console.log('-'.repeat(92));
  for (const r of rows) {
    console.log(
      pad(r.corridor, 8), pad(r.preset, 15), padL(r.ffMin.toFixed(1), 7),
      padL(fmtMin(r.ttFwd), 9), padL(fmtMin(r.ttRev), 9), padL(r.kmhFwd.toFixed(1), 7),
      padL(r.ptsfFwd.toFixed(2), 7), padL(fmtMin(r.delayFwd), 8), padL(String(r.trips), 7),
      padL(r.secs.toFixed(1), 6),
    );
  }

  // Targets vs sim
  console.log('\nCalibration checks (CONTRACTS.md / research/06):');
  for (const id of IDS) {
    const r = rows.find((x) => x.corridor === id && x.preset === 'typicalWeekday')!;
    const [lo, hi] = FF_TARGET[id];
    const ok = r.ffMin >= lo - 3 && r.ffMin <= hi + 3;
    console.log(`  ${pad(id, 6)} free-flow ${r.ffMin.toFixed(1)} min  (target ${lo}-${hi})  ${ok ? 'OK' : 'CHECK'}`);
  }
  const northFri = rows.find((x) => x.corridor === 'north' && x.preset === 'fridaySummer')!;
  console.log(`  north Friday: corridor PTSF(fwd)=${northFri.ptsfFwd.toFixed(2)}, ` +
    `far-S1 stretch speed @PM-peak=${northFri.s1PeakKmh.toFixed(1)} km/h ` +
    `(target: PTSF>0.5, 70-85 km/h on the clean 1+1 stretch)`);

  // Determinism
  const dm = tryLoadModel('north') ?? syntheticModel('north');
  const dd = tryLoadDemand('north') ?? syntheticDemand('north');
  const a1 = (() => { const s = new Simulation(dm, EMPTY, dd, 'typicalWeekday', { seed: 7 }); s.stepHours(2); return s.aggregates(); })();
  const a2 = (() => { const s = new Simulation(dm, EMPTY, dd, 'typicalWeekday', { seed: 7 }); s.stepHours(2); return s.aggregates(); })();
  const deterministic = a1.vehKm === a2.vehKm && a1.trips.length === a2.trips.length
    && a1.meanTravelTimeS.fwd === a2.meanTravelTimeS.fwd;
  console.log(`  determinism (same seed ⇒ identical aggregates): ${deterministic ? 'OK' : 'FAIL'}`);

  // Performance
  const simHours = 24 * rows.length; // total sim-hours executed
  const xRealtime = (simHours * 3600) / elapsedS;
  const northTyp = rows.find((x) => x.corridor === 'north' && x.preset === 'typicalWeekday')!;
  const slowest = rows.reduce((a, b) => (a.secs > b.secs ? a : b));
  console.log(`\nPerformance: ${rows.length} runs × 24 h = ${simHours} sim-hours in ${elapsedS.toFixed(1)} s ` +
    `wall-clock ⇒ ${Math.round(xRealtime)}× real-time (target ≥200×).`);
  console.log(`  north typicalWeekday 24h: ${northTyp.secs.toFixed(1)} s ` +
    `(${Math.round(86400 / northTyp.secs)}× real-time; target well under 60 s).`);
  console.log(`  slowest run: ${slowest.corridor}/${slowest.preset} = ${slowest.secs.toFixed(1)} s ` +
    `(heavy congestion inflates concurrency).\n`);
}

main();
