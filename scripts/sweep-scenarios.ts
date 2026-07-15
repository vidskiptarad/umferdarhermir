/** Shared scenario definitions for the sweep + report. */
import type { CorridorId, CorridorModel, Scenario, SegmentDef } from '../src/types';

export const isTunnel = (s: SegmentDef) => s.upgradeHint === 'tunnel-bore-2';
export const isOlfus = (s: SegmentDef) => s.upgradeHint === 'fourth-lane';
export const isS21 = (s: SegmentDef) => s.config === 'S21F' || s.config === 'S21R';
export const rural = (s: SegmentDef) => s.maxspeedKmh >= 80;

function d2(segs: SegmentDef[], speed?: number): Scenario {
  return {
    segmentOverrides: segs.map((s) => ({ segmentId: s.id, config: 'D2' as const, maxspeedKmh: speed })),
    junctionOverrides: [],
  };
}
function allJunctions(model: CorridorModel) {
  return model.junctions
    .filter((j) => j.upgradable && j.type !== 'grade-separated')
    .map((j) => ({ junctionId: j.id, type: 'grade-separated' as const }));
}
function full(model: CorridorModel, speed110: boolean): Scenario {
  return {
    segmentOverrides: model.segments
      .filter((s) => s.upgradable)
      .map((s) => ({
        segmentId: s.id,
        config: 'D2' as const,
        maxspeedKmh: speed110 && rural(s) ? 110 : undefined,
      })),
    junctionOverrides: allJunctions(model),
  };
}

export function scenariosFor(cid: CorridorId, model: CorridorModel): Record<string, Scenario> {
  const segs = model.segments;
  if (cid === 'north') {
    return {
      baseline: { segmentOverrides: [], junctionOverrides: [] },
      'kjalarnes-d2': d2(segs.filter((s) => isS21(s) && !isTunnel(s) && s.upgradable)),
      tunnel2: d2(segs.filter(isTunnel)),
      'hvalfj-borgarnes-d2': d2(segs.filter((s) => s.config === 'S1' && !isTunnel(s) && s.upgradable)),
      'all-d2-90': full(model, false),
      'all-d2-110': full(model, true),
      // Signs-only: 110 km/h on segments that ALREADY have 2+2 or 2+1 in the
      // baseline network (no construction) — analogous to kef '110'.
      '110-existing': {
        segmentOverrides: segs
          .filter((s) => (s.config === 'D2' || isS21(s)) && s.upgradable && rural(s) && !isTunnel(s))
          .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
        junctionOverrides: [],
      },
    };
  }
  if (cid === 'south') {
    return {
      baseline: { segmentOverrides: [], junctionOverrides: [] },
      'olfus-4th': d2(segs.filter(isOlfus)),
      'hellisheidi-d2': d2(segs.filter((s) => isS21(s) && !isOlfus(s) && s.upgradable)),
      'all-d2-90': full(model, false),
      'all-d2-110': full(model, true),
      // Signs-only: 110 km/h on segments that ALREADY have 2+2 or 2+1 in the
      // baseline network (no construction) — analogous to kef '110'.
      '110-existing': {
        segmentOverrides: segs
          .filter((s) => (s.config === 'D2' || isS21(s)) && s.upgradable && rural(s) && !isTunnel(s))
          .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
        junctionOverrides: [],
      },
    };
  }
  return {
    baseline: { segmentOverrides: [], junctionOverrides: [] },
    '110': {
      segmentOverrides: segs
        .filter((s) => s.config === 'D2' && s.upgradable && rural(s))
        .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
      junctionOverrides: [],
    },
    junctions: { segmentOverrides: [], junctionOverrides: allJunctions(model) },
    both: {
      segmentOverrides: segs
        .filter((s) => s.config === 'D2' && s.upgradable && rural(s))
        .map((s) => ({ segmentId: s.id, maxspeedKmh: 110 })),
      junctionOverrides: allJunctions(model),
    },
  };
}

/** Kilometres of new carriageway (config change) and of speed-only change. */
export function kmUpgraded(model: CorridorModel, sc: Scenario): { rebuildKm: number; speedOnlyKm: number } {
  let rebuildKm = 0;
  let speedOnlyKm = 0;
  for (const o of sc.segmentOverrides) {
    const seg = model.segments.find((s) => s.id === o.segmentId)!;
    const km = (seg.toM - seg.fromM) / 1000;
    if (o.config && o.config !== seg.config) rebuildKm += km;
    else if (o.maxspeedKmh && o.maxspeedKmh !== seg.maxspeedKmh) speedOnlyKm += km;
  }
  return { rebuildKm, speedOnlyKm };
}
