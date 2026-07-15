/**
 * Umferð microsimulation engine — the `Simulation` class from src/types.ts.
 *
 * Design (research/04 "recommended model stack" + CONTRACTS.md):
 *  - IIDM car-following, ballistic integration, dt = 0.25 s.
 *  - Both directions simulated simultaneously on a 1-D progress axis; per
 *    (direction, lane) sorted index buckets give O(1) leader/follower lookup.
 *  - SoA typed-array storage, recycled slots, no per-vehicle objects in the loop.
 *  - S1 overtaking via oncoming-gap acceptance; MOBIL on multi-lane sections;
 *    junctions as FIFO capacity gates + through-speed zones.
 *
 * Coordinate convention: `pos[i]` is the FRONT-bumper *progress* along the
 * direction of travel (0 at entry, lengthM at exit) for BOTH directions, so
 * "leader = next higher pos in the same bucket" holds uniformly. The public
 * `offsetM` (0 at the Reykjavík end) is derived per direction in snapshot().
 */
import type {
  CorridorModel,
  Scenario,
  CorridorDemand,
  DemandPresetId,
  SimOptions,
  VehicleSnapshot,
  SegmentLiveStats,
  TripRecord,
  SimAggregates,
} from '../types';
import { Rng } from './rng';
import { iidmAccel, CAR, TRUCK } from './iidm';
import { mobilChange } from './mobil';
import {
  shouldStartOvertake,
  SIGHT_M,
  MAX_OVERTAKE_M,
  REMERGE_MARGIN_M,
} from './overtake';
import { ZONE_HALF_M } from './junction';
import { World } from './world';
import { RollingSegStats, percentile, mean } from './stats';

const MIN_DESIRED_MS = 30 / 3.6;
const TRUCK_CAP_MS = 90 / 3.6; // EU limiter, CONTRACTS.md
const FOLLOW_HEADWAY_S = 3;    // PTSF headway threshold
const FOLLOW_SPEED_MARGIN_MS = 4 / 3.6; // v < v0 − 4 km/h
const ROLLING_WINDOW_S = 120;
const ENTRY_CLEAR_M = 8;       // required clear gap ahead of the entry point

interface QueuedSpawn {
  dir: number;
  isTruck: boolean;
  v0base: number;
  intendedTimeS: number;
}

export class Simulation {
  private world: World;
  private rng: Rng;
  private dt: number;
  private demand: CorridorDemand;
  private preset: DemandPresetId;
  private demandScale: number;
  private t = 0;
  private stepCount = 0;
  private lengthM: number;

  // --- SoA vehicle storage ---
  private cap = 0;
  private pos!: Float64Array;
  private spd!: Float64Array;
  private acc!: Float64Array;
  private v0base!: Float64Array; // desired speed (m/s) at the 90 km/h reference
  private truck!: Uint8Array;
  private dir!: Uint8Array;
  private lane!: Uint8Array;
  private overtaking!: Uint8Array;
  private otTarget!: Int32Array;
  private otStart!: Float64Array;
  private grantedLine!: Float64Array;
  private entryTime!: Float64Array;
  private followTime!: Float64Array;
  private alive!: Uint8Array;
  private segCache!: Int32Array;
  private freeSlots: number[] = [];
  private active = 0;

  // buckets[dir*2 + lane] = slot indices sorted ascending by pos
  private buckets: number[][] = [[], [], [], []];

  // spawn scheduling
  private nextArrival: [number, number] = [0, 0];
  private queue: [QueuedSpawn[], QueuedSpawn[]] = [[], []];

  // stats
  private seg!: RollingSegStats;
  private trips: TripRecord[] = [];
  private vehKmTotal = 0;
  private vehKmSeg: Float64Array;

  // snapshot buffers (reused)
  private snapOffset = new Float32Array(0);
  private snapLane = new Uint8Array(0);
  private snapDir = new Uint8Array(0);
  private snapSpeed = new Float32Array(0);
  private snapTruck = new Uint8Array(0);

  constructor(
    model: CorridorModel,
    scenario: Scenario,
    demand: CorridorDemand,
    preset: DemandPresetId,
    opts: SimOptions,
  ) {
    this.world = new World(model, scenario);
    this.lengthM = this.world.lengthM;
    this.rng = new Rng(opts.seed);
    this.dt = opts.dtS ?? 0.25;
    this.demand = demand;
    this.preset = preset;
    this.demandScale = opts.demandScale ?? 1;
    this.t = (opts.startHour ?? 0) * 3600;

    this.seg = new RollingSegStats(this.world.nSeg, ROLLING_WINDOW_S, this.dt);
    this.vehKmSeg = new Float64Array(this.world.nSeg);

    this.grow(4096);

    // seed first arrivals
    this.nextArrival[0] = this.t;
    this.nextArrival[1] = this.t;
  }

