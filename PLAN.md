# Umferð — Icelandic corridor traffic simulator

A visually compelling web app that simulates every driver on three corridors out of Reykjavík — north (Borgarnes), south/east (Selfoss), west (KEF) — calibrated to real Vegagerðin data, and lets you flip segments to 2+2 / raise limits to 110 km/h to see travel-time and ISK effects. **Benefits only, no construction cost estimates.** Time savings + safety (accidents/injuries/deaths avoided) are both monetized benefits.

## Decisions (2026-07-12)

1. **Safety benefits included** — accidents, injuries, deaths avoided are part of the model (per-accident costs from Kostnaður umferðarslysa, 2026-adjusted).
2. **110 km/h callout** — Vegagerðin's obstacle-free-zone requirement (~14–18 m each side) blocks 110 everywhere; the app carries a sourced callout showing Nordic roads run 110–120 without such zones (research/07). Umferðarlög §37 already permits 110 on divided roads — this is policy, not law.
3. **Hvalfjarðargöng II is a toggle** — a second bore giving 2+2 through the fjord (+ optionally >70 km/h) is a first-class scenario lever.
4. **Fixed demand in v1** — induced demand handled by growth slider + rule-of-half note, not microsimulated.
5. **Full actor model** — every vehicle simulated. No BPR/macroscopic shortcut; the 1+1 pain mechanism (slow driver + no overtaking gaps) requires it.
6. **Visually compelling is a core requirement** — real map of SW Iceland, live animated simulation, segment coloring by current average speed. Not a spreadsheet with a map attached.

## Corridors & baseline (research/02, /01)

| Corridor | Length | Today | AADT 2025 range | Key upgradeable segments |
|---|---|---|---|---|
| Rvk–Borgarnes | ~74 km | 2+2 to Mosfellsbær, 2+1 Kjalarnes, **1+1 rest incl. 40 km Hvalfjörður–Borgarnes**, tunnel 1+1 @70 | 5,400–60,000 | Kjalarnes→2+2, tunnel II, Hvalfjörður–Borgarnes→2+2 |
| Rvk–Selfoss | ~57 km | continuous 2+1/2+2 separation since 2023 (Ölfus roadbed is 2+2 striped as 2+1) | 6,300–24,000 | Hellisheiði 2+1→2+2, Ölfus 4th lane, 90→110 |
| Rvk–KEF | ~47 km | full 2+2 since Dec 2025, 90 km/h | 13,000–72,000 | 90→110 (+ Hafnarfjörður grade separation) |

## Architecture

```
umferd/
  data/                 # pipeline output: corridor JSON models (committed)
  pipeline/             # TS scripts: OSM Overpass + Vegagerðin ArcGIS + ÍslandsDEM → corridor models
  sim/                  # pure TS engine (no DOM): IIDM + overtaking + MOBIL + junction nodes
    engine/             # ballistic integrator, SoA Float32Arrays, worker entry
    calibrate/          # CLI harness: run scenarios headless, compare to targets
  web/                  # Next.js app (Vercel): MapLibre + deck.gl + charts + scenario panel
  research/             # the six research reports (sources of truth for all parameters)
```

### Simulation engine (research/04)

- **Corridor = 1-D world**: ordered segments `{from_m, to_m, lanes, config, maxspeed, grade_pct, passing}` + junction nodes (roundabout/light/interchange as gap-acceptance capacity servers, t_c≈4.5s, t_f≈2.8s + queue). Both directions simulated simultaneously (overtaking needs the oncoming stream).
- **Car-following: IIDM** (Improved IDM), ballistic update, Δt=0.25 s. Cars: T=1.3s, a=1.2, b=1.8, s0=2. Trucks: a=0.4, longer, slower.
- **Desired speeds (Icelandic, measured)**: cars `v0 ~ N(92, 8) km/h` truncated [70,120]; trucks `N(83, 5)`; ~5–8% slow tail <80. Per-segment modulation by curvature/limit (V85 data per station in research/06). Under 110 limit: shift distribution up (Nordic evidence on mean-speed response, ~+x km/h per +10 limit — calibrate).
- **Overtaking on 1+1**: gap-acceptance vs oncoming stream, `g_required(Δv) ≈ 6 + 120/Δv_kmh` s, sight-distance capped, evaluated every ~5 steps. This produces the platoons.
- **2+1/2+2: MOBIL** (p=0.35, b_safe=4, Δa_th=0.2, keep-right 0.2).
- **Demand**: per-direction hourly injection from real profiles. Hour-of-day curves built by polling the live feed (`UMF_M1..M7` + `UMF_15MIN` accumulation — see data plan); scaled to segment AADT/SDU/VDU. Presets: typical weekday, Friday summer peak, Sunday return, "right now" (live feed).
- **Runtime**: Web Worker, SoA Float32Arrays, transferable position buffers. 24h day ≈ seconds-to-tens-of-seconds; also real-time playback mode at adjustable speed.

