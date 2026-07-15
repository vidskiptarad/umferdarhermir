# Traffic Volume Data — Three Icelandic Corridors (for microsimulation)

All ÁDU/SDU/VDU figures are **Vegagerðin 2025 annual figures** (released April 2026, rev. 2 June 2026). Two verified sources:

- **Averages Excel (2025):** https://www.vegagerdin.is/media/2026/04/umferd_2025_utg_2_10062026.xlsx (sheet `rVegnúmeraröð`)
- **ArcGIS ÁDU layer:** https://vegasja.vegagerdin.is/arcgis/rest/services/data/slysumferd/MapServer/8 (fields `ADU,SDU,VDU,AR=2025`)

Definitions: **ÁDU** = annual avg veh/day; **SDU** = summer (Jun–Sep); **VDU** = winter (Jan–Mar + Dec). ~90% accuracy; ~300 permanent + ~200 short-term sites nationwide. Iceland is UTC year-round.

---

## Corridor 1 — Route 1 North (Vesturlandsvegur): Reykjavík → Borgarnes

Road `1` ("Hringvegur"), sections e3→g7 south→north. 2025:

| Section | Segment | ÁDU | SDU | VDU | SDU/VDU |
|---|---|---:|---:|---:|---:|
| e3 | Breiðholtsbraut → Nesbraut (Ártún split) | 24,000 | 25,500 | 22,000 | 1.16 |
| **f2** | **Nesbraut (49) → Úlfarsfellsvegur** | **60,000** | 62,000 | 56,000 | 1.11 |
| f3 | Úlfarsfellsvegur → Reykjavegur (Mosfellsbær) | 34,500–37,000 | ~40,000 | ~32,000 | ~1.25 |
| f4 | Reykjavegur → Þingvallavegur (36) | 25,000–30,000 | 29,500–35,500 | 20,500–24,500 | ~1.45 |
| f5 | Þingvallavegur → Brautarholtsvegur | 11,500–19,500 | 14,500–23,500 | 9,100–16,000 | ~1.55 |
| f6 | Brautarholtsvegur → Hvalfjarðarvegur (47) — Kjalarnes | 10,500 | 12,500–13,000 | 8,100–8,300 | 1.57 |
| f7 | Hvalfjarðarvegur → tunnel south portal | 9,200 | 11,500 | 7,200 | 1.60 |
| **f8** | **Hvalfjarðargöng (TUNNEL)** | **9,100** | 11,000 | 7,100 | 1.55 |
| g0 | North portal → Akrafjallsvegur | 9,200 | 11,500 | 7,300 | 1.58 |
| g1 | Akrafjallsvegur stretch (Hvalfjörður N) | 6,000–7,400 | 8,400–10,500 | 3,900–4,850 | **2.15** |
| g2 | → Hvalfjarðarvegur (47-12) | 6,400–7,200 | 8,500–9,700 | 4,200–4,750 | ~2.0 |
| g3–g5 | → Borgarfjarðarbraut → Borgarnes | 5,400–6,100 | 7,400–8,500 | 3,750–4,150 | ~2.0 |
| g6 | Borgarnes, Borgarbraut → Hrafnaklettur | 9,100–9,800 | 13,000–13,500 | 6,500 | 1.38 |
| g7 | Hrafnaklettur → Snæfellsnesvegur (54) | 8,300 | 11,500 | 6,100 | 1.39 |

North side of Hvalfjörður has the strongest seasonality of all three corridors (SDU/VDU ≈ 2.0–2.15) — the cabin-country weekend signal.

## Corridor 2 — Route 1 South/East (Suðurlandsvegur): Reykjavík → Selfoss

Sections e3→d2 (codes decrease eastward). 2025:

