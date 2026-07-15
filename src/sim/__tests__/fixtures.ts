/**
 * Synthetic CorridorModel / CorridorDemand fixtures for engine tests.
 * Deliberately independent of data/*.json (built in parallel).
 *
 * Demand trick: aadtRef=1 and hourShares expressed directly as veh/h, since the
 * engine computes λ = aadtRef · dayFactor · share / 3600 (veh/s). So a share of
 * 500 with aadtRef=1, dayFactor=1 ⇒ 500 veh/h — convenient for controlled tests.
 */
import type {
  CorridorModel,
  CorridorDemand,
  SegmentConfig,
  JunctionDef,
  Scenario,
} from '../../types';

export const emptyScenario: Scenario = { segmentOverrides: [], junctionOverrides: [] };

export function singleSegCorridor(
  lengthM: number,
  config: SegmentConfig,
  opts: {
    overtaking?: boolean; barrier?: boolean; maxspeed?: number;
    junctions?: JunctionDef[]; gradePct?: number;
  } = {},
): CorridorModel {
  const barrier = opts.barrier ?? config !== 'S1';
  return {
    id: 'north',
    name: 'synthetic',
    ref: '1',
    lengthM,
    centerline: [[0, 0], [0, 1]],
    vertexOffsetsM: [0, lengthM],
    segments: [{
      id: 'seg0',
      name: 'seg0',
      fromM: 0,
      toM: lengthM,
      config,
      maxspeedKmh: opts.maxspeed ?? 90,
      gradePct: opts.gradePct ?? 0,
      overtakingAllowed: opts.overtaking ?? false,
      barrier,
      upgradable: true,
      aadt2025: 6000,
      sdu2025: 7000,
      vdu2025: 5000,
    }],
    junctions: opts.junctions ?? [],
    stations: [{ id: 'st', name: 'mid', offsetM: lengthM / 2, hasSpeed: true }],
  };
}

export function twoSegCorridor(): CorridorModel {
  return {
    id: 'north',
    name: 'two-seg',
    ref: '1',
    lengthM: 10000,
    centerline: [[0, 0], [0, 1]],
    vertexOffsetsM: [0, 10000],
    segments: [
      {
        id: 'a', name: 'a', fromM: 0, toM: 5000, config: 'S1', maxspeedKmh: 90,
        gradePct: 0, overtakingAllowed: true, barrier: false, upgradable: true,
        aadt2025: 6000, sdu2025: 7000, vdu2025: 5000,
      },
      {
        id: 'b', name: 'b', fromM: 5000, toM: 10000, config: 'S1', maxspeedKmh: 72,
        gradePct: 0, overtakingAllowed: false, barrier: false, upgradable: true,
        aadt2025: 6000, sdu2025: 7000, vdu2025: 5000,
      },
    ],
    junctions: [],
    stations: [],
  };
}

export function makeDemand(fwdVph: number, revVph: number, truckShare: number): CorridorDemand {
  const f = new Array(24).fill(fwdVph);
  const r = new Array(24).fill(revVph);
  const profile = { hourSharesFwd: f, hourSharesRev: r, dayFactor: 1 };
  return {
    corridorId: 'north',
    aadtRef: 1,
    truckShare,
    presets: {
      typicalWeekday: profile,
      fridaySummer: profile,
      sundayReturn: profile,
    },
  };
}

export function roundabout(offsetM: number, conflictingVph: number): JunctionDef {
  return {
    id: 'rbt',
    name: 'roundabout',
    offsetM,
    type: 'roundabout',
    throughSpeedKmh: 30,
    conflictingVph,
    upgradable: true,
  };
}

/**
 * Collision check on the PROGRESS axis: within each direction+lane group,
 * consecutive vehicles must keep a non-negative bumper-to-bumper gap.
 * Snapshot offsets are Reykjavík-anchored, so rev progress = lengthM − offset;
 * the leader is the next-higher progress and it is the LEADER's length that
 * separates its front bumper (= its progress coordinate) from its rear.
 * `lengthM` only shifts rev progress by a constant that cancels in the gap
 * differences, so it may be omitted; it is accepted for readability.
 * Returns the worst (most negative) gap.
 */
export function worstGap(snap: {
  count: number; offsetM: Float32Array; lane: Uint8Array; dir: Uint8Array; isTruck: Uint8Array;
}, lengthM = 0): number {
  const groups = new Map<number, { prog: number; len: number }[]>();
  for (let i = 0; i < snap.count; i++) {
    const key = snap.dir[i] * 2 + snap.lane[i];
    const prog = snap.dir[i] === 0 ? snap.offsetM[i] : lengthM - snap.offsetM[i];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ prog, len: snap.isTruck[i] ? 14 : 5 });
  }
  let worst = Infinity;
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.prog - b.prog);
    for (let k = 0; k < arr.length - 1; k++) {
      const follower = arr[k];
      const leader = arr[k + 1];
      const gap = leader.prog - leader.len - follower.prog; // bumper-to-bumper
      if (gap < worst) worst = gap;
    }
  }
  return worst === Infinity ? 999 : worst;
}