### Live data (research/01)

- **Live**: `vegasja.vegagerdin.is/arcgis/rest/services/data/info/MapServer/2` — 15-min counts, today cumulative, avg speed, last-7-days daily totals, per direction. No key, open CORS. Station IDs per corridor documented.
- **Annual**: `data/slysumferd/MapServer/8-10` (ÁDU/SDU/VDU 2025 per section) + Excel archive 2000–2025.
- **Profile collection**: small cron (Vercel) polling the live feed every 15 min into a store → empirical hour-of-day × day-of-week curves per station. Until enough history: capital-area model temporal factors + SDU/VDU ratios.

### Visual design (core requirement)

- **Real map of SW Iceland**: MapLibre GL, Protomaps Iceland-clipped pmtiles (or OpenFreeMap fallback), muted dark basemap so the corridors glow.
- **Live simulation view**: deck.gl `TripsLayer` over MapLibre (interleaved) — thousands of GPU-animated vehicle dots moving along real geometry; single `currentTime` prop per frame. Trucks visually distinct; platoons visible by eye.
- **Segment speed heat**: corridor line colored by current average speed (rolling window) — green ≥ limit … red at crawl — updating live as the sim runs. Toggle between "current speed" and "config" coloring.
- **Scenario editing on the map**: click/drag-select segments → flip config (1+1 → 2+1 → 2+2, tunnel II, 90 → 110). Before/after side-by-side or A/B sweep.
- **Results panel**: travel-time distributions (median/p85/worst) per corridor+direction, delay vs free-flow, time-lost heatmap by segment, and the ISK counters (time benefit/yr, safety benefit/yr, 30-yr stream).
- **Clock + playback**: sim clock (Friday 16:00…), pause/2×/64×, "skip to results".

### Economics (research/03)

- **Time**: Δ vehicle-hours × VoT per vehicle-hour (2026 ISK: car avg 5,510 free-flow / 8,260 congested; HGV 11,980/16,770; purpose mix by hour — commute peak vs leisure weekend). Growth 2.3%/yr, 30-yr stream, NPV @ 3.5%→2.5% toggle + undiscounted.
- **Safety**: expected accidents on each segment (rate × veh-km, rates from `slysumferd` accident layers) × config-dependent reduction (2+1 w/ barrier: −47–56% accident cost; 2+2: −58–64%; head-on ≈ eliminated) × per-accident costs (fatal 1,068 M, serious 140 M, minor 49 M, avg 9.7 M ISK 2026). Reykjanesbraut before/after (4–5 deaths/yr → 0) as the reality anchor.
- **Callout**: 110 requirement critique with Nordic comparison table (research/07).

### Calibration targets (research/06)

- Station free-flow means/V85/SD (12 sites on our corridors).
- Corridor times: Rvk–Borgarnes ~55–60 min FF / 1h+ peak; Rvk–Selfoss ~45 / 45–55; Rvk–KEF ~40 / 44–50.
- PTSF / follower-density vs HCM two-lane expectations at observed flows.
- The anecdote test: heavy northbound flow + one slow driver on 1+1 ⇒ sustained ~70 km/h platoon.

## Build order

1. **Pipeline** — Overpass + ArcGIS + DEM → corridor JSON models (three corridors, segments, junctions, chainage, grades).
2. **Engine + CLI harness** — IIDM/overtaking/MOBIL in pure TS; headless runs; calibration test suite against targets above.
3. **Economics layer** — pure functions over sim output; unit-tested against Sundabraut-style hand calcs.
4. **Web app** — map, animation, scenario panel, results; profile-collection cron.
5. **Polish** — presets, shareable scenario URLs, the 110 callout, about/methodology page (every number linked to research/ sources).

## Known gaps / assumptions

- Heavy-vehicle share not published — assume 8–12% rural Route 1, less urban; flag; optionally request classified counts from Vegagerðin.
- Hour-of-day profiles must be collected/derived (no published table).
- No Icelandic speed-flow curve — HCM/TØI two-lane model anchored to Icelandic free-flow stats.
- 110 km/h behavioral response (how much of +20 limit drivers take) — use Nordic before/after evidence, make it a visible parameter.
- Overtaking-zone (solid/dashed) maps not published — infer conservative passing zones from geometry/sight distance.
