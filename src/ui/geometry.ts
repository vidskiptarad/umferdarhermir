import type { CorridorModel } from '@/types';

/**
 * Precomputed geometry for mapping 1-D sim offsets to lon/lat with a lateral
 * (lane) offset in meters. Normals point LEFT of the forward direction.
 */
export interface CorridorGeom {
  lon: Float64Array;
  lat: Float64Array;
  cum: Float64Array; // vertexOffsetsM
  nx: Float64Array; // normal, degrees-lon per meter lateral
  ny: Float64Array; // normal, degrees-lat per meter lateral
  lengthM: number;
}

const M_PER_DEG_LAT = 110_540;

export function buildGeom(model: CorridorModel): CorridorGeom {
  const n = model.centerline.length;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const cum = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = model.centerline[i][0];
    lat[i] = model.centerline[i][1];
    cum[i] = model.vertexOffsetsM[i];
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat[i] * Math.PI) / 180);
    // forward direction in meters
    const dxm = (lon[b] - lon[a]) * mPerDegLon;
    const dym = (lat[b] - lat[a]) * M_PER_DEG_LAT;
    const len = Math.hypot(dxm, dym) || 1;
    // left normal in meters: (-dy, dx)/len, converted back to degrees-per-meter
    nx[i] = -dym / len / mPerDegLon;
    ny[i] = dxm / len / M_PER_DEG_LAT;
  }
  return { lon, lat, cum, nx, ny, lengthM: model.lengthM };
}

/** Binary search: greatest index with cum[i] <= off. */
function findIdx(cum: Float64Array, off: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= off) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Writes [lon, lat] of the point at offsetM with lateral meters (positive = left of fwd). */
export function offsetToLonLat(
  g: CorridorGeom,
  offsetM: number,
  lateralM: number,
  out: [number, number],
): void {
  const off = Math.max(0, Math.min(g.lengthM, offsetM));
  const i = Math.min(findIdx(g.cum, off), g.cum.length - 2);
  const span = g.cum[i + 1] - g.cum[i] || 1;
  const t = (off - g.cum[i]) / span;
  const nxm = g.nx[i] + (g.nx[i + 1] - g.nx[i]) * t;
  const nym = g.ny[i] + (g.ny[i + 1] - g.ny[i]) * t;
  out[0] = g.lon[i] + (g.lon[i + 1] - g.lon[i]) * t + nxm * lateralM;
  out[1] = g.lat[i] + (g.lat[i + 1] - g.lat[i]) * t + nym * lateralM;
}

/** Slice the centerline polyline between two offsets (for per-segment path layers). */
export function slicePath(g: CorridorGeom, fromM: number, toM: number): [number, number][] {
  const pts: [number, number][] = [];
  const a: [number, number] = [0, 0];
  offsetToLonLat(g, fromM, 0, a);
  pts.push([a[0], a[1]]);
  const i0 = findIdx(g.cum, fromM);
  const i1 = findIdx(g.cum, toM);
  for (let i = i0 + 1; i <= i1; i++) pts.push([g.lon[i], g.lat[i]]);
  const b: [number, number] = [0, 0];
  offsetToLonLat(g, toM, 0, b);
  pts.push([b[0], b[1]]);
  return pts;
}

/**
 * Lateral lane offset (meters, positive = left of forward) for rendering.
 * dir 0 travels fwd, keeps right => negative lateral. dir 1 mirrored.
 * lane 1 = passing/oncoming lane (left of the vehicle's own direction).
 */
export function laneLateral(dir: number, lane: number, hasBarrier: boolean): number {
  const side = dir === 0 ? -1 : 1;
  const base = hasBarrier ? 6 : 3;
  if (lane === 0) return side * base;
  // passing lane: toward the centerline; for S1 overtaking it crosses to the other side
  return hasBarrier ? side * (base - 3.5) : -side * 3;
}
