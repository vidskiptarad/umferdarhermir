import type {
  CorridorId,
  CorridorModel,
  Scenario,
  SegmentConfig,
  SegmentDef,
} from '@/types';

export const EMPTY_SCENARIO: Scenario = { segmentOverrides: [], junctionOverrides: [] };

export function scenarioHash(s: Scenario): string {
  const seg = [...s.segmentOverrides]
    .sort((a, b) => a.segmentId.localeCompare(b.segmentId))
    .map((o) => `${o.segmentId}:${o.config ?? ''}:${o.maxspeedKmh ?? ''}`)
    .join('|');
  const jn = [...s.junctionOverrides]
    .sort((a, b) => a.junctionId.localeCompare(b.junctionId))
    .map((o) => o.junctionId)
    .join('|');
  return `${seg}#${jn}#${s.speedLimitAdoption ?? 0.7}`;
}

export function isEmptyScenario(s: Scenario): boolean {
  return s.segmentOverrides.length === 0 && s.junctionOverrides.length === 0;
}

export function getOverride(s: Scenario, segmentId: string) {
  return s.segmentOverrides.find((o) => o.segmentId === segmentId);
}

/** Effective config/speed for a segment under a scenario. */
export function effective(seg: SegmentDef, s: Scenario): { config: SegmentConfig; maxspeedKmh: number } {
  const o = getOverride(s, segmentId(seg));
  return {
    config: o?.config ?? seg.config,
    maxspeedKmh: o?.maxspeedKmh ?? seg.maxspeedKmh,
  };
}
function segmentId(seg: SegmentDef) {
  return seg.id;
}

function upsert(s: Scenario, segId: string, patch: { config?: SegmentConfig; maxspeedKmh?: number }): Scenario {
  const rest = s.segmentOverrides.filter((o) => o.segmentId !== segId);
  const existing = getOverride(s, segId);
  const merged = { segmentId: segId, ...existing, ...patch };
  // drop no-op overrides
  if (merged.config === undefined && merged.maxspeedKmh === undefined) {
    return { ...s, segmentOverrides: rest };
  }
  return { ...s, segmentOverrides: [...rest, merged] };
}

/** Toggle a segment to 2+2 (or back to its base config). */
export function toggleD2(s: Scenario, seg: SegmentDef): Scenario {
  const o = getOverride(s, seg.id);
  if (o?.config === 'D2') {
    // revert config; also drop 110 if base config can't carry it
    const next = upsert(s, seg.id, { config: undefined, maxspeedKmh: o.maxspeedKmh });
    if (seg.config !== 'D2' && o.maxspeedKmh === 110) return upsert(next, seg.id, { maxspeedKmh: undefined });
    return next;
  }
  return upsert(s, seg.id, { config: 'D2' });
}

/** Toggle 110 km/h on a segment (only valid when effective config is D2). */
export function toggle110(s: Scenario, seg: SegmentDef): Scenario {
  const o = getOverride(s, seg.id);
  if (o?.maxspeedKmh === 110) return upsert(s, seg.id, { config: o.config, maxspeedKmh: undefined });
  return upsert(s, seg.id, { config: o?.config, maxspeedKmh: 110 });
}

/** Corridor-wide preset: everything upgradable → 2+2 @ 110, junctions grade-separated. */
export function presetFull(model: CorridorModel): Scenario {
  return {
    segmentOverrides: model.segments
      .filter((g) => g.upgradable)
      .map((g) => ({ segmentId: g.id, config: 'D2' as const, maxspeedKmh: rural(g) ? 110 : undefined })),
    junctionOverrides: model.junctions
      .filter((j) => j.upgradable && j.type !== 'grade-separated')
      .map((j) => ({ junctionId: j.id, type: 'grade-separated' as const })),
  };
}

/** Preset: raise segments that are ALREADY D2 today to 110 (no rebuilds; replaces the current scenario). */
export function preset110Only(model: CorridorModel): Scenario {
  // Signs-only: 110 on every existing separated/passing-lane segment
  // (2+2 and 2+1), no construction — mirrors the sweep scenario '110-existing'.
  return {
    segmentOverrides: model.segments
      .filter((g) => (g.config === 'D2' || g.config === 'S21F' || g.config === 'S21R') && g.upgradable && rural(g))
      .map((g) => ({ segmentId: g.id, maxspeedKmh: 110 })),
    junctionOverrides: [],
  };
}

function rural(g: SegmentDef): boolean {
  return g.maxspeedKmh >= 80;
}

export type ScenarioMap = Record<CorridorId, Scenario>;

export const EMPTY_SCENARIOS: ScenarioMap = {
  north: EMPTY_SCENARIO,
  south: EMPTY_SCENARIO,
  kef: EMPTY_SCENARIO,
};
