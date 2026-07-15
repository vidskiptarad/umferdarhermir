# Microscopic Traffic Simulation for Icelandic Rural Highways — Methodology Report

Scope: browser-based agent simulation of 1+1 (single-carriageway, bidirectional) rural roads at 90 km/h, where the dominant phenomenon is **platoon formation behind slow vehicles** and **overtaking constrained by gaps in oncoming traffic**. Every driver is an actor with a sampled desired speed.

---

## 1. Car-following: the Intelligent Driver Model (IDM)

The IDM (Treiber, Hennecke & Helbing, 2000) is the standard continuous car-following model: realistic acceleration, smooth following, and a well-defined desired speed per vehicle — the mechanism that creates platoons behind slow leaders.

### Exact equations (code-friendly)

For vehicle with speed `v`, bumper-to-bumper gap `s` to the leader, and approach rate `dv = v − v_leader`:

```
// desired (dynamic) gap
s_star = s0 + max(0, v*T + (v*dv) / (2*sqrt(a*b)))

// acceleration
dvdt = a * ( 1 - (v/v0)^delta - (s_star/s)^2 )
```

- `v0` — desired free-flow speed (per-agent sampled; see §4)
- `T` — desired time headway (s)
- `a` — max/desired acceleration (m/s²)
- `b` — comfortable deceleration (m/s²)
- `s0` — minimum standstill gap (m)
- `delta` — acceleration exponent (almost always 4)

When a fast agent (high `v0`) catches a slow leader, `s_star/s → 1`, acceleration collapses to ~0, and it settles into following at gap `s0 + v*T` — this is the platoon.

### Parameter values

| Parameter | Car (typical) | Car (orig. calibrated) | Truck / heavy |
|---|---|---|---|
| `v0` | site-specific (§4) | 30 m/s (108 km/h) | 80 km/h (22.2 m/s) |
| `T` | 1.0–1.5 s | 1.5 s | 1.7–1.8 s |
| `a` | 1.0–1.5 m/s² | 0.73 m/s² | 0.3–0.5 m/s² |
| `b` | 1.5–2.0 m/s² | 1.67 m/s² | 1.0–2.0 m/s² |
| `s0` | 2.0 m | 2.0 m | 2.0–3.0 m |
| `delta` | 4 | 4 | 4 |
| length | 5 m | 5 m | 12–16 m |

Sources: https://www.mtreiber.de/MicroApplet/IDM.html · https://en.wikipedia.org/wiki/Intelligent_driver_model

For a 90 km/h rural road: `v0` sampled per §4, `T≈1.3 s`, `a≈1.2`, `b≈1.8`. Trucks are the "slow leaders" that seed platoons — `v0≈80–85 km/h`, `a≈0.4`, longer length.

### Known IDM defects and the IIDM / ACC fix

