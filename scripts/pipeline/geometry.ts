/**
 * Build a single ordered centerline from raw OSM ways.
 *
 * Strategy (research/05 §5):
 *  1. Filter out construction/proposed, roundabout ways, and link ramps.
 *  2. Forward-progress greedy chaining: start at the way endpoint nearest the
 *     Reykjavík anchor P0, then repeatedly append the nearest unused way whose
 *     travel direction keeps making forward progress. Because dual carriageways
 *     are antiparallel one-way pairs, the reverse carriageway of every dual
 *     section requires a ~180° reversal to enter and is therefore never chained
 *     — we naturally follow ONE continuous carriageway, which collapses each
 *     dual pair to a single centerline (the reverse twin is discarded).
 *  3. Trim the chained path between the projections of P0 and P1.
 *  4. Densify to <=50 m and compute cumulative vertex offsets.
 */
import {
  LonLat,
  haversineM,
  toLocalXY,
  densify,
  cumulativeOffsets,
  projectOntoLine,
  polylineLengthM,
} from './util';
import { OsmWay } from './sources';

export interface Centerline {
  points: LonLat[];
  offsetsM: number[];
  lengthM: number;
  /** ways used, in order, with the config-relevant tags — for optional cross-checks. */
  usedWayIds: number[];
}

const JOIN_TOL_M = 200; // max gap to consider two ways directly connected
const BRIDGE_TOL_M = 450; // max gap to bridge across an interchange (ramps filtered out)
// Direct joins (< TIGHT) are topologically connected — trust them through sharp
// fjord/hairpin bends. Only ambiguous joins get the anti-reversal filter, which
// keeps the greedy chain from hopping onto the antiparallel (reverse) carriageway.
const TIGHT_JOIN_M = 35;
const REVERSE_DOT = -0.55; // reject continuations that reverse by > ~123°
let DEBUG = process.env.PIPE_DEBUG === '1';

function dirVec(a: LonLat, b: LonLat): [number, number] {
  const v = toLocalXY(b, a);
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
}

function keepWay(w: OsmWay): boolean {
  const t = w.tags;
  if (t.highway === 'construction' || t.highway === 'proposed') return false;
  if (t.junction === 'roundabout') return false; // handled as junctions
  if (t.highway === 'trunk_link' || t.highway === 'motorway_link') return false; // ramps
  if (w.geometry.length < 2) return false;
  return true;
}

/**
 * Greedy forward-progress chain. Returns the ordered vertex list.
 */
export function chainWays(ways: OsmWay[], p0: LonLat, p1: LonLat): LonLat[] {
  const pool = ways.filter(keepWay).map((w) => ({ id: w.id, pts: w.geometry.slice() }));
  if (pool.length === 0) return [];

  const axis = dirVec(p0, p1); // straight-line heading toward the destination

  // Seed: among ways with an endpoint near P0, pick the orientation whose travel
  // direction aligns with the axis (so we head AWAY from Reykjavík, not back into it).
  let bestSeed = { idx: 0, flip: false, score: Infinity };
  pool.forEach((w, i) => {
    for (const flip of [false, true]) {
      const oriented = flip ? w.pts.slice().reverse() : w.pts;
      const startDist = haversineM(oriented[0], p0);
      if (startDist > 3000) continue;
      const d = dirVec(oriented[0], oriented[1] ?? oriented[0]);
      const dot = axis[0] * d[0] + axis[1] * d[1];
      if (dot < 0.2) continue; // must head toward destination
      const score = startDist - dot * 400;
      if (score < bestSeed.score) bestSeed = { idx: i, flip, score };
    }
  });

  const used = new Set<number>();
  const seed = pool[bestSeed.idx];
  let path: LonLat[] = bestSeed.flip ? seed.pts.slice().reverse() : seed.pts.slice();
  used.add(seed.id);

  const findNext = (tail: LonLat, tailDir: [number, number], tol: number) => {
    let best: { i: number; flip: boolean; score: number } | null = null;
    pool.forEach((w, i) => {
      if (used.has(w.id)) return;
      const dStart = haversineM(w.pts[0], tail);
      const dEnd = haversineM(w.pts[w.pts.length - 1], tail);
      const flip = dEnd < dStart;
      const joinD = Math.min(dStart, dEnd);
      if (joinD > tol) return;
      const oriented = flip ? w.pts.slice().reverse() : w.pts;
      const wDir = dirVec(oriented[0], oriented[1] ?? oriented[0]);
      const dot = tailDir[0] * wDir[0] + tailDir[1] * wDir[1];
      // Trust tight topological joins through sharp bends; filter only looser ones.
      if (joinD > TIGHT_JOIN_M && dot < REVERSE_DOT) return;
      const score = joinD - dot * 15;
      if (!best || score < best.score) best = { i, flip, score };
    });
    return best;
  };

  while (true) {
    const tail = path[path.length - 1];
    const tailDir = dirVec(path[Math.max(0, path.length - 2)], tail);
    // Prefer a tight direct join; fall back to a wider bridge across an interchange.
    let best = findNext(tail, tailDir, JOIN_TOL_M) ?? findNext(tail, tailDir, BRIDGE_TOL_M);
    if (!best) {
      if (DEBUG) {
        let nearest = Infinity;
        pool.forEach((w) => {
          if (used.has(w.id)) return;
          nearest = Math.min(
            nearest,
            haversineM(w.pts[0], tail),
            haversineM(w.pts[w.pts.length - 1], tail)
          );
        });
        console.log(
          `    [chain stop] at [${tail.map((n) => n.toFixed(4))}] used=${used.size}/${pool.length} nearestUnused=${nearest.toFixed(0)}m`
        );
      }
      break;
    }
    const b = best as { i: number; flip: boolean; score: number };
    const w = pool[b.i];
    const oriented = b.flip ? w.pts.slice().reverse() : w.pts;
    path = path.concat(haversineM(path[path.length - 1], oriented[0]) < 1 ? oriented.slice(1) : oriented);
    used.add(w.id);
  }

  return path;
}