| Section | Segment | ÁDU | SDU | VDU | SDU/VDU |
|---|---|---:|---:|---:|---:|
| e3 | Breiðholtsbraut → Nesbraut (shared @ Ártún) | 24,000 | 25,500 | 22,000 | 1.16 |
| e2 | Nesbraut → Breiðholtsbraut (Rauðavatn) | 14,500–17,500 | 17,000–20,000 | 12,000–15,000 | ~1.35 |
| e1 | Bolaöldur → Nesjavallaleið (Sandskeið) | 14,000–15,000 | 16,500–18,000 | 12,000 | ~1.45 |
| d9 | Þrengslavegur (39) → Bolaöldur | 14,000–14,500 | 16,500–17,000 | 11,000–11,500 | ~1.48 |
| **d8** | **Þorlákshafnarvegur (38) → Þrengslavegur — HELLISHEIÐI top** | **11,500–13,000** | 13,500–15,500 | 9,400–11,000 | ~1.45 |
| d6 | Biskupstungnabraut (35) → Þorlákshafnarvegur (38) | 12,500 | 15,000 | 10,000 | 1.50 |
| d5 | Selfoss, Eyrarbakkavegur (34) → Biskupstungnabraut — Ölfusá bridge | 16,000 | 18,000 | 13,500 | 1.33 |
| d4 | Selfoss, Laugardælavegur → Eyrarbakkavegur | 12,000–13,500 | 14,500–16,000 | 9,400–9,700 | ~1.6 |
| d3 | Gaulverjabæjarvegur → Laugardælavegur | 8,300 | 10,500 | 5,500 | 1.91 |
| d2 | Skeiðavegur → Gaulverjabæjarvegur (E of Selfoss) | 6,300–7,200 | 8,200–9,400 | 4,600–5,300 | ~1.78 |

## Corridor 3 — Route 41 (Reykjanesbraut): Reykjavík → Keflavík airport

Sections 02→22. Busiest of the three. 2025:

| Section | Segment | ÁDU | SDU | VDU | SDU/VDU |
|---|---|---:|---:|---:|---:|
| 02 | Faxagata → Hafnarfjarðarvegur (40) | 25,000 | 25,500 | 25,000 | 1.02 |
| 03 | Hafnarfjarðarvegur → Holtavegur (454) | 20,000 | 20,000 | 19,500 | 1.03 |
| 04 | Holtavegur → Nesbraut (49) | 25,500 | 25,500 | 25,000 | 1.02 |
| **11** | **Nesbraut (49) → Breiðholtsbraut [Mjódd]** | **72,000** | 73,000 | 71,000 | 1.03 |
| 12 | Breiðholtsbraut → Vífilsstaðavegur | 65,000–70,000 | 66,000–71,000 | 63,000–68,000 | 1.04 |
| 13 | Vífilsstaðavegur → Hafnarfjarðarvegur (40-06) | 42,000–62,000 | 43,000–63,000 | 41,000–60,000 | ~1.05 |
| 14 | → brú yfir Fjarðarbraut (Hafnarfjörður) | 39,500–53,000 | 40,500–55,000 | 38,000–51,000 | ~1.06 |
| 15 | → brú yfir Vatnsleysustrandarveg (Straumsvík) | 20,500–30,500 | 22,500–31,500 | 19,500–29,500 | ~1.13 |
| 16 | → brú yfir Grindavíkurveg (Vogar) | 19,000–20,500 | 22,000–23,500 | 16,500–18,000 | ~1.31 |
| 17 | → brú yfir Njarðvíkurveg | 16,000–17,500 | 18,500–20,000 | 14,000–15,000 | ~1.33 |
| 18 | → Víknavegur | 14,500 | 17,000 | 12,500 | 1.36 |
| 19 | Víknavegur → Grænás | 13,000 | 15,000 | 11,000 | 1.36 |
| 21 | Grænás → Garðskagavegur (45) | 16,500–17,000 | 19,000–19,500 | 14,000–14,500 | ~1.36 |
| 22 | Garðskagavegur → Flugstöð (airport terminal) | 13,000 | 15,500 | 10,500 | 1.48 |

Urban half = flat commuter traffic (SDU/VDU ≈ 1.02–1.06); airport half has summer bulge (up to ~1.48).

---

## APIs & Data Access (all verified live 2026-07-12)

### 1. Live real-time counter feed — ArcGIS REST (the key one)

