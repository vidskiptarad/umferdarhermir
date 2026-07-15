# Corridor data pipeline

Builds the three `data/<id>.corridor.json` models + `data/demand.json` consumed by
the sim engine, economics layer, and UI (schema: `src/types.ts`, semantics:
`CONTRACTS.md`).

```bash
npm run pipeline        # fetch (or reuse cache) → build → validate → write data/
```

The first run hits three public APIs; every response is cached under `cache/`, so
subsequent runs are **fully offline and deterministic**. Delete a `cache/*.json`
to force a re-fetch of that source.

## How it works

`build-corridors.ts` orchestrates, per corridor (`corridors.ts` holds the specs):

1. **Geometry — OpenStreetMap via Overpass** (`sources.ts`, `geometry.ts`).
   Tested queries from `research/05`: `way["ref"=…]["highway"](bbox); out tags geom`.
   Requests are serialized ≥10 s apart with a User-Agent (Overpass 406s without one)
   and retried on 406/429/5xx. Ways are stitched into one ordered path by
   **forward-progress greedy chaining**: start at the Reykjavík-end anchor, always
   append the nearest way that keeps heading toward the destination. Because dual
   carriageways are antiparallel one-way pairs, the reverse carriageway needs a
   ~180° turn to enter and is never chained — so we naturally follow **one**
   continuous carriageway, which is how the pipeline collapses each dual section to
   a single centerline. `construction`/`proposed` ways, roundabout rings, and link
   ramps are filtered out. The path is trimmed to the corridor endpoints, densified
   to ≤44 m, and cumulative offsets computed.

2. **Traffic counts + authoritative length — Vegagerðin ArcGIS** (`research/01`).
   `data/slysumferd/MapServer/{8,9,10}` (ÁDU/SDU/VDU, `AR=2025`, `f=geojson`,
   `outSR=4326`) as polylines. Two uses:
   - **Length calibration.** The official section chainage (`UPPH_STOD`/
     `ENDA_STOD`) of the corridor's `NRKAFLI` sections gives the authoritative
     length; the OSM offset axis is linearly scaled onto it (`research/05 §5.5`
     "anchor to official chainage"). Boundary sections that extend past the
     corridor anchors (Reykjanesbraut section 14 north of Lækjargata; Selfoss d5
     east of the Ölfusá bridge) are weighted by the fraction of their polyline
     lying on the corridor (<300 m from the centerline). Resulting stretch
     factors are ×0.99–×1.01. The WGS84 **shape** stays pure OSM; only
     `lengthM`/`vertexOffsetsM` are calibrated.
   - **Per-segment AADT.** Each segment samples the nearest count polyline at 5
     evenly spaced points along its span and takes the **median**, so long
     segments spanning several Vegagerðin sections reflect their span (e.g. the
     KEF airport approach reads section 22's 13,000 rather than a single-midpoint
     neighbor value) → `aadt2025`/`sdu2025`/`vdu2025`.

3. **Segmentation — `research/02` ground truth (manual overrides).** OSM tags are
   *not* authoritative for operating config (`research/05 §1`: no `overtaking` tag;
   2+2 roadbeds striped as 2+1 read as `lanes=3`/dual). So the segment table in
   `corridors.ts` is transcribed from `research/02` (config, limit, grade,
   upgradability), each row citing its source, and cross-referenced to Vegagerðin
   sections for length. Segment `approxKm` values are normalized to tile
   `[0, lengthM]` exactly.

4. **Junctions.** Roundabouts are extracted from OSM `junction=roundabout` rings
   (clustered, projected onto the centerline, kept only if ≤90 m off it), then
   **match-only filtered**: a ring becomes a junction only if it pairs (greedy
   one-to-one, nearest first, ≤1.5 km) with a roundabout in the research-sourced
   manual list; unmatched rings are interchange-ramp/side-road artifacts and are
   dropped (the build log lists them). Manual roundabouts with no OSM ring are
   placed from their own coordinates. Signals (Hafnarfjörður), grade-separated
   interchanges (incl. Straumsvík, whose roundabout sits on a bridge OVER the
   mainline), and staggered-T side roads come from the manual table.
   `conflictingVph` is estimated from the local AADT delta between the Vegagerðin
   sections straddling the node (±300 m) × a 10 % peak-hour fraction — marked
   `ASSUMPTION`. `throughSpeedKmh`: roundabout 30, signal 20, t-junction =
   segment limit (mainline priority), grade-separated = segment limit.

5. **Stations.** `data/info/MapServer/2` (live counters) fetched once; each
   corridor's `IDSTOD`s (from `research/01 §1`) are projected onto the centerline.
   Stations that project >5 km off (east-of-Selfoss / pre-Hafnarfjörður counters not
   on the corridor) are skipped. `hasSpeed` = `MEDALHRADI` reported.

6. **Demand** (`demand.ts`). Hour-of-day shapes are **constructed** (Vegagerðin
   publishes none): weekday commuter double-hump (AM peak toward Rvk = rev, PM peak
   fwd), Friday-summer PM-outbound hump, Sunday-return PM-inbound hump, KEF flatter +
   early airport bump. `dayFactor` = SDU/AADT × {1.15 Fri, 1.10 Sun} per CONTRACTS.
   Truck share 0.10 rural / 0.06 KEF (ASSUMPTION — `research/01` flags the gap).

## Provenance: sourced vs assumed

| Field | Source |
|---|---|
| centerline shape, junction/roundabout positions | OSM (Overpass), live |
| `lengthM`, vertex offsets | Vegagerðin section chainage (authoritative), live |
| `aadt2025` / `sdu2025` / `vdu2025` | Vegagerðin slysumferd 8/9/10, 2025, live |
| station offsets, `hasSpeed` | Vegagerðin info/2 (live counters), live |
| `config`, `maxspeedKmh`, `upgradable`, `upgradeHint`, `barrier` | `research/02` (manual) |
| `gradePct` | manual table (`research/02`/`05`): tunnel ±8.1, Kambar −6, Bolaöldur +4, Ártúnsbrekka +3, else 0 — **ASSUMPTION** on placement |
| `conflictingVph` | AADT-delta estimate — **ASSUMPTION** |
| demand hour shapes, truck share | constructed — **ASSUMPTION** |

## Notes for downstream builders

- **Corridor lengths** are Vegagerðin-authoritative for the CONTRACTS-defined
  extents (suburban RVK end → destination): north **67.8 km** (Ártún → Borgarnes
  Rte 54 roundabout), south **47.4 km** (Ártún → Ölfusá bridge west approach),
  kef **39.6 km** (Lækjargata → KEF terminal junction). PLAN's "~74/57/47 km" are
  measured from *central* Reykjavík and run a few km longer — the free-flow time
  targets in `research/06` should be read against these lengths.
- Corridor endpoints land on the anchors (≤30 m); the chainage/geodesic stretch is
  validated to within ±5 % (actual ×0.99–×1.01).
- Directions per CONTRACTS: **0 = away from Reykjavík**, 1 = toward. Offsets run 0
  (Rvk end) → `lengthM`.
- The Hvalfjörður tunnel's 3-lane north climb is `config: S21F` with
  `barrier: false` (single bore, documented exception to the "S21* ⇒ barrier" rule).
- `cache/` is git-ignored (raw API dumps, ~14 MB; ref=1 count layers cover the whole
  ring road). First build needs network; thereafter offline.
