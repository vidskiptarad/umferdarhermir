# GIS / Geometry Data Acquisition for an Icelandic Corridor Traffic Simulator

Research date 2026-07-12. Every endpoint below was fetched or queried live.

## TL;DR recommendation

- **Geometry + attributes → OpenStreetMap via Overpass.** Icelandic trunk-road coverage is excellent: `lanes`, `maxspeed`, `oneway` present on ~97% of ways; 2+1 sections correctly tagged (`lanes=3` + `lanes:forward/backward`); 2+2 dual carriageways = paired `oneway=yes` ways.
- **Official chainage / road registry → Vegagerðin ArcGIS REST** (`vegasja.vegagerdin.is`): road number `NRVEGUR`, section chainage `KAFLISTODUPPHAF/ENDIR`, stöðvar point layers at 500/100/20 m. NO speed-limit or lane fields — those come from OSM.
- **Elevation → ÍslandsDEM 10 m** (<2 m xy, <0.5 m z), CC-BY.
- **Rendering → MapLibre GL JS + OpenFreeMap vector tiles (no key, no limit) + deck.gl `TripsLayer`** for thousands of GPU-animated vehicles via a single `currentTime` prop.

---

## 1. OpenStreetMap coverage + tested Overpass queries

### Route 1 Reykjavík–Borgarnes — TESTED (HTTP 200, 283 KB, 313 ways)

```overpassql
[out:json][timeout:60];
area["ISO3166-1"="IS"][admin_level=2]->.is;
way["ref"="1"]["highway"](area.is)(64.05,-22.9,64.65,-21.5);
out tags geom;
```

Tag coverage (of 313 ways): highway 313, name 313, ref 313, surface 305, **lanes 303**, **maxspeed 303**, oneway 301, turn:lanes 16, junction=roundabout 15, bridge 14.

Value distributions:
- `maxspeed`: 90→130, 80→71, 70→54, 50→45, 30→3, none→10 (all numeric)
- `lanes`: 2→179, 1→103, **3→21**, none→10
- `oneway`: no→95, **yes→206**, none→12
- `highway`: trunk→296, trunk_link→4, construction→10, proposed→3
- `overtaking`: **not tagged anywhere (0)** — passing zones must be inferred
- `dual_carriageway`: not used (0) — detect dual sections via antiparallel oneway pairs

Config detection:
- **2+2 dual**: two separate `oneway=yes` ways, same ref, antiparallel.
- **2+1 (Kjalarnes)**: e.g. `{lanes:'3', lanes:backward:'1', lanes:forward:'2', maxspeed:'70', name:'Vesturlandsvegur', oneway:'no'}` — direction split flips as passing lane alternates.
- **1+1**: trunk, lanes=2, oneway=no, maxspeed=90.
- Filter out `construction`/`proposed` ways (the ongoing upgrades).

### Route 41 — TESTED (HTTP 200, 181 KB, 198 ways)

```overpassql
[out:json][timeout:60];
way["ref"="41"]["highway"](63.95,-22.75,64.15,-21.85);
out tags geom;
```

- `maxspeed`: 90→40, 80→44, 70→32, 60→73, 50→6, none→3
- `lanes`: 2→146, 3→19, 1→25, 4→8
- `oneway`: **yes→183**, no→7 — confirms near-total 2+2 build-out
- junction=roundabout→6; maxheight=4.2→21 (grade-separated underpasses = junction markers)

### Route 1 Reykjavík–Selfoss

Same tagging scheme; use bbox ~(63.9,-21.9,64.15,-21.0).

**Overpass ops note:** overpass-api.de returns intermittent 406/504 under bursts — space requests ~10 s, tight bboxes, retry. `POST https://overpass-api.de/api/interpreter` with `data=<query>`.

---

## 2. Vegagerðin open GIS — TESTED

**ArcGIS REST root:** https://vegasja.vegagerdin.is/arcgis/rest/services (ArcGIS 10.91, public, no key). Folders: appfaerd, **data**, grunnkort, mau, prufa, Utilities, vegakerfi.

**Road registry:** https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer

| ID | Layer | Geometry | Meaning |
|---|---|---|---|
| 0 | Jarðgöng | polyline | tunnels |
| 2/3/4 | Stöðvar 500/100/20 m | point | chainage posts |
| 6 | **Vegir** | polyline | road centerlines (registry) |
| 7 | Vegflokkar | polyline | road classes |
| 14 | Akbrautir og rampar | polyline | carriageways & ramps |

Layer 6 fields: `NRVEGUR` (road number), `NRKAFLI`, `KAFLIVEGURHEITI`, `KAFLIHEITIUPPHAF/ENDIR`, `KAFLILENGD` (m), **`KAFLISTODUPPHAF/ENDIR`** (chainage m), `VEGFLOKKUR`, `VEGTEGUND`, `STEFNA`, dates. maxRecordCount 1000.

