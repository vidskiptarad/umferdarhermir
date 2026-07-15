/**
 * Aggregate the sweep runs into data/sweep-results.json for the blog charts:
 * per scenario × demand-scale → annual benefits (time + safety), NPV, veh-hours,
 * accidents avoided, km upgraded, per-preset median travel times, and chart
 * series (hour curves + distributions for the flagship comparisons).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeBenefits, defaultEconParams } from '../src/econ';
import type {
  CorridorDemand,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  SimAggregates,
} from '../src/types';
import { kmUpgraded, scenariosFor } from './sweep-scenarios';

const root = join(__dirname, '..');
const sweepDir = join(root, 'data', 'sweep');
const PRESETS: DemandPresetId[] = ['typicalWeekday', 'fridaySummer', 'sundayReturn'];
const ANNUALIZATION = {
  days: [
    { preset: 'typicalWeekday' as const, daysPerYear: 250 },
    { preset: 'fridaySummer' as const, daysPerYear: 58 },
    { preset: 'sundayReturn' as const, daysPerYear: 57 },
  ],
};

interface RunFile {
  cid: CorridorId;
  scenarioName: string;
  preset: DemandPresetId;
  scale: number;
  hourMedianFwdS: (number | null)[];
  aggregates: SimAggregates;
}

const runs = new Map<string, RunFile>();
for (const f of readdirSync(sweepDir)) {
  if (!f.endsWith('.json')) continue;
  const r = JSON.parse(readFileSync(join(sweepDir, f), 'utf8')) as RunFile;
  runs.set(`${r.cid}|${r.scenarioName}|${r.preset}|${r.scale}`, r);
}
const baselines = JSON.parse(readFileSync(join(root, 'data/baselines.json'), 'utf8')) as Record<
  string,
  SimAggregates
>;
const demandAll = JSON.parse(readFileSync(join(root, 'data/demand.json'), 'utf8')) as CorridorDemand[];
const models = new Map<CorridorId, CorridorModel>(
  (['north', 'south', 'kef'] as CorridorId[]).map((cid) => [
    cid,
    JSON.parse(readFileSync(join(root, `data/${cid}.corridor.json`), 'utf8')),
  ]),
);

function baselineAgg(cid: CorridorId, preset: DemandPresetId, scale: number): SimAggregates {
  if (scale === 1) return baselines[`${cid}|${preset}`];
  return runs.get(`${cid}|baseline|${preset}|${scale}`)!.aggregates;
}

function bins(trips: { dir: number; travelTimeS: number }[], minM: number, maxM: number, w: number) {
  const n = Math.ceil((maxM - minM) / w);
  const out = new Array(n).fill(0);
  for (const t of trips) {
    if (t.dir !== 0) continue;
    const m = t.travelTimeS / 60;
    out[Math.max(0, Math.min(n - 1, Math.floor((m - minM) / w)))]++;
  }
  return out;
}

const params = defaultEconParams();
const results: Record<string, unknown>[] = [];

for (const [key, run] of runs) {
  if (run.scenarioName === 'baseline' || run.preset !== 'fridaySummer') continue; // one row per scenario×scale
  const { cid, scenarioName, scale } = run;
  const model = models.get(cid)!;
  const demand = demandAll.find((d) => d.corridorId === cid)!;
  const scenario = scenariosFor(cid, model)[scenarioName];

  const base: SimAggregates[] = [];
  const upg: SimAggregates[] = [];
  let complete = true;
  for (const d of ANNUALIZATION.days) {
    const u = runs.get(`${cid}|${scenarioName}|${d.preset}|${scale}`);
    const b = baselineAgg(cid, d.preset, scale);
    if (!u || !b) {
      complete = false;
      break;
    }
    base.push(b);
    upg.push(u.aggregates);
  }
  if (!complete) {
    console.warn(`incomplete: ${key}`);
    continue;
  }
  const ben = computeBenefits(base, upg, ANNUALIZATION, demand, model, scenario, params);
  const km = kmUpgraded(model, scenario);
  const perPreset = Object.fromEntries(
    PRESETS.map((p, i) => [
      p,
      {
        baseP50FwdS: Math.round(base[i].p50TravelTimeS.fwd),
        upgP50FwdS: Math.round(upg[i].p50TravelTimeS.fwd),
        baseP50RevS: Math.round(base[i].p50TravelTimeS.rev),
        upgP50RevS: Math.round(upg[i].p50TravelTimeS.rev),
      },
    ]),
  );
  results.push({
    corridor: cid,
    scenario: scenarioName,
    scale,
    benefits: {
      timeISKPerYear: Math.round(ben.timeSavingsISKPerYear),
      safetyISKPerYear: Math.round(ben.safetyBenefitISKPerYear),
      totalISKPerYear: Math.round(ben.totalISKPerYear),
      npv30ISK: Math.round(ben.npv30ISK),
      vehHoursPerYear: Math.round(ben.vehHoursSavedPerYear),
      accidentsAvoidedPerYear: +ben.detail.accidentsAvoidedPerYear.toFixed(2),
    },
    km,
    iskPerRebuildKmPerYear: km.rebuildKm > 0 ? Math.round(ben.totalISKPerYear / km.rebuildKm) : null,
    perPreset,
  });
}

// chart series: north friday baseline vs all-d2-110 (scale 1)
const nb = runs.get('north|baseline|fridaySummer|1')!;
const nu = runs.get('north|all-d2-110|fridaySummer|1')!;
const sb = runs.get('south|baseline|fridaySummer|1')!;
const su = runs.get('south|all-d2-110|fridaySummer|1')!;
const charts = {
  northFriday: {
    hoursBaseline: nb.hourMedianFwdS,
    hoursUpgrade: nu.hourMedianFwdS,
    distBaseline: bins(nb.aggregates.trips, 30, 240, 5),
    distUpgrade: bins(nu.aggregates.trips, 30, 240, 5),
    distMinM: 30,
    distW: 5,
  },
  southFriday: {
    hoursBaseline: sb.hourMedianFwdS,
    hoursUpgrade: su.hourMedianFwdS,
  },
};

results.sort((a, b) => ((b as never)['benefits'] as { totalISKPerYear: number }).totalISKPerYear - ((a as never)['benefits'] as { totalISKPerYear: number }).totalISKPerYear);
writeFileSync(join(root, 'data/sweep-results.json'), JSON.stringify({ results, charts }, null, 1));
console.log(`${results.length} scenario results`);
for (const r of results) {
  const b = (r as { benefits: { totalISKPerYear: number; timeISKPerYear: number; safetyISKPerYear: number } }).benefits;
  console.log(
    `${String(r.corridor).padEnd(6)} ${String(r.scenario).padEnd(20)} x${r.scale}  total ${(b.totalISKPerYear / 1e9).toFixed(2)} ma.kr/ár (tími ${(b.timeISKPerYear / 1e9).toFixed(2)} + slys ${(b.safetyISKPerYear / 1e9).toFixed(2)})`,
  );
}
