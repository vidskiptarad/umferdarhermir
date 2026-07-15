/**
 * Umferð corridor pipeline — entry point (`npm run pipeline`).
 *
 * Fuses three sources into data/<id>.corridor.json + data/demand.json:
 *   • OpenStreetMap (Overpass)      → centerline geometry            [research/05]
 *   • Vegagerðin ArcGIS slysumferd  → authoritative chainage + AADT  [research/01]
 *   • research/02 ground truth      → lane config / limits / junctions
 *
 * All remote responses are cached under scripts/pipeline/cache/, so re-runs are
 * fully offline. See scripts/pipeline/README.md for provenance + assumptions.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LonLat,
  haversineM,
  pointAtOffset,
  projectOntoLine,
  minDistToPolylineM,
} from './util';
import { fetchOsmWays, fetchAadu, fetchStations, AaduFeature } from './sources';
import { buildCenterline, extractRoundabouts } from './geometry';
import { CORRIDORS, CorridorSpec, ManualJunction } from './corridors';
import { buildDemand, validateProfile } from './demand';
import {
  CorridorModel,
  SegmentDef,
  JunctionDef,
  CountStation,
  CorridorDemand,
  JunctionType,
} from '../../src/types';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const round = (n: number, dp = 6) => +n.toFixed(dp);

// Default through-speeds (km/h) by junction type (CONTRACTS junction node model).
function throughSpeed(type: JunctionType, segLimit: number): number {
  switch (type) {
    case 'roundabout':
      return 30; // CONTRACTS §Junction node model
    case 'signal':
      return 20; // ASSUMPTION: signals modeled as low-through capacity server
    case 't-junction':
      return segLimit; // mainline has priority — barely slows (task spec)
    case 'grade-separated':
      return segLimit; // no effect
  }
}

interface BuildResult {
  model: CorridorModel;
  demand: CorridorDemand;
  endpointDistM: { start: number; end: number };
  /** authoritative-chainage / OSM-geodesic length ratio (should be ≈1, <1.05). */
  stretch: number;
}

