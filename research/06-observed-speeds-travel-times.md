# Observed Speeds & Travel Times on Three Icelandic Corridors — Calibration Research

Prepared 2026-07-12. Corridors: Route 1 Reykjavík–Borgarnes (~74 km), Route 1 Reykjavík–Selfoss (~57 km), Route 41 Reykjavík–KEF (~47 km).

**Bottom line:** The most valuable source is Helga Þórhallsdóttir (2016), *Líkan um 85%-hraða á tveggja akreina vegum* (HÍ MSc / Vegagerðin) — free-flow mean speeds, std devs, V85, min/max at 12 sites directly on these corridors, each with ÁDU and posted limit (90 everywhere). Gap in the public record: no Icelandic speed-flow / percent-time-following curves — import Nordic (TØI/Elvik) or HCM two-lane model, anchored to the station means below.

---

## 1. Measured free-flow speeds at sites on the corridors

Source: Helga Þórhallsdóttir 2016, Tafla 4.2 + 4.4. Free-flow, dry pavement, passenger cars, 2010–2011. Posted limit 90 everywhere.
PDF: https://wp-beta.vegagerdin.is/wp-content/uploads/2023/07/likan-um-85prosent-hrada-a-tveggja-akreina-vegum.pdf

### Route 1 NORTH — Vesturlandsvegur

| Site | ÁDU | Mean (km/h) | SD (km/h) | V85 | v_max | CCR (gon/km) |
|---|---|---|---|---|---|---|
| Árvellir (Kjalarnes) | 6 536 | 85.1–88.6 | 5.9–9.7 | 92–95 | 108–162 | 0 |
| Arnarhamar (Kjalarnes) | 5 617 | 88.0–90.5 | 7.0–7.2 | 94.6–98.1 | 110–119 | 23 |
| Fiskilækur | 3 726 | 93.6–94.3 | 7.9–8.4 | 101–102 | 120–122 | 74 |
| Hafnarmelar | 3 403 | 93.2–95.2 | 7.6–10.4 | 100–105 | 122–164 | 0 |
| Háumelar | 3 403 | 92.8–92.9 | 8.4–9.5 | 101 | 115–121 | 61 |
| Daníelslundur (nr. Borgarnes) | 1 923 | 95.3–97.4 | 9.6–10.2 | 105–107 | 123–125 | 90 |

### Route 1 SOUTH — Suðurlandsvegur

| Site | ÁDU | Mean | SD | V85 | v_max | CCR |
|---|---|---|---|---|---|---|
| Bolaöldur (Hellisheiði climb) | 7 871 | 90.8–93.7 | 6.1–7.3 | 96.6–101.1 | 107.5–115.1 | 13 |
| Hellisheiði (summit) | 5 980 | 93.4–97.4 | 7.2–8.4 | 100–106 | 118–146 | 0 |
| Kotstrandarkirkja (E of Hveragerði) | 7 126 | 86.3–87.3 | 6.6–6.7 | 92.3–93.8 | 101.8–108.3 | 95 |
| Ingólfshvoll (nr. Selfoss) | 6 464 | 85.5–85.7 | 6.2–6.7 | 91–92 | 105–110 | 55 |
| Þingborg (E of Selfoss) | 3 341 | 91.2–94.3 | 7.1–9.1 | 98–101 | 117–139 | 0 |

### Route 41 — Reykjanesbraut (2+2 divided)

| Site | ÁDU | Mean | SD | V85 | v_max |
|---|---|---|---|---|---|
| Reykjanesbraut (both dir.) | 10 220 | 92.0–92.1 | 7.2–8.3 | 99–101 | 113 |

**Patterns:**
- Free-flow mean 85–97 km/h on a 90 limit; V85 ≈ 91–107. Overshoot on straight/wide (Hellisheiði, Hafnarmelar, Daníelslundur), undershoot on curvy/narrow (Kotstrandarkirkja, Ingólfshvoll, Árvellir).
- SD ≈ 6–10 km/h at free flow.
- V85 driven by: curvature change rate (CCR), superelevation, lane width, paved width, ÁDU, distance from urban area.