/**
 * Chain, trim to [P0..P1], densify, and compute offsets.
 */
export function buildCenterline(
  ways: OsmWay[],
  p0: LonLat,
  p1: LonLat,
  maxGapM = 50
): Centerline {
  const chained = chainWays(ways, p0, p1);
  if (chained.length < 2) throw new Error('chaining produced < 2 vertices');

  // Trim between projections of P0 and P1.
  const rawOffsets = cumulativeOffsets(chained);
  const projA = projectOntoLine(chained, rawOffsets, p0);
  const projB = projectOntoLine(chained, rawOffsets, p1);
  let lo = Math.min(projA.offsetM, projB.offsetM);
  let hi = Math.max(projA.offsetM, projB.offsetM);

  const trimmed: LonLat[] = [];
  // include the exact interpolated endpoints
  const inRange = (o: number) => o > lo + 1 && o < hi - 1;
  // start point
  trimmed.push(interp(chained, rawOffsets, lo));
  for (let i = 0; i < chained.length; i++) {
    if (inRange(rawOffsets[i])) trimmed.push(chained[i]);
  }
  trimmed.push(interp(chained, rawOffsets, hi));

  // The chain can stop short of an anchor (e.g. the Borgarnes roundabout rings are
  // filtered from the pool, leaving a gap to the Rte 54 endpoint). Append a short
  // straight connector so the line visually reaches the corridor endpoint
  // (densify below keeps vertex spacing ≤ maxGapM). trimmed[] runs lo→hi along the
  // chain, which is seeded at P0, so index 0 is the Reykjavík end.
  if (haversineM(trimmed[0], p0) > 150) trimmed.unshift(p0);
  if (haversineM(trimmed[trimmed.length - 1], p1) > 150) trimmed.push(p1);

  const dense = densify(trimmed, maxGapM);
  const offsetsM = cumulativeOffsets(dense);
  return {
    points: dense,
    offsetsM,
    lengthM: offsetsM[offsetsM.length - 1],
    usedWayIds: [],
  };
}

function interp(pts: LonLat[], offsets: number[], target: number): LonLat {
  if (target <= 0) return pts[0];
  if (target >= offsets[offsets.length - 1]) return pts[pts.length - 1];
  for (let i = 1; i < pts.length; i++) {
    if (offsets[i] >= target) {
      const segLen = offsets[i] - offsets[i - 1];
      const t = segLen === 0 ? 0 : (target - offsets[i - 1]) / segLen;
      return [
        pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
        pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]),
      ];
    }
  }
  return pts[pts.length - 1];
}

/**
 * Extract distinct roundabouts from OSM (junction=roundabout ways), returning one
 * centroid per roundabout (ways forming the same circle are clustered).
 */
export function extractRoundabouts(ways: OsmWay[]): LonLat[] {
  const rings = ways.filter((w) => w.tags.junction === 'roundabout' && w.geometry.length >= 2);
  const centroids: LonLat[] = rings.map((w) => {
    let x = 0;
    let y = 0;
    for (const g of w.geometry) {
      x += g[0];
      y += g[1];
    }
    return [x / w.geometry.length, y / w.geometry.length];
  });
  // Cluster centroids within 120 m of each other.
  const clusters: LonLat[] = [];
  for (const c of centroids) {
    const near = clusters.find((k) => haversineM(k, c) < 120);
    if (!near) clusters.push(c);
  }
  return clusters;
}

export { polylineLengthM };
