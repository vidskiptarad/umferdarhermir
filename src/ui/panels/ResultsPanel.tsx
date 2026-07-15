'use client';

import { useMemo, useState } from 'react';
import type {
  BenefitBreakdown,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  SimAggregates,
} from '@/types';
import { isEmptyScenario, type ScenarioMap } from '../scenario';
import { fmtDeltaMin, fmtISK, fmtInt, fmtMin, isNum } from '../format';
import Callout110 from './Callout110';

interface Props {
  focused: CorridorId;
  model: CorridorModel;
  comparison: { base?: SimAggregates; upg?: SimAggregates; scenarioIsEmpty: boolean } | null;
  benefits: Map<CorridorId, BenefitBreakdown | 'pending'> | null;
  runsPending: number;
  preset: DemandPresetId;
  scenarios: ScenarioMap;
}

export default function ResultsPanel({ focused, model, comparison, benefits, runsPending, scenarios }: Props) {
  const [show110, setShow110] = useState(false);
  const base = comparison?.base;
  const upg = comparison?.upg;
  const empty = comparison?.scenarioIsEmpty ?? true;

  const totals = useMemo(() => {
    if (!benefits) return null;
    let year = 0;
    let npv = 0;
    let hours = 0;
    let accidents = 0;
    let pending = false;
    let any = false;
    for (const [, b] of benefits) {
      if (b === 'pending') {
        pending = true;
        continue;
      }
      any = true;
      year += b.totalISKPerYear;
      npv += b.npv30ISK;
      hours += b.vehHoursSavedPerYear;
      accidents += b.detail.accidentsAvoidedPerYear;
    }
    return { year, npv, hours, accidents, pending, any };
  }, [benefits]);

  const has110 = Object.values(scenarios).some((s) =>
    s.segmentOverrides.some((o) => o.maxspeedKmh === 110),
  );

  return (
    <div className="z-10 flex w-full flex-col gap-2 p-2 lg:absolute lg:bottom-3 lg:right-3 lg:top-16 lg:w-[320px] lg:p-0">
      {/* Travel time — focused corridor */}
      <div className="panel p-3.5">
        <div className="eyebrow">Ferðatími · {model.name}</div>
        {!base ? (
          <div className="mt-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
            Herma grunnlínu í vafranum{runsPending > 0 ? ` — ${runsPending} keyrslur eftir` : '…'}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <TimeStat label="Frá Reykjavík" base={base} upg={upg} empty={empty} dir="fwd" />
            <TimeStat label="Til Reykjavíkur" base={base} upg={upg} empty={empty} dir="rev" />
          </div>
        )}
        {base && upg && !empty && <Histogram base={base} upg={upg} />}
        {base && (
          <div className="mono mt-2 text-[10px]" style={{ color: 'var(--ink-3)' }}>
            Töf í grunnlínu: {fmtMin(base.meanDelayS.fwd)} · eftirfylgni {Math.round(base.ptsf.fwd * 100)}% tímans
          </div>
        )}
      </div>

      {/* Economics */}
      <div className="panel flex-1 overflow-y-auto p-3.5">
        <div className="eyebrow">Þjóðhagslegur ábati · allar leiðir</div>
        {!totals?.any && !totals?.pending && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
            Veldu vegkafla og breyttu í 2+2 eða 110 km/klst — ábatinn birtist hér: sparaður tími og færri slys,
            metinn til fjár. Engar framkvæmdakostnaðartölur, aðeins ábati.
          </p>
        )}
        {totals?.pending && (
          <div className="mono mt-2 text-[11px]" style={{ color: 'var(--accent)' }}>
            Herma… {runsPending} keyrslur eftir
          </div>
        )}
        {totals?.any && (
          <>
            <div className="mt-3">
              <div className="mono text-[30px] font-bold leading-none" style={{ color: totals.year >= 0 ? 'var(--accent)' : 'var(--bad)' }}>
                {fmtISK(totals.year)}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--ink-2)' }}>
                ábati á ári (fyrsta ár)
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="Núvirði 30 ára" value={fmtISK(totals.npv)} />
              <MiniStat label="Vinnustundir sparaðar/ár" value={fmtInt(totals.hours)} />
              <MiniStat label="Slysum forðað/ár" value={isNum(totals.accidents, 1)} />
              <MiniStat label="Forsendur" value="Vegagerðin · TERESA" small />
            </div>
            {benefits && (
              <div className="mt-3 space-y-1.5">
                {[...benefits.entries()].map(([cid, b]) =>
                  b === 'pending' ? (
                    <div key={cid} className="mono text-[10px]" style={{ color: 'var(--ink-3)' }}>
                      {cid}: reikna…
                    </div>
                  ) : (
                    <div key={cid} className="flex items-baseline justify-between text-[11px]">
                      <span style={{ color: 'var(--ink-2)' }}>{corridorLabel(cid)}</span>
                      <span className="mono">
                        <span style={{ color: 'var(--ink-2)' }}>tími {fmtISK(b.timeSavingsISKPerYear)}</span>
                        <span className="ml-2" style={{ color: 'var(--ink-2)' }}>
                          slys {fmtISK(b.safetyBenefitISKPerYear)}
                        </span>
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </>
        )}

        {has110 && (
          <button className="btn mt-3 w-full text-left" onClick={() => setShow110(true)}>
            <span style={{ color: 'var(--accent)' }}>ⓘ</span> 110 km/klst er löglegt — en Vegagerðin segir nei.
            Af hverju?
          </button>
        )}
      </div>

      {show110 && <Callout110 onClose={() => setShow110(false)} />}
    </div>
  );
}

function corridorLabel(cid: CorridorId): string {
  return cid === 'north' ? 'Borgarnes' : cid === 'south' ? 'Selfoss' : 'Keflavík';
}

function TimeStat({
  label,
  base,
  upg,
  empty,
  dir,
}: {
  label: string;
  base: SimAggregates;
  upg?: SimAggregates;
  empty: boolean;
  dir: 'fwd' | 'rev';
}) {
  const b = base.p50TravelTimeS[dir];
  const u = upg?.p50TravelTimeS[dir];
  const showDelta = !empty && u !== undefined;
  return (
    <div>
      <div className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </div>
      <div className="mono whitespace-nowrap text-[17px] font-bold leading-tight">
        {showDelta ? fmtMin(u!) : fmtMin(b)}
      </div>
      {showDelta && (
        <div className="mono text-[11px] font-bold" style={{ color: u! < b ? 'var(--good)' : 'var(--bad)' }}>
          {fmtDeltaMin(u! - b)} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(var {fmtMin(b)})</span>
        </div>
      )}
      <div className="mono mt-0.5 text-[10px]" style={{ color: 'var(--ink-3)' }}>
        p85 {fmtMin((showDelta ? upg! : base).p85TravelTimeS[dir])}
      </div>
    </div>
  );
}

function MiniStat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: 'var(--line)' }}>
      <div className={`mono font-bold ${small ? 'text-[10px]' : 'text-[14px]'}`}>{value}</div>
      <div className="mt-0.5 text-[9px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </div>
    </div>
  );
}