  // -------------------------------------------------------------------------
  // Storage management
  // -------------------------------------------------------------------------
  private grow(newCap: number): void {
    const g = <T extends Float64Array | Uint8Array | Int32Array>(old: T | undefined, ctor: any): T => {
      const arr = new ctor(newCap);
      if (old) arr.set(old as any);
      return arr;
    };
    this.pos = g(this.pos, Float64Array);
    this.spd = g(this.spd, Float64Array);
    this.acc = g(this.acc, Float64Array);
    this.v0base = g(this.v0base, Float64Array);
    this.truck = g(this.truck, Uint8Array);
    this.dir = g(this.dir, Uint8Array);
    this.lane = g(this.lane, Uint8Array);
    this.overtaking = g(this.overtaking, Uint8Array);
    this.otTarget = g(this.otTarget, Int32Array);
    this.otStart = g(this.otStart, Float64Array);
    this.grantedLine = g(this.grantedLine, Float64Array);
    this.entryTime = g(this.entryTime, Float64Array);
    this.followTime = g(this.followTime, Float64Array);
    this.alive = g(this.alive, Uint8Array);
    this.segCache = g(this.segCache, Int32Array);
    for (let i = this.cap; i < newCap; i++) this.freeSlots.push(i);
    this.cap = newCap;
  }

  private allocSlot(): number {
    if (this.freeSlots.length === 0) this.grow(this.cap * 2);
    return this.freeSlots.pop()!;
  }

  private vlen(i: number): number {
    return this.truck[i] ? TRUCK.len : CAR.len;
  }

  private offsetOf(i: number): number {
    return this.dir[i] === 0 ? this.pos[i] : this.lengthM - this.pos[i];
  }

  // -------------------------------------------------------------------------
  // Bucket helpers (each bucket kept sorted ascending by pos)
  // -------------------------------------------------------------------------
  private bucketId(dir: number, lane: number): number {
    return dir * 2 + lane;
  }

