/**
 * Shared utilities for the corridor pipeline: cached HTTP, geometry math.
 * Node-only (fs, fetch). Not imported by the sim/econ libraries.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const CACHE_DIR = path.join(__dirname, 'cache');

export function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type LonLat = [number, number];

/** Read a cached JSON file if present. */
export function readCache<T>(name: string): T | null {
  const p = path.join(CACHE_DIR, name);
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  }
  return null;
}

export function writeCache(name: string, data: unknown): void {
  ensureCacheDir();
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data));
}

/**
 * Fetch JSON with on-disk caching. Re-runs are offline when the cache exists.
 * Retries on 406/429/504 (Overpass + ArcGIS burst limits) with backoff.
 */
export async function cachedJson(opts: {
  cacheName: string;
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  label?: string;
}): Promise<any> {
  const cached = readCache<any>(opts.cacheName);
  if (cached) {
    console.log(`  [cache] ${opts.label ?? opts.cacheName}`);
    return cached;
  }
  const retryCodes = new Set([406, 429, 500, 502, 503, 504]);
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`  [fetch] ${opts.label ?? opts.cacheName} (attempt ${attempt})`);
      const res = await fetch(opts.url, {
        method: opts.method ?? 'GET',
        body: opts.body,
        headers: {
          'User-Agent': 'umferd-traffic-sim-pipeline/1.0 (research; contact via repo)',
          ...(opts.headers ?? {}),
        },
      });
      if (!res.ok) {
        if (retryCodes.has(res.status) && attempt < maxAttempts) {
          const wait = 8000 * attempt;
          console.log(`    HTTP ${res.status}; retrying in ${wait / 1000}s`);
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${opts.url}`);
      }
      const json = await res.json();
      writeCache(opts.cacheName, json);
      return json;
    } catch (err) {
      if (attempt < maxAttempts) {
        const wait = 8000 * attempt;
        console.log(`    error ${(err as Error).message}; retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// Geometry (WGS84, meters via haversine)
// ---------------------------------------------------------------------------

const R = 6_371_008.8; // mean Earth radius, meters
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters between two [lon,lat] points. */
export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total polyline length in meters. */
export function polylineLengthM(pts: LonLat[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineM(pts[i - 1], pts[i]);
  return d;
}

/** Local planar approximation: meters east/north from a reference lon/lat. */
export function toLocalXY(p: LonLat, ref: LonLat): [number, number] {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(toRad(ref[1]));
  return [(p[0] - ref[0]) * mPerDegLon, (p[1] - ref[1]) * mPerDegLat];
}

/** Cumulative distance (m) at each vertex; [0]=0, same length as input. */
export function cumulativeOffsets(pts: LonLat[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + haversineM(pts[i - 1], pts[i]));
  return out;
}

/**
 * Project a point onto a polyline; returns the offset (m) along the line of the
 * nearest point and the perpendicular distance (m).
 */
export function projectOntoLine(
  pts: LonLat[],
  offsets: number[],
  p: LonLat
): { offsetM: number; distM: number } {
  let best = { offsetM: 0, distM: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ax = toLocalXY(a, p);
    const bx = toLocalXY(b, p);
    // p is origin in local frame
    const abx = bx[0] - ax[0];
    const aby = bx[1] - ax[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : (-ax[0] * abx + -ax[1] * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax[0] + t * abx;
    const cy = ax[1] + t * aby;
    const dist = Math.hypot(cx, cy);
    if (dist < best.distM) {
      const segLen = offsets[i] - offsets[i - 1];
      best = { offsetM: offsets[i - 1] + t * segLen, distM: dist };
    }
  }
  return best;
}

/** Interpolate the [lon,lat] at a given offset along the polyline. */
export function pointAtOffset(pts: LonLat[], offsets: number[], target: number): LonLat {
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

/** Minimum distance (m) from a point to a polyline. */
export function minDistToPolylineM(p: LonLat, pts: LonLat[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = toLocalXY(pts[i - 1], p);
    const b = toLocalXY(pts[i], p);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : (-a[0] * abx + -a[1] * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(a[0] + t * abx, a[1] + t * aby));
  }
  return best;
}

/** Densify so no gap exceeds maxGapM; preserves original vertices. */
export function densify(pts: LonLat[], maxGapM: number): LonLat[] {
  const out: LonLat[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = haversineM(a, b);
    if (d > maxGapM) {
      const n = Math.ceil(d / maxGapM);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    out.push(b);
  }
  return out;
}