/**
 * Travel-time distribution, baseline vs scenario, forward direction.
 * Two series: baseline = slate (the "today" entity everywhere in the app),
 * scenario = vegvísir yellow (the "upgrade" entity everywhere in the app).
 */
function Histogram({ base, upg }: { base: SimAggregates; upg: SimAggregates }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 64;
  const W = 288;
  const data = useMemo(() => {
    const bt = base.trips.filter((t) => t.dir === 0).map((t) => t.travelTimeS / 60);
    const ut = upg.trips.filter((t) => t.dir === 0).map((t) => t.travelTimeS / 60);
    if (bt.length === 0 || ut.length === 0) return null;
    const min = Math.floor(Math.min(...ut, ...bt));
    const max = Math.ceil(Math.max(...bt, ...ut));
    const nb = Math.min(36, Math.max(12, max - min));
    const bw = (max - min) / nb || 1;
    const hb = new Array(nb).fill(0);
    const hu = new Array(nb).fill(0);
    for (const v of bt) hb[Math.min(nb - 1, Math.floor((v - min) / bw))]++;
    for (const v of ut) hu[Math.min(nb - 1, Math.floor((v - min) / bw))]++;
    const peak = Math.max(...hb, ...hu) || 1;
    return { hb: hb.map((v) => v / peak), hu: hu.map((v) => v / peak), min, bw, nb, nB: bt.length, nU: ut.length, rawB: hb, rawU: hu };
  }, [base, upg]);
  if (!data) return null;
  const bwPx = W / data.nb;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Dreifing ferðatíma (frá Rvk)</div>
        <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--ink-2)' }}>
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#6E8FD8' }} /> Í dag
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#C98500' }} /> Sviðsmynd
        </div>
      </div>
      <svg
        width={W}
        height={H + 16}
        className="mt-1"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Súlurit: dreifing ferðatíma í dag og í sviðsmynd"
      >
        {Array.from({ length: data.nb }, (_, i) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={i * bwPx} y={0} width={bwPx} height={H} fill="transparent" />
            <rect
              x={i * bwPx + 0.5}
              y={H - data.hb[i] * H}
              width={Math.max(1, bwPx - 2)}
              height={data.hb[i] * H}
              rx={1.5}
              fill="#6E8FD8"
              opacity={0.55}
            />
            <rect
              x={i * bwPx + 0.5}
              y={H - data.hu[i] * H}
              width={Math.max(1, bwPx - 2)}
              height={data.hu[i] * H}
              rx={1.5}
              fill="#C98500"
              opacity={0.9}
            />
          </g>
        ))}
        <line x1={0} y1={H + 0.5} x2={W} y2={H + 0.5} stroke="var(--line-strong)" />
        <text x={0} y={H + 12} fill="var(--ink-3)" fontSize={9} className="mono">
          {data.min} mín
        </text>
        <text x={W} y={H + 12} fill="var(--ink-3)" fontSize={9} textAnchor="end" className="mono">
          {Math.round(data.min + data.bw * data.nb)} mín
        </text>
        {hover !== null && (
          <text x={W / 2} y={H + 12} fill="var(--ink)" fontSize={9} textAnchor="middle" className="mono">
            {Math.round(data.min + hover * data.bw)}–{Math.round(data.min + (hover + 1) * data.bw)} mín: í dag{' '}
            {data.rawB[hover]} · sviðsmynd {data.rawU[hover]}
          </text>
        )}
      </svg>
    </div>
  );
}