**Vegagerðin speed program:** Marksman 660/680 loop counters (EUR6/EUR13 classification) log per-vehicle speed + headway. Aggregates under Ferðaupplýsingar → Umferðargreinar → Hraði; per-station data via https://umferd.vegagerdin.is/ (Excel/PDF). Automatic average-speed enforcement (meðalhraðaeftirlit) since 2021, ~28 stations mostly tunnels/Reykjanes.

---

## 2. Typical door-to-door travel times

| Corridor | Dist. | Free-flow | Typical / peak | Basis |
|---|---|---|---|---|
| RVK → KEF | ~47–50 km | ~40 min | 44–50 min | travelmath 44 min; rent.is/zerocar 45–50; mean ~92 km/h |
| RVK → Selfoss | ~57 km | ~45 min | 45–55 min; worse Fri outbound / Sun return | mean 86–97 km/h over Hellisheiði |
| RVK → Borgarnes | ~74 km | ~55–60 min | ~1 h+; queues at Hvalfjarðargöng / Kjalarnes on peaks | single-bore tunnel is binding bottleneck |

Real-time: https://umferdin.is/ and https://www.erumferd.is/

---

## 3. Congestion evidence

- **Kjalarnes / Hvalfjarðargöng:** recurrent queueing "from the tunnel to Grundartangi" at peaks; total backups when the single-bore tunnel closes (only route north). Live: https://umferdin.is/vedurstodvar/36 · https://www.visir.is/t/1618
- **Suðurlandsvegur volumes:** Hveragerði–Selfoss 4,970/day (2000) → 6,462 (2012) → 10,342 (2019) → 10,753 (2022); peak-season sections 12,000–20,000/day. Fri-outbound/Sun-return summerhouse peaks.
- **Vegagerðin/Línuhönnun 2005 capacity study** (https://www.vegagerdin.is/vefur2.nsf/Files/2plus1-Samanburdur/$file/2+1%20Samanburdur.pdf):

  | Cross-section | Capacity (veh/day) |
  |---|---|
  | 1+1 (Icelandic, wide) | 10,000–15,000 |
  | 2+1 | 15,000–20,000 |
  | 2+2 | 50,000–65,000 |

  1999 reference volumes: ~4,700 (Vesturlandsvegur @ Esjuberg), ~6,000 (Suðurlandsvegur @ Hafravatnsvegur). Case for upgrading was safety (frontal crashes), not capacity — but 2022 volumes ~10,000+ now approach the 1+1 capacity band.

---

## 4. Speed-limit policy

- Current max: 90 paved rural / 80 gravel / 50 urban — Umferðarlög nr. 77/2019 (https://www.althingi.is/lagas/nuna/2019077.html).
- **§37 of the 2019 law PERMITS up to 110 km/h where directions are physically separated** — on the books, never used.
- Alþingi svar 917/150 + FÍB: no road qualifies; even Reykjanesbraut lacks the required ≥18 m obstacle-free zone and compliant median (https://www.fib.is/is/um-fib/frettir/eng-inn-veg-ur-a-islandi-upp-fyll-ir-skil-yrdi-fyr-ir-110-kmklst).
- Repeal bill þskj. 411/151 (https://www.althingi.is/altext/151/s/0411.html) proposed removing the 110 authority entirely.
- Nordics: Norway 110 motorway; Sweden 110 common, 120 best motorways; Denmark 130. Iceland at 90 is the outlier — its legal ceiling already equals Norway's motorway limit.

---

## 5. Speed–flow degradation on 1+1 (the "70 km/h behind one slow driver")

- No published Icelandic speed-flow / PTSF curves. Vegagerðin studies derive from Elvik et al., *Trafikksikkerhetshåndbok* (TØI 1997) and US HCM.
- On 1+1, platooning behind a slow lead vehicle is the dominant speed suppressor — mean speed collapses toward the slow vehicle's speed for the whole platoon. This is the exact rationale for 2+1 (safe overtaking every ~1–1.5 km so platoons discharge).
- Calibration: HCM two-lane model (PTSF rising with directional flow) anchored to §1 free-flow means; free-flow SD 6–10 km/h; slow tail v_min 44–78 km/h even in free flow.

---

## 6. Effect of direction-separation upgrades (safety before/after)

**Reykjanesbraut tvöföldun (1+1 → 2+2, final phase 2008):**
- Before: **4–5 deaths/year** on the 24 km stretch. After: **zero fatalities for 12+ years** (Víkurfréttir; Rannsóknarnefnd samgönguslysa). Credited with reducing national traffic deaths ~20%.
- 2005 comparison: frontal crashes **−95% for 2+2, −100% for 2+1 with median**. Doc: https://www.vegagerdin.is/vefur2.nsf/Files/slys_a_Reykjanesbraut/$file/Slys%20á%20Reykjanesbraut.pdf

**Suðurlandsvegur:**
- Hellisheiði direction-separation completed 2015 → frontal collisions "nánast fallið niður" (nearly eliminated).
- Hveragerði–Selfoss 2+1 w/ víraleiðari opened ahead of schedule (stjornarradid.is 2022-09-09). Historically one of Iceland's most crash-prone sections.
- No published travel-time before/after study — upgrades justified on safety + overtaking reliability. 2+2 yields higher mean speed than 2+1 (no km/h delta published).

---

## Consolidated calibration-targets table

| Corridor | Cross-section | FF mean (km/h) | FF V85 | SD | FF time | Typical/peak | AADT (veh/day) | Capacity | Limit |
|---|---|---|---|---|---|---|---|---|---|
| RVK–Borgarnes (~74 km) | mostly 1+1; tunnel 1+1 @70 | 85–97 | 92–107 | 6–10 | ~55–60 min | ~1 h+ | ~1,900–6,500 | 10–15k (1+1) | 90 |
| RVK–Selfoss (~57 km) | 2+1 w/ median (new); 1+1 tails | 85–97 | 91–106 | 6–9 | ~45 min | 45–55 min | ~3,300–10,750 | 15–20k (2+1) | 90 |
| RVK–KEF (~47 km) | 2+2 divided | 92 | 99–101 | 7–8 | ~40 min | 44–50 min | ~10,200+ | 50–65k (2+2) | 90 |

## Key sources

- Speed measurements: https://wp-beta.vegagerdin.is/wp-content/uploads/2023/07/likan-um-85prosent-hrada-a-tveggja-akreina-vegum.pdf
- 1+1/2+1/2+2 comparison + capacity: https://www.vegagerdin.is/vefur2.nsf/Files/2plus1-Samanburdur/$file/2+1%20Samanburdur.pdf
- Suðurlandsvegur EIA: https://www.vegagerdin.is/Vefur2.nsf/Files/Sudurlandsvegur-Hveragerdi-Selfoss-MAU.pdf/$file/Sudurlandsvegur-Hveragerdi-Selfoss-MAU.pdf
- Reykjanesbraut safety: https://www.vegagerdin.is/vefur2.nsf/Files/slys_a_Reykjanesbraut/$file/Slys%20á%20Reykjanesbraut.pdf
- Traffic stats: https://www.vegagerdin.is/en/the-transportation-system/the-road-system/traffic-statistics · https://umferd.vegagerdin.is/
- Real-time: https://umferdin.is/ · https://www.erumferd.is/
- Law: https://www.althingi.is/lagas/nuna/2019077.html · https://www.althingi.is/altext/151/s/0411.html
- Nordic limits: https://en.wikipedia.org/wiki/Speed_limits_in_Norway · https://en.wikipedia.org/wiki/Speed_limits_in_Sweden
