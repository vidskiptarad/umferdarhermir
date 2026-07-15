'use client';

import type { CorridorId, CorridorModel, SegmentDef, SimAggregates } from '@/types';
import {
  EMPTY_SCENARIO,
  effective,
  isEmptyScenario,
  preset110Only,
  presetFull,
  toggle110,
  toggleD2,
  type ScenarioMap,
} from '../scenario';
import { fmtDeltaMin, fmtMin, isNum } from '../format';

const CONFIG_LABEL: Record<string, string> = { S1: '1+1', S21F: '2+1', S21R: '2+1', D2: '2+2' };
const CONFIG_CSS: Record<string, string> = {
  S1: '#5c6882',
  S21F: '#8291af',
  S21R: '#8291af',
  D2: '#a8b8d6',
};

interface Props {
  models: Map<CorridorId, CorridorModel>;
  scenarios: ScenarioMap;
  setScenarios: React.Dispatch<React.SetStateAction<ScenarioMap>>;
  focused: CorridorId;
  setFocused: (c: CorridorId) => void;
  selectedSegment: string | null;
  setSelectedSegment: (s: string | null) => void;
  comparisonByCorridor: (cid: CorridorId) => { base?: SimAggregates; upg?: SimAggregates };
}

export default function ScenarioPanel({
  models,
  scenarios,
  setScenarios,
  focused,
  setFocused,
  selectedSegment,
  setSelectedSegment,
  comparisonByCorridor,
}: Props) {
  return (
    <div
      className="z-10 flex w-full flex-col gap-2 px-2 pt-2 lg:absolute lg:bottom-3 lg:left-3 lg:top-[92px] lg:w-[340px] lg:overflow-y-auto lg:p-0 lg:pr-1"
      style={{ scrollbarGutter: 'stable' }}
    >
      {[...models.values()].map((model) => (
        <CorridorCard
          key={model.id}
          model={model}
          scenarios={scenarios}
          setScenarios={setScenarios}
          isFocused={focused === model.id}
          setFocused={setFocused}
          selectedSegment={selectedSegment}
          setSelectedSegment={setSelectedSegment}
          comparison={comparisonByCorridor(model.id)}
        />
      ))}
    </div>
  );
}

