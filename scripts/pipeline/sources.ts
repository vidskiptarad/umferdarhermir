/**
 * Remote data sources for the pipeline, all cached to scripts/pipeline/cache/.
 *  - OpenStreetMap geometry via Overpass  (research/05 §1, tested queries)
 *  - Vegagerðin annual ÁDU/SDU/VDU polylines via ArcGIS  (research/01 §2, layers 8/9/10)
 *  - Vegagerðin live count stations via ArcGIS  (research/01 §1, info/MapServer/2)
 */
import { cachedJson, readCache, sleep, LonLat } from './util';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const ARC_ROOT = 'https://vegasja.vegagerdin.is/arcgis/rest/services';

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: LonLat[]; // [lon,lat]
}

/** Serialize Overpass requests ~10 s apart to avoid 429/504 bursts (research/05). */
let lastOverpass = 0;
async function throttleOverpass() {
  const since = Date.now() - lastOverpass;
  if (lastOverpass && since < 10_000) await sleep(10_000 - since);
  lastOverpass = Date.now();
}

/**
 * Fetch trunk-road ways for a road ref within a bbox.
 * bbox = [south, west, north, east] (lat/lon), matching research/05 query form.
 */
export async function fetchOsmWays(
  ref: string,
  bbox: [number, number, number, number],
  cacheName: string
): Promise<OsmWay[]> {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:90];way["ref"="${ref}"]["highway"](${s},${w},${n},${e});out tags geom;`;
  const preCached = !!readCache(cacheName);
  if (!preCached) await throttleOverpass();
  const json = await cachedJson({
    cacheName,
    url: OVERPASS,
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'umferd-traffic-sim-pipeline/1.0 (research; contact via repo)',
    },
    label: `Overpass ref=${ref}`,
  });
  const ways: OsmWay[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !el.geometry) continue;
    ways.push({
      id: el.id,
      tags: el.tags ?? {},
      geometry: el.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat] as LonLat),
    });
  }
  return ways;
}

export interface AaduFeature {
  nrkafli: string;
  upph: number; // chainage start (m)
  enda: number; // chainage end (m)
  adu: number;
  sdu: number;
  vdu: number;
  // Flattened list of vertices across all polyline parts, for nearest-point matching.
  points: LonLat[];
}

/**
 * Fetch a Vegagerðin annual-average polyline layer (8=ÁDU, 9=SDU, 10=VDU) for a
 * road ref, year 2025, as GeoJSON in WGS84. Layer 8 already carries ADU/SDU/VDU,
 * so we read all three from whichever layer(s) we fetch.
 */
export async function fetchAadu(ref: string, layer: number, cacheName: string): Promise<AaduFeature[]> {
  const url =
    `${ARC_ROOT}/data/slysumferd/MapServer/${layer}/query` +
    `?where=${encodeURIComponent(`NRVEGUR='${ref}' AND AR=2025`)}` +
    `&outFields=NRKAFLI,UPPH_STOD,ENDA_STOD,ADU,SDU,VDU,AR&returnGeometry=true&outSR=4326&f=geojson`;
  const json = await cachedJson({ cacheName, url, label: `ÁDU layer ${layer} ref=${ref}` });
  const feats: AaduFeature[] = [];
  for (const f of json.features ?? []) {
    const props = f.properties ?? {};
    const geom = f.geometry;
    if (!geom) continue;
    const points: LonLat[] = [];
    if (geom.type === 'LineString') {
      for (const c of geom.coordinates) points.push([c[0], c[1]]);
    } else if (geom.type === 'MultiLineString') {
      for (const part of geom.coordinates) for (const c of part) points.push([c[0], c[1]]);
    }
    if (points.length === 0) continue;
    feats.push({
      nrkafli: props.NRKAFLI ?? '',
      upph: props.UPPH_STOD ?? 0,
      enda: props.ENDA_STOD ?? 0,
      adu: props.ADU ?? 0,
      sdu: props.SDU ?? 0,
      vdu: props.VDU ?? 0,
      points,
    });
  }
  return feats;
}

export interface LiveStation {
  idstod: string;
  name: string;
  coord: LonLat | null; // averaged over the station's direction rows
  hasSpeed: boolean;
}

/** Fetch every live count station once (info/MapServer/2), grouped by IDSTOD. */
export async function fetchStations(cacheName: string): Promise<Map<string, LiveStation>> {
  const url =
    `${ARC_ROOT}/data/info/MapServer/2/query` +
    `?where=1=1&outFields=IDSTOD,NAFN,STEFNA_TXT,MEDALHRADI&returnGeometry=true&outSR=4326&f=geojson`;
  const json = await cachedJson({ cacheName, url, label: 'live stations info/2' });
  const byId = new Map<string, { name: string; xs: number[]; ys: number[]; speed: boolean }>();
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    const g = f.geometry;
    const id = String(p.IDSTOD);
    if (!byId.has(id)) byId.set(id, { name: p.NAFN ?? id, xs: [], ys: [], speed: false });
    const rec = byId.get(id)!;
    if (g && g.type === 'Point' && Array.isArray(g.coordinates)) {
      rec.xs.push(g.coordinates[0]);
      rec.ys.push(g.coordinates[1]);
    }
    if (p.MEDALHRADI && Number(p.MEDALHRADI) > 0) rec.speed = true;
  }
  const out = new Map<string, LiveStation>();
  for (const [id, rec] of byId) {
    const coord: LonLat | null =
      rec.xs.length > 0
        ? [rec.xs.reduce((a, b) => a + b, 0) / rec.xs.length, rec.ys.reduce((a, b) => a + b, 0) / rec.ys.length]
        : null;
    out.set(id, { idstod: id, name: rec.name, coord, hasSpeed: rec.speed });
  }
  return out;
}
