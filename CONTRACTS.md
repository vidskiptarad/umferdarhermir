# CONTRACTS — read this before writing any code

`src/types.ts` is the binding contract between four independently-built parts:

| Part | Location | Builds |
|---|---|---|
| Pipeline | `scripts/pipeline/` | `data/<id>.corridor.json` (×3) + `data/demand.json` |
| Engine | `src/sim/` | `Simulation` class + helpers, `src/sim/__tests__/` |
| Economics | `src/econ/` | benefit functions, `src/econ/__tests__/` |
| Web app | `app/`, `src/ui/` | Next.js UI, Web Worker wrapper |

Ground rules for all builders:

1. **Do not modify** `package.json`, `tsconfig.json`, or anything outside your part's directories (plus your test dirs). All deps are preinstalled (`@turf/turf`, `vitest`, `tsx` available). If you believe a new dep is essential, note it in your final report instead of installing it.
2. **Do not run `git commit`** — the coordinator commits.
3. `src/sim` and `src/econ` must be **dependency-free** pure TypeScript (importable in a Web Worker and in Node via `tsx`). No DOM, no Node APIs in the library code itself (CLI scripts in `scripts/` may use Node APIs).
4. Tests: `npx vitest run` must pass. Type checks: `npx tsc --noEmit` must pass (ignore errors coming from other parts' missing files — note them instead).
5. All numeric parameters must come from `research/` reports (cite file+section in a comment) or be clearly marked `// ASSUMPTION:` with rationale.

## Semantics that types.ts can't express

### Coordinates & directions
- Direction **0 (fwd) = away from Reykjavík**, 1 (rev) = toward Reykjavík.
- `offsetM` runs 0 at the Reykjavík end → `lengthM` at the far end for BOTH directions (rev vehicles move toward decreasing offset... **no**: rev vehicles are stored with the same offset axis but travel from `lengthM` toward 0).
- Corridor start/end points:
  - `north`: Ártúnshöfði (Vesturlandsvegur begins) → Borgarnes (roundabout at Rte 54).
  - `south`: Rauðavatn/Norðlingaholt → Selfoss west end (Ölfusá bridge approach).
  - `kef`: Hafnarfjörður entrance (Lækjargata/Fjarðarhraun area) → KEF terminal junction.

### Segment configs
- `S1`: one lane each direction, no median. Overtaking uses the oncoming lane, permitted only if `overtakingAllowed && !barrier`, and modeled with oncoming-gap acceptance (research/04 §2).
- `S21F`/`S21R`: two lanes in fwd/rev respectively, one in the other; wire median ⇒ crossing impossible; the 2-lane direction uses MOBIL lane changes; the 1-lane direction cannot overtake at all.
- `D2`: two lanes each direction, median; MOBIL both directions.
- Hvalfjarðargöng is S1 with `overtakingAllowed: false`, 70 km/h, plus a short `S21F` sub-segment for the 3-lane north climb (research/02). Its `upgradeHint: 'tunnel-bore-2'` upgrade means: config → `D2` (and the UI may also offer 90 km/h there).
- Ölfus (Hveragerði–Selfoss) segments get `upgradeHint: 'fourth-lane'` (roadbed already 2+2).

### Scenario resolution (`applyScenario`)
- Overrides replace `config`/`maxspeedKmh` per segment. Setting a config with a barrier forces `barrier: true`, `overtakingAllowed: false`.
- `speedLimitAdoption` (default **0.7**): when a scenario raises a segment's limit by Δ, drivers' effective desired speed on that segment becomes `v0 + adoption × Δ` (research/06 §4 — Nordic mean-speed response; make the constant visible).
- Junction override → `type: 'grade-separated'`, `throughSpeedKmh` = segment speed, capacity constraint removed.

### Desired speeds (research/04 §4, research/06 §1)
- Cars: `v0 ~ N(92, 8) km/h` truncated [70, 120] — this is for a 90 km/h rural segment; scale by segment: `v0_seg = v0 × (segmentLimitAdjusted / 90)` clamped to ≥ 30 km/h, where `segmentLimitAdjusted` includes the adoption rule above. Urban limits (≤ 80) behave the same way.
- Trucks: `v0 ~ N(83, 5)`, truncated [70, 90], never above 90 even at 110 limits (EU limiter).
- A vehicle keeps one base `v0` (sampled at spawn, seeded RNG) and derives per-segment desired speed from it.

### Junction node model (research/04 §7)
- Roundabout/t-junction/signal: vehicles decelerate to `throughSpeedKmh` through a ~80 m zone, and the node is a capacity server: capacity `C = q·exp(−q·t_c)/(1−exp(−q·t_f))` with `t_c = 4.5 s`, `t_f = 2.8 s`, `q = conflictingVph/3600`; vehicles queue (FIFO per direction) when arrival rate exceeds capacity. Signals: model as capacity server with effective capacity ×0.5 and through speed 0 → treat simply; document your simplification.
- Grade-separated: no effect.

### Spawning
- Poisson arrivals per direction with rate `λ(h) = dayTotal × hourShare(dir, h) / 3600` veh/s, where `dayTotal = aadtRef × dayFactor × demandScale`.
- Truck share applies per spawn (`isTruck ~ Bernoulli(truckShare)`), trucks get truck `v0`/IDM params.
- If the entry cell is blocked (jam at entrance), queue virtually and inject when space frees; virtual queue time counts toward travel time.

### Engine internals (research/04 — follow the "recommended model stack")
- IIDM (improved IDM), ballistic integration, `dt = 0.25 s`; cars `T=1.3, a=1.2, b=1.8, s0=2, δ=4, len=5`; trucks `T=1.7, a=0.4, b=1.5, s0=3, len=14`.
- Overtaking decision every 5 steps; gap-acceptance `g_required(Δv) = 6 + 120/max(Δv_kmh, 5)` seconds vs the oncoming stream, plus sight distance cap of 600 m (only consider/require oncoming clearance within visible range; if an oncoming vehicle could appear beyond sight, require the full `g_required` against a hypothetical vehicle at sight-distance limit traveling at the segment limit).
- Abort rule: an overtaking vehicle that cannot complete before its safety margin re-merges behind (simplify: only start overtakes that project to complete; no mid-overtake aborts, but cap overtake distance at 400 m).
- MOBIL on multilane: `p=0.35, b_safe=4, Δa_th=0.2, keep-right bias 0.2`.
- PTSF accounting: a vehicle is "following" when time-headway to leader < 3 s and its speed < its desired speed − 4 km/h.
- Rolling segment stats window: 120 s.

### Demand profiles (pipeline)
- Hour shapes: weekday = commuter double-hump (AM peak toward Rvk on north/south! i.e. rev; PM peak fwd), Friday summer = strong PM fwd hump (14–19), Sunday return = strong PM rev hump (15–20). Base shapes on research/01 (directional live samples, SDU/VDU) + capital-area model temporal factors; document assumptions inline. `dayFactor`: typicalWeekday = 1.0 (AADT), fridaySummer = SDU/AADT × 1.15, sundayReturn = SDU/AADT × 1.10. KEF corridor: flatter curve + airport-schedule morning bump; dayFactor ≈ 1.0/1.05.
- Truck share: `// ASSUMPTION` 0.10 north/south rural, 0.06 kef (research/01 flags this as a gap).

### Economics conventions (research/03)
- Congested VoT applies to delay time (travel time − free-flow); free-flow VoT to the rest. Car purpose mix is already folded into the average car VoT — use the average.
- Safety: expected accidents/yr per segment = `rate(config) × vehKm/yr / 1e6`; upgrading S1 → S21*/D2 multiplies the segment's accident COST by (1 − reduction). Baseline rate for S1: derive so that results are sane against research/03 §4 (2005 study): defaults `S1: 0.35, S21F/R: 0.20, D2: 0.15` per M veh-km with `// ASSUMPTION` markers; reductions 0.51 (S21), 0.61 (D2).
- Annualization default: 250 × typicalWeekday + 58 × fridaySummer + 57 × sundayReturn = 365 sim-days (weekends/holidays approximated by the two peak types; document).

### Calibration targets (scripts/calibrate.ts — engine builder owns this)
Print a table comparing sim vs targets (research/06):
- Free-flow corridor times: north ~55–60 min, south ~45 min, kef ~40 min (one direction, off-peak).
- Mid-corridor free-flow mean speeds ≈ station means (±3 km/h): north rural ~93, south ~90, kef ~92.
- Peak-hour 1+1 platooning: on the north corridor Friday preset, mean speed on the Hvalfjörður–Borgarnes S1 stretch should drop well below free flow (target band 70–85 km/h) with PTSF > 0.5.
- Determinism: same seed ⇒ identical aggregates.
If a target misses, tune only: v0 spread, slow-tail share, `g_required` constants, junction `conflictingVph` — and record what you changed in the calibration report.