function CorridorCard({
  model,
  scenarios,
  setScenarios,
  isFocused,
  setFocused,
  selectedSegment,
  setSelectedSegment,
  comparison,
}: {
  model: CorridorModel;
  scenarios: ScenarioMap;
  setScenarios: React.Dispatch<React.SetStateAction<ScenarioMap>>;
  isFocused: boolean;
  setFocused: (c: CorridorId) => void;
  selectedSegment: string | null;
  setSelectedSegment: (s: string | null) => void;
  comparison: { base?: SimAggregates; upg?: SimAggregates };
}) {
  const scenario = scenarios[model.id];
  const set = (s: typeof scenario) => setScenarios((prev) => ({ ...prev, [model.id]: s }));
  const selected = model.segments.find((g) => g.id === selectedSegment);
  const { base, upg } = comparison;
  const baseT = base ? base.p50TravelTimeS.fwd : null;
  const upgT = upg ? upg.p50TravelTimeS.fwd : null;
  const active = !isEmptyScenario(scenario);
  const delta = baseT !== null && upgT !== null && active ? upgT - baseT : null;
  const computing = active && baseT !== null && upgT === null;

  return (
    <div
      className="panel p-3"
      style={isFocused ? { borderColor: 'var(--line-strong)' } : undefined}
      onClick={() => !isFocused && setFocused(model.id)}
      role={isFocused ? undefined : 'button'}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <div className="text-[13px] font-extrabold tracking-wide">{model.name}</div>
        <div className="mono ml-auto whitespace-nowrap text-[11px]" style={{ color: 'var(--ink-2)' }}>
          {baseT === null ? (
            '…'
          ) : delta !== null ? (
            <>
              <span style={{ textDecoration: 'line-through', color: 'var(--ink-3)' }}>{fmtMin(baseT)}</span>
              <span className="ml-1.5 text-[13px] font-extrabold" style={{ color: 'var(--ink)' }}>
                {fmtMin(upgT!)}
              </span>
              <span className="ml-1 font-bold" style={{ color: delta < 0 ? 'var(--good)' : 'var(--bad)' }}>
                {fmtDeltaMin(delta)}
              </span>
            </>
          ) : computing ? (
            <>
              {fmtMin(baseT)}
              <span className="ml-1" style={{ color: 'var(--ink-3)' }}>
                reiknar…
              </span>
            </>
          ) : (
            fmtMin(baseT)
          )}
        </div>
      </div>

      {/* segment strip */}
      <div className="mt-2 flex h-4 w-full overflow-hidden rounded-[3px]" aria-label="Vegkaflar">
        {model.segments.map((seg) => {
          const eff = effective(seg, scenario);
          const changed = eff.config !== seg.config || eff.maxspeedKmh !== seg.maxspeedKmh;
          const w = ((seg.toM - seg.fromM) / model.lengthM) * 100;
          const isSel = selectedSegment === seg.id;
          return (
            <button
              key={seg.id}
              title={`${seg.name} — ${CONFIG_LABEL[eff.config]} · ${eff.maxspeedKmh} km/klst`}
              onClick={(e) => {
                e.stopPropagation();
                setFocused(model.id);
                setSelectedSegment(isSel ? null : seg.id);
              }}
              style={{
                width: `${w}%`,
                background: changed ? 'var(--accent)' : CONFIG_CSS[eff.config],
                outline: isSel ? '2px solid var(--ink)' : 'none',
                outlineOffset: -2,
                opacity: seg.upgradable ? 1 : 0.45,
                borderRight: '1px solid rgba(10,14,21,.8)',
              }}
            />
          );
        })}
      </div>

      {isFocused && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="chip" data-on={false} onClick={() => set(presetFull(model))}>
              Allt í 2+2 + 110
            </button>
            {preset110Only(model).segmentOverrides.length > 0 && (
              <button className="chip" onClick={() => set(preset110Only(model))}>
                Aðeins 110
              </button>
            )}
            {model.junctions.some((j) => j.upgradable && j.type !== 'grade-separated') && (
              <button
                className="chip"
                onClick={() =>
                  set({
                    ...scenario,
                    junctionOverrides: scenario.junctionOverrides.length
                      ? []
                      : model.junctions
                          .filter((j) => j.upgradable && j.type !== 'grade-separated')
                          .map((j) => ({ junctionId: j.id, type: 'grade-separated' as const })),
                  })
                }
                data-on={scenario.junctionOverrides.length > 0}
              >
                Mislæg gatnamót
              </button>
            )}
            {!isEmptyScenario(scenario) && (
              <button className="chip" onClick={() => set(EMPTY_SCENARIO)}>
                Núllstilla
              </button>
            )}
          </div>

          {selected && <SegmentDetail seg={selected} model={model} scenario={scenario} set={set} />}
        </>
      )}
    </div>
  );
}

function SegmentDetail({
  seg,
  model,
  scenario,
  set,
}: {
  seg: SegmentDef;
  model: CorridorModel;
  scenario: (typeof EMPTY_SCENARIO);
  set: (s: typeof EMPTY_SCENARIO) => void;
}) {
  const eff = effective(seg, scenario);
  const km = isNum((seg.toM - seg.fromM) / 1000, 1);
  const isTunnel = seg.upgradeHint === 'tunnel-bore-2';
  const canD2 = seg.upgradable && seg.config !== 'D2';
  const can110 = seg.upgradable && (eff.config === 'D2' || eff.config === 'S21F' || eff.config === 'S21R');
  return (
    <div className="mt-2 rounded-md border p-2" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] font-bold">{seg.name}</div>
        <div className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>
          {km} km
        </div>
      </div>
      <div className="mono mt-0.5 text-[10px]" style={{ color: 'var(--ink-3)' }}>
        Í dag: {CONFIG_LABEL[seg.config]} · {seg.maxspeedKmh} km/klst · ÁDU {isNum(seg.aadt2025)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {canD2 && (
          <button className="chip" data-on={eff.config === 'D2'} onClick={() => set(toggleD2(scenario, seg))}>
            {isTunnel ? 'Göng II (2+2)' : seg.upgradeHint === 'fourth-lane' ? '4. akrein (2+2)' : '2+2'}
          </button>
        )}
        {can110 && (
          <button className="chip" data-on={eff.maxspeedKmh === 110} onClick={() => set(toggle110(scenario, seg))}>
            110 km/klst
          </button>
        )}
        {!seg.upgradable && (
          <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
            Ekki breytanlegt í hermi
          </span>
        )}
      </div>
    </div>
  );
}