Two documented problems (Treiber & Kesting, *Traffic Flow Dynamics*, 2013 — https://mtreiber.de/IntelligentAgentModel.pdf; 25-Years-of-IDM review — https://arxiv.org/html/2506.05909v1):

1. **Exaggerated deceleration when `v > v0`** (downhill / after lowering `v0`).
2. **Equilibrium gaps that don't match empirical data** at high flow; platoon "collapse" artefacts.

The **Improved IDM (IIDM)** combines the free-acceleration and interaction terms smoothly, eliminating overbraking above `v0`, with the *same six parameters*. The **IDM+/ACC model** (Kesting, Treiber, Helbing 2010) layers the Constant-Acceleration Heuristic (CAH) on top with mixing factor `c ≈ 0.99`. (https://www.researchgate.net/publication/46158245)

**Recommendation: implement IIDM as the core** (~15-line function, same params, no downside); skip full CAH/ACC.

---

## 2. Overtaking on two-lane bidirectional roads (the core of this project)

Overtaking a slow leader on a 1+1 road requires borrowing the oncoming lane: a **gap-acceptance problem against the oncoming stream**, gated by **sight distance**.

### 2a. The movsim / traffic-simulation.de approach (directly reusable)

traffic-simulation.de implements bidirectional overtaking via `road.prototype.determineOvertakingConflicts` (https://github.com/movsim/traffic-simulation-de/blob/master/README_oppositeTraffic):

1. Overtaking triggered through MOBIL treating the oncoming lane as target, evaluated **every ~5 time steps**.
2. Compute the overtaker's re-entry point `uConflictExit` and maneuver time `dtOvertaking`.
3. **Accept only if every conflicting oncoming vehicle clears the zone in time:**
   ```
   accept  ⇔  vehConflict.u + vehConflict.speed * dtOvertaking  <  uConflictExit
   ```
4. If accepted, pull into oncoming lane; if not, stay and platoon.

Validated mainly for "two-lane road with single-lane bottlenecks"; dense-oncoming rural overtaking is the scenario to extend. Closest existing open-source model to this need.

### 2b. Gap-acceptance formulation with concrete numbers

```
t_overtake ≈ (2 * d_safe + L_lead + L_over) / dv_pass     // time to pass at relative speed dv_pass
g_required = t_overtake + t_safety                         // required clear time to oncoming vehicle
```

with `dv_pass` = speed advantage during the maneuver, `d_safe ≈ v*T`, `t_safety ≈ 1–2 s`.

Concrete values (AASHTO PSD + two-lane gap studies — https://open.alberta.ca/dataset/2b5c861b-3de9-41f5-9d80-522f0c34550c · https://www.researchgate.net/publication/233361232 · https://www.sciencedirect.com/science/article/abs/pii/S1369847813000612):

- AASHTO assumes the passer travels **~16–19 km/h faster** than the overtaken vehicle.
- A full pass at Δv ≈ 20 km/h takes **8–12 s**, covering **~250–350 m**.
- Minimum acceptable clear gap to nearest oncoming vehicle for Δv=20: **~9–13 s of time-to-collision headroom** ⇒ at ~45–50 m/s relative approach, **~450–600 m required oncoming sight distance** (consistent with AASHTO PSD ~615 m at 90 km/h).
- Model `g_required` decreasing with Δv: `g_required(Δv) ≈ 6 s + 120 / Δv_kmh` (~12 s at Δv=20, ~9 s at Δv=40). Abort/perception-reaction ~1.0 s.

Platoon-membership test from the Icelandic Vegagerðin study (§4): a vehicle is following (not free) when **headway < 3–6 s and speed within ~4 km/h of the leader**.

### 2c. Aggregate two-lane performance measures (calibration targets)

- **Percent Time Spent Following (PTSF)** — fraction of travel time within a 3-second follower headway. Classic platooning metric (HCM).
- **Follower Density** (followers/km/lane) — HCM 7th-edition primary two-lane LOS measure.
- TWOPAS is legacy (1998, not open-source) — treat HCM/PTSF/follower-density as **calibration targets the agent sim should reproduce**.

---

## 3. Lane-changing for 2+1 / 2+2 sections: MOBIL

MOBIL (Kesting, Treiber, Helbing 2007 — https://akesting.de/download/MOBIL_TRR_2007.pdf) evaluates lane changes in terms of IDM accelerations.

**Safety criterion:** `a_n ≥ -b_safe` (new follower not forced to brake too hard)

**Incentive criterion:**
```
(a_c - ã_c) + p * [ (a_n - ã_n) + (a_o - ã_o) ]  >  Δa_th + a_bias
```

| Parameter | Value | Notes |
|---|---|---|
| `p` (politeness) | 0.2–0.5 (use **0.35**) | 0 = egoistic |
| `b_safe` | 4 m/s² | well below ~9 m/s² physical max |
| `Δa_th` | 0.1–0.3 m/s² | switching threshold |
| `a_bias` (keep-right) | ~0.2–0.3 m/s² | European asymmetric rule |

On a 2+1 passing lane, MOBIL with keep-right bias naturally sends fast vehicles to the passing lane and slow vehicles back — the intended relief mechanism.

---

## 4. Desired-speed distributions (the per-agent sampling)

Platoons emerge from the **spread** of `v0`, not the mean. Icelandic data exists:

### Icelandic empirical data — use this

**Helga Þórhallsdóttir (2016), "Líkan um 85%-hraða á tveggja akreina vegum," MSc, HÍ / Vegagerðin** (https://www.vegagerdin.is/vefur2.nsf/Files/likan_85prosent_hrada/$file/L%C3%ADkan%20um%2085prosent%20hra%C3%B0a%20%C3%A1%20tveggja%20akreina%20vegum.pdf). Free-flow point speeds at 12 sites on two-lane 90 km/h rural roads in SW Iceland:

| Quantity | Value (free-flow passenger cars, 90 km/h roads) |
|---|---|
| Mean speed | **~86–94 km/h** (most sites 90–94) |
| Std deviation | **~6–10 km/h** (majority 7–8) |
| V85 | **~92–102 km/h** |
| Shape | **Approximately normal** (chi-square passes at most sites; mild high-speed tail at some) |

**Recommended sampling (cars):** `v0 ~ Normal(92, 8) km/h`, truncated [70, 120]. Iceland's free-flow spread is relatively tight ⇒ platoons form primarily behind **trucks and genuinely slow drivers**.

- **Slow drivers (<80 km/h):** P ≈ 6–7% with N(92,8); site v_min reached 44–78 km/h. Model ~5–8% of cars as slow.
- **Trucks:** `v0 ~ Normal(83, 5) km/h` (governed fleet), reduced `a`. Heavy share on Ring Road ~10–15% by segment (Vegagerðin ÁDU).
- Corroborating: Vegagerðin reports ~93.3 km/h average summer speed on Þjóðvegur 1.

### Nordic corroboration

Swedish (VTI/Trafikverket) and Norwegian free-flow studies on 90 km/h two-lane roads: normal-ish, sd **8–12 km/h**. Use sd=10 for sensitivity analysis; Icelandic numbers primary.

---

## 5. Existing open-source implementations

### traffic-simulation.de / movsim (JavaScript) — primary reference

- Repo: https://github.com/movsim/traffic-simulation-de — **GPL v3** (copyleft — reimplement the published math rather than copying code if productizing).
- Coverage: vanilla JS, IDM + IIDM + ACC/CAH, MOBIL, ramps, traffic lights, roundabouts (README_intersections), and **bidirectional opposite-traffic overtaking** (README_oppositeTraffic).
- Verdict: most relevant codebase in existence for this project. Reuse the model math; rewrite rendering and corridor/geometry layer.

### MovSim (Java) — cross-check only. SUMO — offline validator

- SUMO models opposite-direction overtaking (https://sumo.dlr.de/docs/Simulation/OppositeDirectionDriving.html) with IDM available; C++/Python, not embeddable. **Use offline to generate reference platoon/PTSF/travel-time distributions for calibration.**
- No mature JS/WASM library beats movsim for this use case. **Build from scratch on the movsim model equations** — the physics is a few hundred lines and custom corridor geometry is needed anyway.

---

## 6. Practical engineering

### Time step & integration

- **Ballistic update** (best precision/cost):
  ```
  v(t+Δt) = v(t) + a*Δt                       // clamp v ≥ 0
  x(t+Δt) = x(t) + v(t)*Δt + 0.5*a*Δt^2
  ```
- **Δt = 0.25 s** (traffic-simulation.de: "any update time steps below 0.5 s essentially lead to the same result" — https://traffic-simulation.de/info/info_IDM.html).
- **Overtaking/lane-change decisions every ~5 steps** (≈1 s sim time) — realistic + big perf win.

### Performance envelope in JS / Web Worker

- O(N) per step with sorted per-lane vehicle lists. N = 3,000–10,000 vehicles: well under 1 ms/step in modern JS.
- Fast-forward: 10k vehicles × 200 steps/s ≈ 2M vehicle-updates/s — comfortable in a single Web Worker.
- **Model in a Web Worker, render on main thread**; transfer positions as transferable `Float32Array` each frame.
- Struct-of-Arrays: `Float32Array` for x, v, v0, lane, type. No per-vehicle objects/GC churn. Per-lane sorted index gives O(1) leader lookup.

### Calibration approach

1. Inputs: per-segment ÁDU flows, heavy %, free-flow `v0` distribution (§4). Hourly flow profiles at corridor entries.
2. Match: **travel times** (segment-level), **counts** at stations, **PTSF/follower density** vs HCM expectation, overtaking rate if data exists.
3. Tune in order of leverage: `v0` spread + slow/truck share → `T` and `g_required` → MOBIL `p`/`Δa_th`. Keep IDM `a`, `b`, `s0` at literature defaults.

---

## 7. Roundabouts and junctions as gap-acceptance nodes

Do NOT build a full network simulator. Each junction/roundabout = **capacity/gap-acceptance point** on the 1-D stream:

- Entry accepted when gap in conflicting stream ≥ critical gap `t_c`, follow-up headway `t_f`. Standard: **`t_c ≈ 4–5 s`, `t_f ≈ 2.5–3 s`** (roundabouts); `t_c ≈ 5–7 s` (stop-controlled crossings).
- Analytic capacity (Harders/HCM):
  ```
  C = q * exp(-q * t_c) / (1 - exp(-q * t_f))     // q = conflicting flow veh/s
  ```
  Implement node as a server with capacity C + queue.
- Even simpler: fixed capacity cap (veh/h) + queue, calibrated to observed throughput.

---

## Recommended model stack

| Layer | Choice |
|---|---|
| Car-following | **IIDM**, IDM params, `delta=4` |
| Integration | Ballistic, **Δt = 0.25 s** |
| Desired speed | `v0 ~ N(92, 8)` cars (truncated), `N(83, 5)` trucks; ~5–8% slow (<80); truck share from ÁDU |
| Overtaking (1+1) | movsim-style gap-acceptance vs oncoming; `g_required(Δv) ≈ 6 + 120/Δv_kmh` s; evaluated every ~5 steps |
| Lane-change (2+1/2+2) | MOBIL: `p=0.35`, `b_safe=4`, `Δa_th=0.2`, keep-right 0.2 |
| Junctions/roundabouts | Gap-acceptance capacity node: `t_c≈4.5 s`, `t_f≈2.8 s` + queue |
| Runtime | SoA Float32Arrays in Web Worker, transferable arrays to renderer |
| Code base | Write from scratch on movsim's published math (GPL avoided); SUMO offline for calibration targets |
| Validation | Travel times + station counts + PTSF/follower density |

**Most important design point:** platooning is *emergent* from (a) a realistically narrow desired-speed distribution with a slow tail (trucks + slow cars) and (b) an oncoming-gap-gated overtaking rule. Get those two right and platoon formation/growth/dissolution fall out for free. Everything else is second-order.
