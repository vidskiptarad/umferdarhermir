# Value of Travel Time & Transport-Appraisal Conventions in Iceland

Compiled 2026-07-12. Older values CPI-adjusted to 2026 (method at end).

## How Iceland does road cost-benefit analysis

No standalone Icelandic unit-value manual (unlike Sweden's ASEK / UK TAG). Vegagerðin runs appraisals through the **Danish TERESA model** with partly Icelandic, partly Danish/Nordic unit values. Key documents:

- Hagfræðistofnun HÍ, "Virði tölfræðilegs lífs og mat á tímavirði" (2023): https://www.vegagerdin.is/media/2023/10/nr_1800_917_og_918_virdi-tolfraedilegs-lifs-og-mat-a-timavirdi.pdf
- Hagfræðistofnun HÍ, "Forgangsröðun fjárfestinga í innviðum" I/II: https://ioes.hi.is/files/2021-05/Forgangsrodun-i-samgongum.pdf · https://www.vegagerdin.is/media/2023/10/forgangsrodun-fjarfestinga-i-innvidum-ii.pdf
- Vegagerðin, "Samgöngubætur og félags- og efnahagsleg áhrif þeirra" (2023): https://wp-beta.vegagerdin.is/wp-content/uploads/2023/10/samgongub_felags_efnahagsl.pdf
- **Sundabraut CBA (Mannvit/COWI 2021)** — contains the actual unit-value tables: https://www.stjornarradid.is/library/01--Frettatengt---myndir-og-skrar/Skjol---Frettatengt/Sundabraut-fylgiskjal1-greinargerð%20Mannvits%20og%20Cowi-17.12.2021.pdf
- Borgarlína socioeconomic analysis (2020): https://wp.borgarlinan.is/wp-content/uploads/2020/11/a133201_report-socioeconomic-analysis_final.pdf
- Haraldur Sigþórsson & Vilhjálmur Hilmarsson, "Kostnaður umferðarslysa" (2014): http://www.vegagerdin.is/Vefur2.nsf/Files/Kostnadur_umferdarslysa/$file/Kostnaður%20umferðarslysa.pdf

**Iceland has no domestic willingness-to-pay study for VoT or VSL** — values are Danish/Nordic transfers via PPP, rolled forward on Icelandic CPI.

## 1. Value of time (tímavirði)

Method: business travel = cost-saving approach (wage + payroll + overhead); commute/leisure ≈ 67% of disposable income per hour; congestion/delay time multiplier ~1.5×.

**Per person-hour (Sundabraut, TERESA, 2021 prices):**

| Purpose | Free-flow ISK/person-hr | Congestion |
|---|---|---|
| Commute | 2,761 | 4,142 |
| Business | 6,418 | 9,627 |
| Other/leisure | 2,761 | 4,142 |

**Per vehicle-hour (occupancy folded in — use these for road-link benefits), 2021 prices:**

| Vehicle / purpose | Free-flow | Congestion |
|---|---|---|
| Car — commute | 2,965 | 4,448 |
| Car — business | 7,023 | 10,535 |
| Car — leisure | 4,198 | 6,297 |
| **Car — average** | **4,149** | 6,223 |
| Delivery truck (DTV) | 6,731 | 9,423 |
| **HGV** | **9,019** | 12,627 |

Cross-check: Borgarlína 2020 used commute/other 2,444, business 5,781 ISK/person-hr (~11% lower, consistent with CPI).

## 2. Vehicle occupancy (Danish/TERESA figures, used unchanged)

| Purpose | Persons/car |
|---|---|
| Commute | 1.07 |
| Business | 1.09 |
| Leisure | 1.52 |
| **Weighted avg** | **≈1.33** |

## 3. Conventions

| Convention | Icelandic practice |
|---|---|
| Discount rate | 3.5% real first 35 yrs, 2.5% after (Sundabraut); Borgarlína used 4% |
| Analysis period | 30 years from opening |
| Traffic growth | 2.3%/yr car (Sundabraut); Borgarlína 1.04%; taken from regional transport model |
| Rule of half | Yes — induced/diverted trips get half the unit benefit |
| Deadweight loss | 8%; public-funds factor 1.15 |

## 4. Worked examples

- **Sundabraut (2021, 30-yr NPV):** car time savings 138–200 bn ISK; freight 32–45 bn; externalities 21.6–22.6 bn; total user benefits 216–293 bn. **B/C 2.9–3.3, IRR 11.5–12.2%.**
- **Samgöngusáttmáli arðsemismat (Alþingi svar 1237/157):** user savings ~793 bn (car) + ~624 bn (PT) over 50 yrs. https://www.althingi.is/altext/157/s/1237.html
- **Reykjanesbraut doubling:** up to 40 lives saved est.; accidents −30% to −55%; accident cost −38% to −65%; 4–5 deaths/yr → 0 for 12+ yrs; cost ~6.1 bn ISK. https://www.mbl.is/frettir/innlent/2014/06/09/allt_ad_40_mannslifum_bjargad/
- **"Samanburður á 1+1, 2+1 og 2+2 vegum" (Vegagerðin 2005)** — first-year safety-only returns:

  | Upgrade from 1+1 | Accident-cost saving | First-year return |
  |---|---|---|
  | → 2+1 no barrier | 14–23% | 2.3–3.2% |
  | → 2+1 **with wire barrier** | **47–56%** | **4.0–9.4%** |
  | → 2+2 grade-separated | 58–64% | 2.3–3.5% |

  Median barrier is decisive; head-on collisions (costliest type) are the dominant line item.

## 5. Accident costs (slysakostnaður) — Kostnaður umferðarslysa 2014, 2013 prices → 2026 (×1.619)

**Per casualty:**

| Severity | 2013 ISK | 2026 ISK |
|---|---|---|
| Fatality | 484.18 M | **784 M** |
| Serious injury | 61.75 M | **100 M** |
| Minor injury | 12.14 M | **19.7 M** |

**Per accident (4-class):**

| Type | 2013 | 2026 |
|---|---|---|
| Fatal accident | 659.6 M | **1,068 M** |
| Serious-injury | 86.4 M | **140 M** |
| Minor-injury | 30.4 M | **49 M** |
| Property-damage-only | 1.4 M | **2.3 M** |
| Average accident | 6.0 M | **9.7 M** |

Serious = 13% of fatality VSL, minor = 1% (EU/Nellthorp). Nordic VSL band 2026: ~736–1,103 M ISK — 784 M is mid/conservative.

Alternative (Sundabraut): accidents as per-km externality — 10.87 ISK/km cars, 9.21 DTV, 81.78 HGV (2021).

**Clean 2+2 safety benefit method:** (accidents/yr on existing road) × (crash-cost reduction 30–65% from barrier/separation) × (per-accident cost), annualized.

## 6. Vehicle operating cost (context)

2021: 58.48 ISK/km car (commute/leisure), 53.39 business, 54.83 DTV, 119.84 HGV → 2026 (×1.328): ~78 car, ~71 business, ~73 DTV, ~159 HGV.

## 7. CPI adjustment (Hagstofa VIS01000, maí 1988=100)

| Year | Index | Factor to 2026 |
|---|---|---|
| 2013 avg | 412.7 | ×1.619 |
| 2021 avg | 503.3 | ×1.328 |
| 2022 avg | 545.1 | ×1.226 |
| 2025 avg | 653.1 | ×1.023 |
| 2026 Jan | 668.3 | 1.000 |

## 8. Recommended parameter set (2026 ISK)

**VoT per vehicle-hour (occupancy embedded):**

| Vehicle / purpose | Free-flow | Congestion |
|---|---|---|
| Car — commute | **3,940** | 5,910 |
| Car — business | **9,330** | 13,990 |
| Car — leisure | **5,570** | 8,360 |
| **Car — average** | **5,510** | 8,260 |
| Delivery truck | **8,940** | 12,510 |
| **HGV** | **11,980** | 16,770 |

Occupancy: 1.07 / 1.09 / 1.52, fleet avg 1.33. Discount 3.5% real (→2.5% after 35 yrs); 30-yr period; growth 2.3%/yr; rule of half; congestion multiplier ~1.5.

**Accident values (2026):** fatality 784 M (band 736–1,103 M); serious 100 M; minor 19.7 M; per fatal accident 1,068 M; avg accident 9.7 M.

### Caveats
1. All VoT/accident values are Nordic transfers on Icelandic CPI — honest uncertainty ±20%.
2. Accident values are 2013-based CPI-only — real safety valuations rose faster (wage-linked VSL); 784 M is conservative, ~1.1 bn defensible high case.
3. For benefits-only: (a) time = Δveh-hours × VoT above; (b) safety = accidents avoided × per-accident cost, head-on elimination as headline, backed by Reykjanesbraut −30–65% real-world evidence.