  private insertSorted(bid: number, slot: number): void {
    const b = this.buckets[bid];
    const p = this.pos[slot];
    let lo = 0;
    let hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pos[b[mid]] < p) lo = mid + 1;
      else hi = mid;
    }
    b.splice(lo, 0, slot);
  }

  private removeFromBucket(bid: number, slot: number): void {
    const b = this.buckets[bid];
    const i = b.indexOf(slot);
    if (i >= 0) b.splice(i, 1);
  }

  /** First slot in bucket with pos > qpos (skips `exclude`); -1 if none. */
  private leaderIn(bid: number, qpos: number, exclude = -1): number {
    const b = this.buckets[bid];
    let lo = 0;
    let hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pos[b[mid]] <= qpos) lo = mid + 1;
      else hi = mid;
    }
    while (lo < b.length && b[lo] === exclude) lo++;
    return lo < b.length ? b[lo] : -1;
  }

  /** Last slot in bucket with pos < qpos; -1 if none. */
  private followerIn(bid: number, qpos: number): number {
    const b = this.buckets[bid];
    let lo = 0;
    let hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pos[b[mid]] < qpos) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1 >= 0 ? b[lo - 1] : -1;
  }

  private resortBucket(bid: number): void {
    // Insertion sort — near-linear on the (almost always) already-sorted array.
    const b = this.buckets[bid];
    const p = this.pos;
    for (let i = 1; i < b.length; i++) {
      const s = b[i];
      const ps = p[s];
      let j = i - 1;
      while (j >= 0 && p[b[j]] > ps) {
        b[j + 1] = b[j];
        j--;
      }
      b[j + 1] = s;
    }
  }

  // -------------------------------------------------------------------------
  // Desired speed
  // -------------------------------------------------------------------------
  private desired(i: number, segIdx: number, offset: number): number {
    let v = this.v0base[i] * this.world.segAdjFactor[segIdx];
    if (this.truck[i] && v > TRUCK_CAP_MS) v = TRUCK_CAP_MS;
    // GRADE (review MAJOR-2) — bounded simplification via grade-dependent
    // desired speed, NOT a gravity term on IIDM accel (with truck a=0.4 a raw
    // −9.81·g% term diverges). gradePct is signed in the FWD direction, so the
    // uphill grade experienced by a rev vehicle is its negation. Downhill: no
    // change (drivers hold their desired speed).
    // ASSUMPTION: constants calibrated so trucks climb 8.1% (Hvalfjarðargöng)
    // at ≈40–45 km/h (limiter-capped 90 × 0.55 ≈ 45; heavier losses bounded at
    // ×0.45) and cars lose ≈10% at 8% grade (bounded at ×0.8).
    const g = this.dir[i] === 0
      ? this.world.segGrade[segIdx]
      : -this.world.segGrade[segIdx];
    if (g > 0) {
      v *= this.truck[i]
        ? Math.max(0.45, 1 - 0.055 * g)
        : Math.max(0.8, 1 - 0.012 * g);
    }
    if (v < MIN_DESIRED_MS) v = MIN_DESIRED_MS;
    // Through-speed zones (±80 m of a gate junction).
    const gates = this.world.gates;
    for (let g = 0; g < gates.length; g++) {
      const gt = gates[g];
      if (!gt.isGate) continue;
      if (Math.abs(offset - gt.offsetM) < ZONE_HALF_M && gt.throughMs < v) {
        v = gt.throughMs;
      }
    }
    return v;
  }

  private paccel(f: number, lslot: number, vdes: number): number {
    const p = this.truck[f] ? TRUCK : CAR;
    const vf = this.spd[f];
    if (lslot < 0) {
      return iidmAccel(vf, vf, Infinity, vdes, p.T, p.a, p.b, p.s0, p.delta);
    }
    const gap = this.pos[lslot] - this.vlen(lslot) - this.pos[f];
    return iidmAccel(vf, this.spd[lslot], gap, vdes, p.T, p.a, p.b, p.s0, p.delta);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  get timeS(): number {
    return this.t;
  }

  step(): void {
    const dt = this.dt;
    this.seg.rotate();
    this.doSpawns();
    this.drainQueues();
    this.computeAccels();
    if (this.stepCount % 5 === 0) this.laneDecisions();
    this.integrate(dt);
    this.enforceGaps();
    this.handleExits();
    // No per-step re-sort needed: inserts keep buckets sorted, exits splice in
    // place, and IIDM + enforceGaps keep in-lane gaps ≥ 0 so vehicles never
    // pass within a lane. resortBucket() remains as a safety net for tests.
    this.t += dt;
    this.stepCount++;
  }

  stepHours(h: number): void {
    const n = Math.round((h * 3600) / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  // -------------------------------------------------------------------------
  // Spawning (Poisson per direction, virtual entry queue)
  // -------------------------------------------------------------------------
  private lambda(dir: number, hour: number): number {
    const profile = this.demand.presets[this.preset];
    const shares = dir === 0 ? profile.hourSharesFwd : profile.hourSharesRev;
    const h = ((hour % 24) + 24) % 24;
    const dayTotal = this.demand.aadtRef * profile.dayFactor * this.demandScale;
    return (dayTotal * shares[h | 0]) / 3600; // veh/s
  }

  private doSpawns(): void {
    for (let d = 0; d < 2; d++) {
      let guard = 0;
      while (this.t >= this.nextArrival[d] && guard++ < 1000) {
        // MINOR-2 fix: λ is recomputed from the hour of EACH arrival draw, so
        // a catch-up loop crossing an hour boundary uses that hour's rate
        // (previously λ was computed once from the current step's hour).
        const hour = Math.floor(this.nextArrival[d] / 3600);
        const lam = this.lambda(d, hour);
        if (lam <= 1e-9) {
          // No demand this hour: jump to the next hour boundary.
          this.nextArrival[d] = (hour + 1) * 3600;
          continue;
        }
        const isTruck = this.rng.next() < this.demand.truckShare;
        const v0 = this.sampleV0(isTruck);
        const spawn: QueuedSpawn = {
          dir: d,
          isTruck,
          v0base: v0,
          intendedTimeS: this.nextArrival[d],
        };
        this.queue[d].push(spawn);
        this.nextArrival[d] += this.rng.exponential(lam);
      }
    }
  }

  private sampleV0(isTruck: boolean): number {
    // research/04 §4 + CONTRACTS.md. Base sample is at the 90 km/h reference.
    if (isTruck) {
      return this.rng.truncNormal(83, 5, 70, 90) / 3.6;
    }
    return this.rng.truncNormal(92, 8, 70, 120) / 3.6;
  }

  private entryClear(dir: number): boolean {
    // Front bumper enters at pos 0. Need clear space ahead in lane 0.
    // BLOCKER fix: leaderIn() finds pos STRICTLY > 0, so a vehicle sitting AT
    // pos 0 (just injected, or stopped there by spillback) was invisible and
    // queued vehicles were injected on top of it. The entry bucket is sorted
    // ascending, so bucket[0] is the minimum-pos vehicle regardless of whether
    // its pos is 0: require its REAR (pos − len) to clear the entry point by
    // s0 + ENTRY_CLEAR_M, which also guarantees injection never creates a
    // bumper gap < s0.
    const b = this.buckets[this.bucketId(dir, 0)];
    if (b.length === 0) return true;
    const first = b[0];
    const rear = this.pos[first] - this.vlen(first);
    return rear > CAR.s0 + ENTRY_CLEAR_M;
  }

  private drainQueues(): void {
    for (let d = 0; d < 2; d++) {
      const q = this.queue[d];
      while (q.length > 0 && this.entryClear(d)) {
        const s = q.shift()!;
        this.inject(s);
      }
    }
  }

  private inject(s: QueuedSpawn): void {
    const i = this.allocSlot();
    this.pos[i] = 0;
    const segIdx = this.world.segIndexAt(s.dir === 0 ? 0 : this.lengthM);
    this.v0base[i] = s.v0base;
    this.truck[i] = s.isTruck ? 1 : 0;
    this.dir[i] = s.dir;
    this.lane[i] = 0;
    this.overtaking[i] = 0;
    this.otTarget[i] = -1;
    this.otStart[i] = 0;
    this.grantedLine[i] = -1;
    this.entryTime[i] = s.intendedTimeS; // virtual-queue wait counts toward travel
    this.followTime[i] = 0;
    this.alive[i] = 1;
    this.segCache[i] = segIdx;
    const vdes = this.desired(i, segIdx, s.dir === 0 ? 0 : this.lengthM);
    // Enter near desired speed but not above the entry leader's speed
    // (bucket[0] = minimum-pos vehicle; see entryClear).
    let v = Math.min(vdes, this.world.segLimitMs[segIdx]);
    const eb = this.buckets[this.bucketId(s.dir, 0)];
    if (eb.length > 0) v = Math.min(v, this.spd[eb[0]]);
    this.spd[i] = Math.max(0, v);
    this.acc[i] = 0;
    this.insertSorted(this.bucketId(s.dir, 0), i);
    this.active++;
  }

  // -------------------------------------------------------------------------
  // Acceleration pass (IIDM + junction gates)
  // -------------------------------------------------------------------------
  private computeAccels(): void {
    for (let b = 0; b < 4; b++) {
      const bucket = this.buckets[b];
      const dir = b >> 1;
      const lane = b & 1;
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        const offset = this.offsetOf(i);
        const segIdx = this.world.segIndexAt(offset);
        this.segCache[i] = segIdx;
        const vdes = this.desired(i, segIdx, offset);

        // Leader in own bucket. Because the bucket is sorted ascending by pos
        // and vehicles in a lane never pass each other (IIDM keeps gaps > 0),
        // the leader is simply the next slot in the bucket — no search needed.
        let acc: number;
        if (this.overtaking[i]) {
          acc = this.overtakerAccel(i, vdes);
        } else {
          const lead = k + 1 < bucket.length ? bucket[k + 1] : -1;
          acc = this.paccel(i, lead, vdes);
          this.accumFollowing(i, lead, vdes);
        }

        // Junction FIFO gate.
        const gAcc = this.gateAccel(i, dir, lane, vdes);
        if (gAcc < acc) acc = gAcc;

        this.acc[i] = acc;
      }
    }
  }

  private accumFollowing(i: number, lead: number, vdes: number): void {
    if (lead < 0) return;
    const gap = this.pos[lead] - this.vlen(lead) - this.pos[i];
    const v = this.spd[i];
    const th = gap / Math.max(v, 0.1);
    if (th < FOLLOW_HEADWAY_S && v < vdes - FOLLOW_SPEED_MARGIN_MS) {
      this.followTime[i] += this.dt;
    }
  }

  private overtakerAccel(i: number, vdes: number): number {
    // Overtaker occupies lane 1; oncoming ignore it and it ignores oncoming
    // (documented simplification). An overtake is only STARTED when a merge gap
    // exists ahead of the target (see maybeStartOvertake), so passing the
    // target itself is unobstructed — but the overtaker must still respect
    // (a) another overtaker already ahead in lane 1, and (b) the lane-0 vehicle
    // BEYOND its target (the merge-slot leader), or it could overrun it while
    // off-lane if that vehicle brakes. While the overtake is active the target
    // is excluded from (b); after an abort (otTarget = −1, see maybeRemerge)
    // nothing is excluded, so the vehicle falls in behind lane-0 traffic and
    // waits for a safe slot.
    const dir = this.dir[i];
    const target = this.otTarget[i];
    const lead1 = this.leaderIn(this.bucketId(dir, 1), this.pos[i], i);
    const lead0 = this.leaderIn(this.bucketId(dir, 0), this.pos[i], target);
    let lead = -1;
    if (lead1 >= 0 && lead0 >= 0) lead = this.pos[lead1] < this.pos[lead0] ? lead1 : lead0;
    else lead = lead1 >= 0 ? lead1 : lead0;
    return this.paccel(i, lead, vdes);
  }

  private gateAccel(i: number, dir: number, lane: number, vdes: number): number {
    const gates = this.world.gates;
    const pos = this.pos[i];
    // next gate ahead
    let bestLine = Infinity;
    let bestG = -1;
    for (let g = 0; g < gates.length; g++) {
      const gt = gates[g];
      if (!gt.isGate) continue;
      const line = dir === 0 ? gt.lineFwd : gt.lineRev;
      if (line > pos && line < bestLine) {
        bestLine = line;
        bestG = g;
      }
    }
    if (bestG < 0) return Infinity;

    // Front-of-queue? (no same-dir vehicle in any lane between me and the line)
    const l0 = this.leaderIn(this.bucketId(dir, 0), pos, i);
    const l1 = this.leaderIn(this.bucketId(dir, 1), pos, i);
    if (l0 >= 0 && this.pos[l0] < bestLine) return Infinity;
    if (l1 >= 0 && this.pos[l1] < bestLine) return Infinity;

    const gt = gates[bestG];
    if (this.grantedLine[i] === bestLine) return Infinity; // already released
    if (this.t >= gt.nextService[dir]) {
      // Server free → grant, serialize the next release.
      gt.nextService[dir] = this.t + gt.headwayS;
      this.grantedLine[i] = bestLine;
      return Infinity;
    }
    // Must wait: virtual stopped obstacle at the stop line.
    const gap = bestLine - pos;
    const p = this.truck[i] ? TRUCK : CAR;
    return iidmAccel(this.spd[i], 0, gap, vdes, p.T, p.a, p.b, p.s0, p.delta);
  }

  // -------------------------------------------------------------------------
  // Lane-change decisions (overtaking on S1, MOBIL on multilane) — every 5 steps
  // -------------------------------------------------------------------------
  private laneDecisions(): void {
    // Snapshot slot lists first (we mutate buckets during iteration).
    for (let dir = 0; dir < 2; dir++) {
      // Iterate a copy since buckets change.
      const lane0 = this.buckets[this.bucketId(dir, 0)].slice();
      const lane1 = this.buckets[this.bucketId(dir, 1)].slice();

      // Re-merge / overtaking handling for lane-1 vehicles.
      for (const i of lane1) {
        if (!this.alive[i]) continue;
        const offset = this.offsetOf(i);
        const segIdx = this.world.segIndexAt(offset);
        if (this.overtaking[i]) {
          this.maybeRemerge(i, segIdx);
        } else {
          // MOBIL passing-lane vehicle: consider returning right, or forced merge.
          if (this.world.lanesForDir(segIdx, dir) < 2) {
            this.forceMerge(i, dir);
          } else {
            this.mobilEval(i, dir, segIdx, /*fromLane*/ 1);
          }
        }
      }

      // Lane-0 vehicles: overtaking (S1) or MOBIL to passing lane.
      for (const i of lane0) {
        if (!this.alive[i] || this.overtaking[i]) continue;
        const offset = this.offsetOf(i);
        const segIdx = this.world.segIndexAt(offset);
        if (this.world.segIsS1[segIdx]) {
          if (this.world.segOvertake[segIdx]) this.maybeStartOvertake(i, dir, segIdx);
        } else if (this.world.lanesForDir(segIdx, dir) >= 2) {
          this.mobilEval(i, dir, segIdx, /*fromLane*/ 0);
        }
      }
    }
  }

  private maybeStartOvertake(i: number, dir: number, segIdx: number): void {
    const lead = this.leaderIn(this.bucketId(dir, 0), this.pos[i], i);
    if (lead < 0) return;
    const gap = this.pos[lead] - this.vlen(lead) - this.pos[i];
    if (gap < 0) return;
    // Only overtake if a real merge gap exists AHEAD of the target — i.e. don't
    // pull out into a dense platoon you can't re-enter. This makes the frontmost
    // follower (right behind the slow leader with open road ahead) overtake, and
    // platoons discharge one vehicle at a time, as on a real 1+1 road.
    // DOCUMENTED CONSEQUENCE: multi-vehicle passes are never attempted — a
    // two-truck convoy running nose-to-tail is not overtaken in one maneuver;
    // the follower waits until the convoy spreads enough to slot in between
    // (or forever, if it never does). Real drivers occasionally double-pass;
    // we accept the conservative bias.
    const targetLead = this.leaderIn(this.bucketId(dir, 0), this.pos[lead], lead);
    const mergeGap = targetLead >= 0
      ? this.pos[targetLead] - this.vlen(targetLead) - this.pos[lead]
      : Infinity;
    if (mergeGap < this.vlen(i) + 2 * CAR.s0 + REMERGE_MARGIN_M) return;
    const offset = this.offsetOf(i);
    const vdes = this.desired(i, segIdx, offset);
    const onc = this.nearestOncoming(i, dir);
    const ok = shouldStartOvertake({
      ownSpeed: this.spd[i],
      ownV0: vdes,
      leaderSpeed: this.spd[lead],
      gapM: gap,
      leaderLen: this.vlen(lead),
      s0: CAR.s0,
      segLimitMs: this.world.segLimitMs[segIdx],
      oncomingDistM: onc ? onc.dist : null,
      oncomingSpeed: onc ? onc.speed : 0,
    });
    if (!ok) return;
    // Lane-1 insertion safety: several vehicles may be overtaking concurrently
    // (and an aborted overtaker may be braking hard in lane 1). Require a
    // physical slot with a 1 s closing-speed buffer on both sides, or the
    // pull-out itself would create an overlap no car-following can undo.
    const bid1 = this.bucketId(dir, 1);
    const l1lead = this.leaderIn(bid1, this.pos[i]);
    const l1foll = this.followerIn(bid1, this.pos[i]);
    if (l1lead >= 0) {
      const g1 = this.pos[l1lead] - this.vlen(l1lead) - this.pos[i];
      const closing = Math.max(0, this.spd[i] - this.spd[l1lead]);
      if (g1 < CAR.s0 + closing) return;
    }
    if (l1foll >= 0) {
      const g1 = this.pos[i] - this.vlen(i) - this.pos[l1foll];
      const closing = Math.max(0, this.spd[l1foll] - this.spd[i]);
      if (g1 < CAR.s0 + closing) return;
    }
    // Move to lane 1 (oncoming lane), mark overtaking.
    this.removeFromBucket(this.bucketId(dir, 0), i);
    this.lane[i] = 1;
    this.overtaking[i] = 1;
    this.otTarget[i] = lead;
    this.otStart[i] = this.pos[i];
    this.insertSorted(this.bucketId(dir, 1), i);
  }

  /** Minimum clearance (m) on both sides required to drop into lane 0. */
  private static readonly MERGE_EPS_M = 0.5;

  /** True if slot i can merge into lane 0 at its current pos without creating
   *  a negative bumper gap on either side. Requires a 1 s closing-speed buffer
   *  beyond the bare clearance, or a faster neighbour could not brake in time
   *  and gaps would go negative before IIDM reacts. */
  private mergeSlotFree(i: number, dir: number): boolean {
    const bid0 = this.bucketId(dir, 0);
    const lead = this.leaderIn(bid0, this.pos[i], i);
    const foll = this.followerIn(bid0, this.pos[i]);
    if (lead >= 0) {
      const gap = this.pos[lead] - this.vlen(lead) - this.pos[i];
      const closing = Math.max(0, this.spd[i] - this.spd[lead]);
      if (gap < Simulation.MERGE_EPS_M + closing) return false;
    }
    if (foll >= 0) {
      const gap = this.pos[i] - this.vlen(i) - this.pos[foll];
      const closing = Math.max(0, this.spd[foll] - this.spd[i]);
      if (gap < Simulation.MERGE_EPS_M + closing) return false;
    }
    return true;
  }

  private maybeRemerge(i: number, segIdx: number): void {
    const dir = this.dir[i];
    const capped = this.pos[i] - this.otStart[i] > MAX_OVERTAKE_M;
    const mustMerge = this.world.segIsS1[segIdx] === 0 || this.world.segOvertake[segIdx] === 0;
    if ((capped || mustMerge) && this.otTarget[i] >= 0) {
      // Abort the pass: from now on the vehicle follows ALL lane-0 traffic
      // (overtakerAccel no longer excludes the former target), so it drops
      // back and slots in behind whoever is there.
      this.otTarget[i] = -1;
    }
    const target = this.otTarget[i];
    const past = target < 0 || !this.alive[target]
      || (this.pos[i] - this.vlen(i)) > this.pos[target] + CAR.s0 + REMERGE_MARGIN_M;
    if (!past) return;
    // Merge only into a safe slot — never create an overlap. If the slot is
    // occupied, stay in lane 1 (IIDM vs lane-0 leader is already braking us
    // into position) and retry at the next decision tick.
    if (!this.mergeSlotFree(i, dir)) return;
    this.removeFromBucket(this.bucketId(dir, 1), i);
    this.lane[i] = 0;
    this.overtaking[i] = 0;
    this.otTarget[i] = -1;
    this.insertSorted(this.bucketId(dir, 0), i);
  }

  /** Merge a (non-overtaking) passing-lane vehicle right when the passing lane
   *  ends. Gap-safe: if no slot is free it stays in lane 1 until one opens
   *  (its IIDM leader is then the lane-1 leader; on a 1-lane segment lane 1 is
   *  otherwise empty, and oncoming traffic does not interact with it — same
   *  simplification as overtakers). */
  private forceMerge(i: number, dir: number): void {
    if (!this.mergeSlotFree(i, dir)) return;
    this.removeFromBucket(this.bucketId(dir, 1), i);
    this.lane[i] = 0;
    this.overtaking[i] = 0;
    this.insertSorted(this.bucketId(dir, 0), i);
  }

  private mobilEval(i: number, dir: number, segIdx: number, fromLane: number): void {
    const toLane = fromLane === 0 ? 1 : 0;
    const offset = this.offsetOf(i);
    const vdes = this.desired(i, segIdx, offset);
    const bFrom = this.bucketId(dir, fromLane);
    const bTo = this.bucketId(dir, toLane);

    const leadCur = this.leaderIn(bFrom, this.pos[i], i);
    const followCur = this.followerIn(bFrom, this.pos[i]);
    const leadTar = this.leaderIn(bTo, this.pos[i]);
    const followTar = this.followerIn(bTo, this.pos[i]);

    const aCur = this.paccel(i, leadCur, vdes);
    const aTilde = this.paccel(i, leadTar, vdes);

    const anCur = followTar >= 0
      ? this.paccel(followTar, leadTar, this.desiredFor(followTar))
      : 0;
    const anTilde = followTar >= 0
      ? this.paccel(followTar, i, this.desiredFor(followTar))
      : 0;
    const aoCur = followCur >= 0
      ? this.paccel(followCur, i, this.desiredFor(followCur))
      : 0;
    const aoTilde = followCur >= 0
      ? this.paccel(followCur, leadCur, this.desiredFor(followCur))
      : 0;

    const change = mobilChange({
      aCur, aTilde, anCur, anTilde, aoCur, aoTilde,
      toLeft: toLane === 1,
    });
    if (!change) return;
    this.removeFromBucket(bFrom, i);
    this.lane[i] = toLane;
    this.insertSorted(bTo, i);
  }

  private desiredFor(i: number): number {
    const offset = this.offsetOf(i);
    return this.desired(i, this.world.segIndexAt(offset), offset);
  }

  /** Nearest oncoming vehicle physically ahead within sight (S1 lane 0 opp dir). */
  private nearestOncoming(i: number, dir: number): { dist: number; speed: number } | null {
    const offset = this.offsetOf(i);
    const opp = dir === 0 ? 1 : 0;
    // For opp dir, offset_j = length - pos_j (opp) if opp==1, or pos_j if opp==0.
    // Nearest ahead = closest opp vehicle with offset_j > offset (dir 0) or < offset (dir 1).
    let best: number | null = null;
    if (dir === 0) {
      // opp = 1, offset_j = length - pos_j ; ahead ⇒ offset_j > offset ⇒ pos_j < length - offset
      const slot = this.followerIn(this.bucketId(1, 0), this.lengthM - offset);
      if (slot >= 0) {
        const offJ = this.lengthM - this.pos[slot];
        const d = offJ - offset;
        if (d > 0 && d < SIGHT_M) best = slot;
      }
    } else {
      // opp = 0, offset_j = pos_j ; ahead ⇒ offset_j < offset ⇒ pos_j < offset
      const slot = this.followerIn(this.bucketId(0, 0), offset);
      if (slot >= 0) {
        const offJ = this.pos[slot];
        const d = offset - offJ;
        if (d > 0 && d < SIGHT_M) best = slot;
      }
    }
    if (best == null) return null;
    const offJ = opp === 1 ? this.lengthM - this.pos[best] : this.pos[best];
    const dist = dir === 0 ? offJ - offset : offset - offJ;
    return { dist, speed: this.spd[best] };
  }

  // -------------------------------------------------------------------------
  // Integration (ballistic) + stats sampling
  // -------------------------------------------------------------------------
  private integrate(dt: number): void {
    for (let b = 0; b < 4; b++) {
      const bucket = this.buckets[b];
      const dir = b >> 1;
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        const v = this.spd[i];
        let a = this.acc[i];
        // ballistic; clamp so v doesn't go negative within the step.
        let dx = v * dt + 0.5 * a * dt * dt;
        let vNew = v + a * dt;
        if (vNew < 0) {
          vNew = 0;
          dx = (v * v) / (2 * Math.max(-a, 1e-6)); // distance to stop
          if (dx < 0) dx = 0;
        }
        this.pos[i] += dx;
        this.spd[i] = vNew;
        // vehKm accounting.
        const km = dx / 1000;
        this.vehKmTotal += km;
        const segIdx = this.segCache[i];
        this.vehKmSeg[segIdx] += km;
        // rolling segment speed sample (harmonic mean).
        this.seg.sample(segIdx, dir, vNew > 0.2 ? vNew : 0.2);
      }
    }
  }

  /**
   * Post-integration anti-overlap clamp (per bucket, front to back).
   * With dt = 0.25 s the ballistic update evaluates acceleration once per step,
   * so a hard-braking follower can overshoot the exact IIDM trajectory by
   * centimetres–decimetres and cross its leader's rear bumper. This pass
   * restores the invariant "bumper gap ≥ GAP_EPS" by clamping the follower's
   * position/speed to the leader's rear; corrections are cm-scale in normal
   * operation (vehKm accounting deliberately ignores them).
   */
  private enforceGaps(): void {
    const EPS = 0.02;
    for (let b = 0; b < 4; b++) {
      const bucket = this.buckets[b];
      for (let k = bucket.length - 2; k >= 0; k--) {
        const lead = bucket[k + 1];
        const i = bucket[k];
        const limit = this.pos[lead] - this.vlen(lead) - EPS;
        if (this.pos[i] > limit) {
          this.pos[i] = limit;
          if (this.spd[i] > this.spd[lead]) this.spd[i] = this.spd[lead];
        }
      }
    }
  }

  private handleExits(): void {
    for (let b = 0; b < 4; b++) {
      const bucket = this.buckets[b];
      const dir = b >> 1;
      for (let k = bucket.length - 1; k >= 0; k--) {
        const i = bucket[k];
        if (this.pos[i] < this.lengthM) continue;
        // exit
        this.trips.push({
          dir: dir as 0 | 1,
          entryTimeS: this.entryTime[i],
          travelTimeS: this.t + this.dt - this.entryTime[i],
          isTruck: this.truck[i] === 1,
          followingTimeS: this.followTime[i],
        });
        bucket.splice(k, 1);
        this.alive[i] = 0;
        this.freeSlots.push(i);
        this.active--;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Outputs
  // -------------------------------------------------------------------------
  snapshot(): VehicleSnapshot {
    const n = this.active;
    if (this.snapOffset.length < n) {
      this.snapOffset = new Float32Array(n);
      this.snapLane = new Uint8Array(n);
      this.snapDir = new Uint8Array(n);
      this.snapSpeed = new Float32Array(n);
      this.snapTruck = new Uint8Array(n);
    }
    let w = 0;
    for (let b = 0; b < 4; b++) {
      const bucket = this.buckets[b];
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        this.snapOffset[w] = this.offsetOf(i);
        this.snapLane[w] = this.lane[i];
        this.snapDir[w] = this.dir[i];
        this.snapSpeed[w] = this.spd[i];
        this.snapTruck[w] = this.truck[i];
        w++;
      }
    }
    return {
      count: w,
      offsetM: this.snapOffset,
      lane: this.snapLane,
      dir: this.snapDir,
      speedMs: this.snapSpeed,
      isTruck: this.snapTruck,
    };
  }

  segmentStats(): SegmentLiveStats[] {
    const out: SegmentLiveStats[] = [];
    for (let s = 0; s < this.world.nSeg; s++) {
      out.push({
        segmentId: this.world.segIds[s],
        avgSpeedFwd: this.seg.harmonicKmh(s, 0),
        avgSpeedRev: this.seg.harmonicKmh(s, 1),
        vehCount: this.seg.vehCount(s),
      });
    }
    return out;
  }

  aggregates(): SimAggregates {
    // MAJOR-1 fix: use the World's adoption-adjusted free-flow time (the same
    // desired speeds the vehicles actually target), not the pure freeFlowTime()
    // on posted limits — otherwise a raised-limit scenario reports phantom
    // delay in pure free flow. Identical to freeFlowTime() when no override
    // raises a limit.
    const ff0 = this.world.freeFlowTimeS(0);
    const ff1 = this.world.freeFlowTimeS(1);

    const byDir: [TripRecord[], TripRecord[]] = [[], []];
    for (const tr of this.trips) byDir[tr.dir].push(tr);

    const dirStats = (list: TripRecord[], ff: number) => {
      const tt = list.map((t) => t.travelTimeS);
      const m = tt.length ? mean(tt) : ff;
      let followSum = 0;
      let travelSum = 0;
      for (const t of list) {
        followSum += t.followingTimeS;
        travelSum += t.travelTimeS;
      }
      return {
        meanTT: m,
        p50: tt.length ? percentile(tt, 0.5) : ff,
        p85: tt.length ? percentile(tt, 0.85) : ff,
        delay: (tt.length ? m : ff) - ff,
        ptsf: travelSum > 0 ? followSum / travelSum : 0,
      };
    };

    const f = dirStats(byDir[0], ff0);
    const r = dirStats(byDir[1], ff1);

    const vehKmBySegment: Record<string, number> = {};
    for (let s = 0; s < this.world.nSeg; s++) {
      vehKmBySegment[this.world.segIds[s]] = this.vehKmSeg[s];
    }

    return {
      simulatedHours: this.t / 3600,
      trips: this.trips.slice(),
      vehKm: this.vehKmTotal,
      vehKmBySegment,
      freeFlowTravelTimeS: { fwd: ff0, rev: ff1 },
      meanTravelTimeS: { fwd: f.meanTT, rev: r.meanTT },
      p50TravelTimeS: { fwd: f.p50, rev: r.p50 },
      p85TravelTimeS: { fwd: f.p85, rev: r.p85 },
      meanDelayS: { fwd: f.delay, rev: r.delay },
      ptsf: { fwd: f.ptsf, rev: r.ptsf },
    };
  }
}