**https://vegasja.vegagerdin.is/arcgis/rest/services/data/info/MapServer/2** (layer "Umferð", point features, one row per station×direction — the backend of umferd.vegagerdin.is). Example:
```
.../data/info/MapServer/2/query?where=1=1&outFields=*&returnGeometry=true&outSR=4326&f=geojson
```
247 rows / 165 named stations. Fields:
- `IDSTOD` (station id), `NAFN`, `STEFNA`/`STEFNA_TXT` (direction), `AUSTUR`/`NORDUR` (ISN93)
- `UMF_15MIN` — count last 15 min
- `UMF_I_DAG` — cumulative today (per direction)
- `MEDALHRADI` — average speed km/h (0 = sensor doesn't report speed)
- `DAGS_NYJASTA` — latest reading timestamp (updates within ~10–15 min)
- `UMF_M1…UMF_M7` + `DAGS_M1…M7` — daily totals for each of the last 7 days per direction
- `MAELISTOD_TEGUND` — hardware type (4 = full weather-station counter w/ speed)

No API key; open CORS; `f=json`/`f=geojson`; standard ArcGIS params.

**Live stations per corridor (IDSTOD):**
- Route 1 North: Ártúnsbrekka `5043`, Vesturl.v. ofan Ártúnsbr. `5019`, Laxalón `925`, Korpa `5001`, Mosfellsbær `906`, Kjalarnes `36`, Tíðaskarð `119`, Hvalfjarðargöng `911`, Akrafjall `72`, Hafnarfjall `12`, Seleyri `917`
- Route 1 South: Geitháls `5002`, Rauðavatn `923`, Sandskeið `17`, Hellisheiði `1`, Þrengsli `31`, Ingólfsfjall `63`, Ölfusá `942`, Þingborg `5027`, Selvogur `100`
- Route 41: Reykjanbr. v/Dalveg `5020`, v/Kauptún `5038`, Reykjanesbraut `14`, Strandarheiði `5004`, Grindavíkurvegur `935`, Rósaselstorg `934`

Sample live readings (2026-07-12 ~17:35): Ártúnsbrekka 29,336 today @ 87 km/h (west); Korpa N 11,516 @ 83 / S 10,906 @ 87; Hellisheiði vestur 6,900 / austur 3,757; Strandarheiði austur 6,797 @ 99 / vestur 7,387 @ 94.

### 2. Annual ÁDU/SDU/VDU map layers
- ÁDU `…/data/slysumferd/MapServer/8`, SDU `/9`, VDU `/10`, Vegnúmer `/11`; accident-rate layers 2–7; single-lane bridges 0–1.
- Fields: `NRVEGUR`, `NRKAFLI`, `VEGHEITI`, `UPPH_STOD`/`ENDA_STOD` (chainage m), `ADU`,`SDU`,`VDU`,`AR` (2025). Polyline geometry.

### 3. Bulk annual downloads
- Averages index (Excel 2000→2025): https://www.vegagerdin.is/vegagerdin/gagnasafn/umferdartolur/umferdarmedaltol-a-thjodvegum
- Daily counter totals (PDF, 2019→2024): https://www.vegagerdin.is/vegagerdin/gagnasafn/umferdartolur/solarhringstolur-fra-umferdarteljurum

### 4. umferdin.is GraphQL
https://umferdin.is/graphql is live but introspection disabled. Prefer the ArcGIS endpoint. Per-station history charts: https://www.vegagerdin.is/ferdaupplysingar/faerd-og-vedur/linurit/st<ID>.

---

## Hourly / weekly / seasonal profiles

- **Hour-of-day:** not published. Build empirically by polling `info/MapServer/2` (`UMF_15MIN`) at 15-min cadence and accumulating. `UMF_M1…M7` gives day-of-week patterns.
- **Seasonal:** SDU/VDU ratio per segment is the seasonality multiplier (1.0 urban Reykjanesbraut → ~2.15 Hvalfjörður).
- **Capital-area model:** Nýtt umferðarlíkan höfuðborgarsvæðisins (2023) — https://wp-beta.vegagerdin.is/wp-content/uploads/2023/09/nytt-umferdarlikan-skyrsla.pdf — temporal/directional factors for the metro network.

## Directional split

Per-direction live (`STEFNA_TXT`, `UMF_I_DAG`, `UMF_M1…M7`). Clean symmetric stations: Korpa `5001`, Strandarheiði `5004`, Dalvegur `5020`, Ölfusá `942`. Some stations only instrument one carriageway (Ártúnsbrekka `5043`, Kauptún `5038`) — filter.

## Heavy-vehicle share

**Genuine gap** — not in the public tables or live layer. Counters classify by length but split not exposed. Planning assumption ~8–12% heavy on rural Route 1, lower urban — treat as assumption, or request classified data from Vegagerðin.

## Caveats

- Latest annual year = 2025; daily PDFs = 2024; live feed real-time.
- A few live rows have corrupt coordinates (Kambaskriður `89`, Melar `5026` are East-Iceland stations) — map by IDSTOD + name, not coords.
- Hvalfjarðargöng counter `911` was stale when sampled (last 2026-06-28) — intermittently offline; use ÁDU 9,100 + flanking Kjalarnes `36` / Akrafjall `72` as live proxies.
- Legacy `data/umferd/MapServer` 404s; working services are `data/slysumferd` (annual) + `data/info` (live).