async function buildCorridor(spec: CorridorSpec): Promise<BuildResult> {
  console.log(`\n=== ${spec.id.toUpperCase()} (${spec.name}) ===`);

  // 1. OSM geometry ---------------------------------------------------------
  // Cache key includes the bbox so changing the query invalidates the cache.
  const osmCacheName = `osm-${spec.id}-${spec.bbox.join('_')}.json`;
  const ways = await fetchOsmWays(spec.ref, spec.bbox, osmCacheName);
  // Densify to 44 m so that after the ≤1.11× chainage calibration below the final
  // vertex spacing stays ≤ ~50 m (CONTRACTS centerline requirement).
  const cl = buildCenterline(ways, spec.p0, spec.p1, 44);
  const osmLen = cl.lengthM;

  // Endpoints must land on the corridor anchors (MAJOR-1/MINOR-7 audit checks).
  const dStart = haversineM(cl.points[0], spec.p0);
  const dEnd = haversineM(cl.points[cl.points.length - 1], spec.p1);
  console.log(`  endpoint→anchor: start ${dStart.toFixed(0)} m, end ${dEnd.toFixed(0)} m`);

  // 2. Vegagerðin annual counts (layers 8=ÁDU, 9=SDU, 10=VDU), cached per ref
  const adu = await fetchAadu(spec.ref, 8, `aadu-${spec.ref}-8.json`);
  const sduL = await fetchAadu(spec.ref, 9, `aadu-${spec.ref}-9.json`);
  const vduL = await fetchAadu(spec.ref, 10, `aadu-${spec.ref}-10.json`);

  // 3. Authoritative length from official section chainage (research/05 §5.5).
  // Boundary sections can extend past the corridor anchors (e.g. Reykjanesbraut
  // section 14 starts north of the Lækjargata corridor start; Selfoss d5 crosses
  // the Ölfusá bridge past our endpoint), so each section's chainage length is
  // weighted by the fraction of its polyline that lies ON the corridor: a
  // sub-span is "on" when its midpoint is <300 m from the OSM centerline
  // (vertices beyond an anchor project onto the clamped line end and their
  // perpendicular distance grows with overshoot).
  const codes = new Set(spec.sectionCodes);
  let authLen = 0;
  for (const f of adu) {
    if (!codes.has(f.nrkafli)) continue;
    const chainLen = Math.max(0, f.enda - f.upph);
    if (chainLen === 0 || f.points.length < 2) continue;
    let inside = 0;
    let total = 0;
    for (let i = 1; i < f.points.length; i++) {
      const d = haversineM(f.points[i - 1], f.points[i]);
      total += d;
      const mid: LonLat = [
        (f.points[i - 1][0] + f.points[i][0]) / 2,
        (f.points[i - 1][1] + f.points[i][1]) / 2,
      ];
      if (minDistToPolylineM(mid, cl.points) < 300) inside += d;
    }
    authLen += total > 0 ? chainLen * (inside / total) : chainLen;
  }
  if (authLen <= 0) throw new Error(`${spec.id}: no chainage for sections ${spec.sectionCodes}`);
  const scale = authLen / osmLen;
  const lengthM = round(authLen, 1);

  // Offset axis calibrated to authoritative chainage; geometry keeps OSM shape.
  const centerline: [number, number][] = cl.points.map((p) => [round(p[0]), round(p[1])]);
  const vertexOffsetsM = cl.offsetsM.map((o) => round(o * scale, 1));
  vertexOffsetsM[vertexOffsetsM.length - 1] = lengthM;

  console.log(
    `  OSM chain ${(osmLen / 1000).toFixed(1)} km → calibrated to Vegagerðin ${(authLen / 1000).toFixed(1)} km (×${scale.toFixed(3)}), ${centerline.length} verts`
  );

  // Helper: geographic point at an authoritative offset (map back through scale).
  const geoAt = (offAuth: number): LonLat => pointAtOffset(cl.points, cl.offsetsM, offAuth / scale);

  // Nearest annual-count value for a point, from one layer's polylines.
  const nearestVal = (pt: LonLat, feats: AaduFeature[], pick: (f: AaduFeature) => number): number => {
    let best = 0;
    let bestD = Infinity;
    for (const f of feats) {
      if (!codes.has(f.nrkafli)) continue; // restrict to this corridor's sections
      const d = minDistToPolylineM(pt, f.points);
      if (d < bestD) {
        bestD = d;
        best = pick(f);
      }
    }
    return best;
  };

  // Segment count value: sample the layer at 5 evenly spaced points along the
  // segment and take the median, so long segments spanning several Vegagerðin
  // sections reflect their span rather than a single midpoint (audit MINOR-6).
  const segVal = (fromM: number, toM: number, feats: AaduFeature[], pick: (f: AaduFeature) => number): number => {
    const vals = [0.1, 0.3, 0.5, 0.7, 0.9]
      .map((t) => nearestVal(geoAt(fromM + t * (toM - fromM)), feats, pick))
      .sort((a, b) => a - b);
    return vals[2]; // median of 5 equally-spaced samples ≈ length-weighted median
  };

  // 4. Segments -------------------------------------------------------------
  const sumApprox = spec.segments.reduce((a, s) => a + s.approxKm, 0);
  const segScale = lengthM / (sumApprox * 1000);
  const segments: SegmentDef[] = [];
  let cursor = 0;
  spec.segments.forEach((s, i) => {
    const segLen = s.approxKm * 1000 * segScale;
    const fromM = round(cursor, 1);
    const toM = i === spec.segments.length - 1 ? lengthM : round(cursor + segLen, 1);
    cursor = toM;
    const barrier = s.config !== 'S1'; // S21*/D2 always have a median barrier …
    const isTunnelClimb = s.upgradeHint === 'tunnel-bore-2' && s.config === 'S21F';
    segments.push({
      id: `${spec.id}-${String(i + 1).padStart(2, '0')}`,
      name: s.name,
      fromM,
      toM,
      config: s.config,
      maxspeedKmh: s.maxspeedKmh,
      gradePct: s.gradePct,
      overtakingAllowed: s.overtakingAllowed,
      // … EXCEPT the Hvalfjörður tunnel 3-lane climb: single bore, no physical
      // median even though config is S21F (documented exception, research/02 §1).
      barrier: isTunnelClimb ? false : barrier,
      upgradable: s.upgradable,
      upgradeHint: s.upgradeHint,
      aadt2025: segVal(fromM, toM, adu, (f) => f.adu),
      sdu2025: segVal(fromM, toM, sduL, (f) => f.sdu),
      vdu2025: segVal(fromM, toM, vduL, (f) => f.vdu),
    });
  });

  const segLimitAt = (off: number): number =>
    segments.find((s) => off >= s.fromM && off <= s.toM)?.maxspeedKmh ?? 90;
  // Local AADT delta between the Vegagerðin sections straddling a junction (sampled
  // ±300 m from the annual-count polylines). Where a side road peels off, adjacent
  // sections differ by ~the side-road flow; mid-section junctions read ~0.
  // conflictingVph ≈ that delta × peak-hour fraction (ASSUMPTION, task spec).
  const clamp = (o: number) => Math.max(0, Math.min(lengthM, o));
  const conflictFrom = (off: number, floor: number): number => {
    const a = nearestVal(geoAt(clamp(off - 300)), adu, (f) => f.adu);
    const b = nearestVal(geoAt(clamp(off + 300)), adu, (f) => f.adu);
    return Math.max(floor, Math.round(Math.abs(a - b) * 0.1)); // ASSUMPTION 10% peak-hour
  };

  // 5. Junctions ------------------------------------------------------------
  const junctions: JunctionDef[] = [];
  // 5a. OSM roundabouts on the centerline (research/05 §5.7)
  const roundabouts = extractRoundabouts(ways);
  const osmRoundOffsets: number[] = [];
  for (const c of roundabouts) {
    const proj = projectOntoLine(cl.points, cl.offsetsM, c);
    // Keep only roundabouts the mainline centerline actually passes through;
    // 90 m rejects side-road / grade-separated bridge roundabouts (e.g. Straumsvík
    // interchange bridge, Mosfellsbær side roads) that are near but not ON the route.
    if (proj.distM > 90) continue;
    const offAuth = round(proj.offsetM * scale, 1);
    if (offAuth < lengthM * 0.005 || offAuth > lengthM * 0.995) continue;
    osmRoundOffsets.push(offAuth);
  }
  osmRoundOffsets.sort((a, b) => a - b);
  // Dedupe near-identical rings (twin-lobe roundabouts, split OSM rings).
  const dedupedRings: number[] = [];
  for (const off of osmRoundOffsets) {
    if (!dedupedRings.some((o) => Math.abs(o - off) < 200)) dedupedRings.push(off);
  }

  // MATCH-ONLY rule (audit MAJOR-2): an auto-detected ring becomes a junction only
  // if it corresponds to a roundabout in the research/02-sourced manual list
  // (within 1500 m). Unmatched rings are interchange-ramp/side-road artifacts
  // (grade-separated Ártúnsbrekka stretch, Kjalarnes underpass ramps, tunnel
  // portal loops) and are dropped. Matching is greedy one-to-one by distance so
  // each manual entry names at most one ring (audit MINOR-5).
  const manualRounds = spec.manualJunctions.filter((m) => m.type === 'roundabout');
  const manualRoundOffset = (m: ManualJunction) =>
    m.lonlat ? round(projectOntoLine(cl.points, cl.offsetsM, m.lonlat).offsetM * scale, 1) : (m.frac ?? 0) * lengthM;

  const pairs: { off: number; m: ManualJunction; d: number }[] = [];
  for (const off of dedupedRings) {
    for (const m of manualRounds) {
      const d = Math.abs(manualRoundOffset(m) - off);
      if (d < 1500) pairs.push({ off, m, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const usedRing = new Set<number>();
  const usedManual = new Set<ManualJunction>();
  let rIdx = 0;
  for (const p of pairs) {
    if (usedRing.has(p.off) || usedManual.has(p.m)) continue;
    usedRing.add(p.off);
    usedManual.add(p.m);
    junctions.push({
      id: `${spec.id}-jx-r${++rIdx}`,
      name: p.m.name,
      offsetM: p.off,
      type: 'roundabout',
      throughSpeedKmh: 30,
      conflictingVph: p.m.conflictingVph ?? conflictFrom(p.off, 80),
      upgradable: p.m.upgradable,
    });
  }
  const droppedRings = dedupedRings.filter((o) => !usedRing.has(o));
  if (droppedRings.length) {
    console.log(`  dropped ${droppedRings.length} unmatched OSM rings @ km ${droppedRings.map((o) => (o / 1000).toFixed(1)).join(', ')}`);
  }

  // 5b. Manual junctions (signals, grade-separated, t-junctions; roundabouts only
  //     as a fallback when no OSM ring matched them above).
  let mIdx = 0;
  for (const m of spec.manualJunctions) {
    if (m.type === 'roundabout' && usedManual.has(m)) continue; // placed via OSM ring
    const off = round(
      m.lonlat ? projectOntoLine(cl.points, cl.offsetsM, m.lonlat).offsetM * scale : (m.frac ?? 0) * lengthM,
      1
    );
    const segLimit = segLimitAt(off);
    // conflicting flow from local AADT delta; grade-separated = 0 (no server);
    // signals meter more cross traffic so carry a higher floor (ASSUMPTION).
    const conflictingVph =
      m.conflictingVph ??
      (m.type === 'grade-separated' ? 0 : conflictFrom(off, m.type === 'signal' ? 300 : 80));
    junctions.push({
      id: `${spec.id}-jx-m${++mIdx}`,
      name: m.name,
      offsetM: Math.min(lengthM, Math.max(0, off)),
      type: m.type,
      throughSpeedKmh: m.throughSpeedKmh ?? throughSpeed(m.type, segLimit),
      conflictingVph,
      upgradable: m.upgradable,
    });
  }
  junctions.sort((a, b) => a.offsetM - b.offsetM);

  // 6. Stations -------------------------------------------------------------
  const stationMap = await fetchStations('stations-info2.json');
  const stations: CountStation[] = [];
  for (const id of spec.stationIds) {
    const st = stationMap.get(id);
    if (!st || !st.coord) {
      console.log(`  ! station ${id} missing coord — skipped`);
      continue;
    }
    const proj = projectOntoLine(cl.points, cl.offsetsM, st.coord);
    if (proj.distM > 5000) {
      console.log(`  ! station ${id} (${st.name}) projects ${(proj.distM / 1000).toFixed(1)} km off centerline — skipped`);
      continue;
    }
    stations.push({
      id,
      name: st.name,
      offsetM: round(Math.min(lengthM, proj.offsetM * scale), 1),
      hasSpeed: st.hasSpeed,
    });
  }
  stations.sort((a, b) => a.offsetM - b.offsetM);

  // 7. Demand ---------------------------------------------------------------
  // Reference segment = the one CONTAINING the reference offset (audit MAJOR-3;
  // the previous `mid >= target` skipped past short segments like the tunnel).
  const refOff = lengthM * spec.aadtRefFrac;
  const refSeg =
    segments.find((s) => s.fromM <= refOff && refOff < s.toM) ?? segments[Math.floor(segments.length / 2)];
  const demand = buildDemand(spec.id, refSeg.aadt2025, refSeg.sdu2025);

  const model: CorridorModel = {
    id: spec.id,
    name: spec.name,
    ref: spec.ref,
    lengthM,
    centerline,
    vertexOffsetsM,
    segments,
    junctions,
    stations,
  };
  return { model, demand, endpointDistM: { start: dStart, end: dEnd }, stretch: scale };
}

// ---------------------------------------------------------------------------
// Validation + human-readable summary
// ---------------------------------------------------------------------------
const LENGTH_BANDS: Record<string, [number, number]> = {
  // Bands reflect Vegagerðin authoritative chainage for the CONTRACTS-defined
  // corridor extents (suburban RVK end → destination). PLAN's "~74/57/47 km"
  // figures are measured from central Reykjavík and run a few km longer.
  north: [60, 80],
  south: [40, 58],
  kef: [34, 50],
};

function validate(res: BuildResult): string[] {
  const { model, demand, endpointDistM, stretch } = res;
  const errs: string[] = [];
  const S = model.segments;
  // Geometry integrity (audit MAJOR-1 / MINOR-7)
  if (endpointDistM.start > 500) errs.push(`start endpoint ${endpointDistM.start.toFixed(0)} m from anchor (>500)`);
  if (endpointDistM.end > 500) errs.push(`end endpoint ${endpointDistM.end.toFixed(0)} m from anchor (>500)`);
  if (stretch > 1.05 || stretch < 0.95) errs.push(`chainage/geodesic stretch ×${stretch.toFixed(3)} outside 0.95–1.05`);
  if (S.length < 8 || S.length > 20) errs.push(`segment count ${S.length} outside 8–20`);
  if (S[0].fromM !== 0) errs.push(`first segment fromM ${S[0].fromM} != 0`);
  if (Math.abs(S[S.length - 1].toM - model.lengthM) > 1) errs.push(`last segment toM ${S[S.length - 1].toM} != lengthM ${model.lengthM}`);
  for (let i = 1; i < S.length; i++) {
    if (Math.abs(S[i].fromM - S[i - 1].toM) > 1) errs.push(`gap between ${S[i - 1].id} and ${S[i].id}`);
  }
  for (const s of S) {
    if (s.toM <= s.fromM) errs.push(`${s.id} non-positive length`);
    if (s.aadt2025 <= 0) errs.push(`${s.id} AADT ${s.aadt2025} <= 0`);
    if ((s.config === 'S21F' || s.config === 'S21R' || s.config === 'D2') && !s.barrier && s.upgradeHint !== 'tunnel-bore-2')
      errs.push(`${s.id} divided config without barrier`);
  }
  const [lo, hi] = LENGTH_BANDS[model.id];
  const km = model.lengthM / 1000;
  if (km < lo || km > hi) errs.push(`length ${km.toFixed(1)} km outside band ${lo}–${hi}`);
  for (const j of model.junctions) {
    if (j.offsetM < 0 || j.offsetM > model.lengthM) errs.push(`junction ${j.id} offset out of range`);
  }
  for (const st of model.stations) {
    if (st.offsetM < 0 || st.offsetM > model.lengthM) errs.push(`station ${st.id} offset out of range`);
  }
  for (const [k, p] of Object.entries(demand.presets)) {
    if (!validateProfile(p)) errs.push(`demand preset ${k} shares do not sum to 1`);
  }
  return errs;
}

function printSummary(model: CorridorModel, demand: CorridorDemand): void {
  const aadts = model.segments.map((s) => s.aadt2025);
  console.log(
    `\n${model.name}  [${model.id}]  ref ${model.ref}  ${(model.lengthM / 1000).toFixed(1)} km  ` +
      `${model.segments.length} segments  ${model.junctions.length} junctions  ${model.stations.length} stations  ` +
      `AADT ${Math.min(...aadts).toLocaleString()}–${Math.max(...aadts).toLocaleString()}`
  );
  console.log('  # | from–to (km) | cfg  | v  | grd | AADT   | name');
  for (const s of model.segments) {
    console.log(
      `  ${s.id.slice(-2)}| ${(s.fromM / 1000).toFixed(1).padStart(5)}–${(s.toM / 1000).toFixed(1).padStart(5)} | ` +
        `${s.config.padEnd(4)} | ${String(s.maxspeedKmh).padStart(2)} | ${String(s.gradePct).padStart(3)} | ` +
        `${String(s.aadt2025).padStart(6)} | ${s.name}${s.upgradeHint ? `  [${s.upgradeHint}]` : ''}`
    );
  }
  console.log('  junctions: ' + model.junctions.map((j) => `${j.name.split(' ')[0]}@${(j.offsetM / 1000).toFixed(1)}(${j.type[0]},${j.conflictingVph})`).join('  '));
  console.log('  stations:  ' + model.stations.map((s) => `${s.name}@${(s.offsetM / 1000).toFixed(1)}${s.hasSpeed ? '*' : ''}`).join('  '));
  console.log(`  demand: aadtRef ${demand.aadtRef.toLocaleString()}  truckShare ${demand.truckShare}  ` +
    `dayFactor wk=${demand.presets.typicalWeekday.dayFactor} fri=${demand.presets.fridaySummer.dayFactor} sun=${demand.presets.sundayReturn.dayFactor}`);
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const demands: CorridorDemand[] = [];
  let anyError = false;

  for (const spec of CORRIDORS) {
    const res = await buildCorridor(spec);
    const { model, demand } = res;
    const errs = validate(res);
    printSummary(model, demand);
    if (errs.length) {
      anyError = true;
      console.log('  VALIDATION ERRORS:');
      for (const e of errs) console.log('    ✗ ' + e);
    } else {
      console.log('  ✓ validation passed');
    }
    fs.writeFileSync(path.join(DATA_DIR, `${spec.id}.corridor.json`), JSON.stringify(model, null, 2));
    demands.push(demand);
  }

  fs.writeFileSync(path.join(DATA_DIR, 'demand.json'), JSON.stringify(demands, null, 2));
  console.log(`\nWrote data/{north,south,kef}.corridor.json + data/demand.json`);
  if (anyError) {
    console.log('\n⚠ Completed WITH validation errors (see above).');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All corridors valid.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