Live query proof: `/6/query?where=NRVEGUR='1'&outFields=...&returnGeometry=false&f=json` → 166 features, e.g. `{NRVEGUR:'1', KAFLIVEGURHEITI:'Hringvegur', KAFLISTODUPPHAF:0, KAFLISTODENDIR:2380, ...}`.

**Critical:** registry has chainage/class/names/geometry but NO speed or lanes — join with OSM.

Other `data/` services: `slitlag` (pavement), `faerd` (live road conditions — FeatureServer), `bryr` (bridges), **`slysumferd` (accidents)**, `yfirbordsmerkingar` (road markings). Pattern: `{layer}/query?where=<SQL>&outFields=*&f=geojson&outSR=4326` (native CRS is ISN93 / EPSG:3057).

LMÍ catalog: https://gatt.lmi.is/geonetwork/srv/search?type=dataset

---

## 3. Elevation — ÍslandsDEM

**ÍslandsDEM v1.0** (LMÍ + Polar Geospatial Center, from ArcticDEM). CC BY 4.0.
- 10 m resolution; accuracy <2 m xy, <0.5 m z. CRS ISN93 (EPSG:3057).
- Download: http://atlas.lmi.is/mapview/?application=DEM (Gögn → Sækja gögn), GeoTIFF tiles.
- Google Earth Engine: `projects/ee-landmaelingar/assets/IslandsDEMv1_10m_isn93`.
- Grades matter: Ártúnsbrekka, Hellisheiði/Kambar (~380 m summit), Route 41 undulations → truck speed model. Densify polyline to ~10–20 m, sample z, differentiate → grade % per segment.

---

## 4. Map rendering

| Provider | Key? | Limit | Notes |
|---|---|---|---|
| **OpenFreeMap** | No | None | Best default; self-hostable |
| **Protomaps** | No | self-served | Single Iceland-clipped `.pmtiles` on static host — leanest |
| MapTiler Cloud | Yes | 100k loads/mo free | keyed, metered |

- Corridor = GeoJSON LineString source, data-driven `line-color` by `segment_type`; per-segment features + feature-state for hover/click.
- **Vehicles: deck.gl over MapLibre** via `MapboxOverlay` (interleaved). Do NOT rebuild ScatterplotLayer data every frame. **Use `TripsLayer`**: `getPath` + `getTimestamps` once, update single `currentTime` prop per frame — GPU interpolates all vehicles (docs cite ~30,000 vehicles). ScatterplotLayer scales to ~1M static points.

---

## 5. Pipeline: raw geometry → clean 1-D corridor model

Tooling: **custom TypeScript/Node script over Turf.js** (not osmnx — this is a linear-referencing problem, not a routing-graph problem).

1. **Fetch** via Overpass (`out tags geom`), filter `construction|proposed`.
2. **Stitch** ways into one directed path (chain by shared endpoints; sort along corridor axis).
3. **Collapse dual carriageways**: antiparallel `oneway=yes` pairs (<~40 m apart) → synthesize single centerline; tag `config="2+2"`; keep back-refs to both OSM ways for true dual rendering.
4. **Linear-reference**: cumulative distance (`turf.length`) → `offset_m` per vertex.
5. **Anchor to official chainage**: snap to Vegagerðin `Vegir` sections (`KAFLISTODUPPHAF/ENDIR`); pull Stöðvar 500 m points as markers.
6. **Cut segments** at changes in `lanes`, `maxspeed`, `config`, `surface`, bridge/tunnel.
7. **Mark junctions**: roundabout ways, trunk_link ramps, maxheight underpasses → point features with `offset_m`.

Output schema:
```
Corridor {
  id, name, ref, length_m,
  centerline: LineString (WGS84),
  segments: [{ from_m, to_m, lanes, maxspeed, config, grade_pct, passing }],
  junctions: [{ offset_m, type, name }],
  chainage: [{ offset_m, station_m }]
}
```

## Endpoint quick-reference (verified live 2026-07-12)

- Overpass: `POST https://overpass-api.de/api/interpreter`
- Vegagerðin REST: https://vegasja.vegagerdin.is/arcgis/rest/services → `data/vegakerfi/MapServer`
- Viewer: https://geoportal.vegagerdin.is/
- ÍslandsDEM: http://atlas.lmi.is/mapview/?application=DEM · GEE `projects/ee-landmaelingar/assets/IslandsDEMv1_10m_isn93`
- Tiles: openfreemap.org (no key) · protomaps.com (pmtiles)
- Animation: deck.gl TripsLayer via @deck.gl/mapbox MapboxOverlay on MapLibre

Caveats: Overpass rate-limits bursts; OSM lacks `overtaking` tags (infer passing zones); Vegagerðin registry lacks speed/lanes; ÍslandsDEM is EPSG:3057 (reproject).
