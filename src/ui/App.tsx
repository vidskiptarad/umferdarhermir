'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CorridorDemand,
  CorridorId,
  CorridorModel,
  DemandPresetId,
  SegmentLiveStats,
  SimAggregates,
} from '@/types';
import { computeBenefits, defaultEconParams } from '@/econ';
import type { BenefitBreakdown } from '@/types';
import {
  EMPTY_SCENARIO,
  EMPTY_SCENARIOS,
  isEmptyScenario,
  presetFull,
  scenarioHash,
  type ScenarioMap,
} from './scenario';
import { SimWorkers } from './workerClient';
import MapView from './MapView';
import TopBar from './panels/TopBar';
import ScenarioPanel from './panels/ScenarioPanel';
import ResultsPanel from './panels/ResultsPanel';

const CORRIDOR_IDS: CorridorId[] = ['north', 'south', 'kef'];
const PRESETS: DemandPresetId[] = ['typicalWeekday', 'fridaySummer', 'sundayReturn'];
const ANNUALIZATION = {
  days: [
    { preset: 'typicalWeekday' as const, daysPerYear: 250 },
    { preset: 'fridaySummer' as const, daysPerYear: 58 },
    { preset: 'sundayReturn' as const, daysPerYear: 57 },
  ],
};
const LIVE_START_HOUR: Record<DemandPresetId, number> = {
  typicalWeekday: 16.5,
  fridaySummer: 16,
  sundayReturn: 17,
};

type ResultsCache = Map<string, SimAggregates>;
const key = (cid: CorridorId, preset: DemandPresetId, hash: string) => `${cid}|${preset}|${hash}`;

/**
 * Deep-link params (module scope — App is client-only via dynamic ssr:false):
 *   ?c=north|south|kef      focused corridor
 *   ?p=<preset>             demand preset
 *   ?x=<n>                  live playback speed (sim-seconds per wall-second)
 *   ?s=full                 apply the full 2+2+110 preset to the focused corridor
 *   ?cam=lon,lat,zoom       initial map camera (skips the corridor fly-to)
 *   ?ui=<factor>            CSS zoom on the whole page (bigger panels for capture)
 */
const URL_CFG = (() => {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  if ([...q.keys()].length === 0) return null;
  const cam = (q.get('cam') ?? '').split(',').map(Number);
  return {
    focused: (CORRIDOR_IDS as string[]).includes(q.get('c') ?? '') ? (q.get('c') as CorridorId) : null,
    preset: (PRESETS as string[]).includes(q.get('p') ?? '') ? (q.get('p') as DemandPresetId) : null,
    speed: Number(q.get('x')) > 0 ? Math.min(2000, Number(q.get('x'))) : null,
    full: q.get('s') === 'full',
    cam: cam.length === 3 && cam.every(Number.isFinite) ? (cam as [number, number, number]) : null,
    ui: Number(q.get('ui')) > 0 ? Math.min(3, Number(q.get('ui'))) : null,
  };
})();

export default function App() {
  const [models, setModels] = useState<Map<CorridorId, CorridorModel> | null>(null);
  const [demand, setDemand] = useState<Map<CorridorId, CorridorDemand> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<ScenarioMap>(EMPTY_SCENARIOS);
  const [focused, setFocused] = useState<CorridorId>(URL_CFG?.focused ?? 'north');
  const [preset, setPreset] = useState<DemandPresetId>(URL_CFG?.preset ?? 'fridaySummer');
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(URL_CFG?.speed ?? 240);
  const [clockS, setClockS] = useState(0);
  const [liveStats, setLiveStats] = useState<SegmentLiveStats[] | null>(null);
  const [vehCount, setVehCount] = useState(0);
  const [, setResultsVersion] = useState(0); // bump when cache updates

  const workersRef = useRef<SimWorkers | null>(null);
  const frameRef = useRef<import('./workerClient').Frame | null>(null);
  const cacheRef = useRef<ResultsCache>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const runsPendingRef = useRef(0);
  const [runsPending, setRunsPending] = useState(0);

  // ------------------------------------------------------------------ load data
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        const [n, s, k, d] = await Promise.all(
          ['north.corridor', 'south.corridor', 'kef.corridor', 'demand'].map(async (f) => {
            const r = await fetch(`${base}/data/${f}.json`);
            if (!r.ok) throw new Error(`vantar /data/${f}.json — keyrðu \`npm run pipeline\``);
            return r.json();
          }),
        );
        // Precomputed baseline aggregates (optional — falls back to in-browser runs)
        try {
          const rb = await fetch(`${base}/data/baselines.json`);
          if (rb.ok) {
            const baselines = (await rb.json()) as Record<string, SimAggregates>;
            const baseHash = scenarioHash(EMPTY_SCENARIO);
            for (const [k2, agg] of Object.entries(baselines)) {
              const [cid, preset] = k2.split('|');
              cacheRef.current.set(key(cid as CorridorId, preset as DemandPresetId, baseHash), agg);
            }
          }
        } catch {
          // no baselines file — the batch worker will compute them
        }
        if (!alive) return;
        const m = new Map<CorridorId, CorridorModel>([
          ['north', n],
          ['south', s],
          ['kef', k],
        ]);
        const dm = new Map<CorridorId, CorridorDemand>(
          (d as CorridorDemand[]).map((x) => [x.corridorId, x]),
        );
        if (URL_CFG?.full) {
          const cid = URL_CFG.focused ?? 'north';
          setScenarios((prev) => ({ ...prev, [cid]: presetFull(m.get(cid)!) }));
        }
        if (URL_CFG?.ui) {
          (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(URL_CFG.ui);
        }
        setModels(m);
        setDemand(dm);
      } catch (e) {
        if (alive) setLoadError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ------------------------------------------------------------------ workers
  useEffect(() => {
    if (!models || !demand) return;
    const w = new SimWorkers([...models.values()], [...demand.values()]);
    workersRef.current = w;
    w.onLiveStats = (cid, timeS, stats) => {
      setLiveStats(stats);
      setClockS(timeS);
    };
    let lastClock = 0;
    w.onFrame = (f) => {
      frameRef.current = f;
      if (f.timeS - lastClock > 30) {
        lastClock = f.timeS;
        setClockS(f.timeS);
        setVehCount(f.count);
      }
    };
    w.onError = (m) => console.error('[sim worker]', m);
    return () => {
      w.dispose();
      workersRef.current = null;
    };
  }, [models, demand]);

  // ------------------------------------------------------------------ runs
  const ensureRun = useCallback(
    (cid: CorridorId, p: DemandPresetId, scenario: typeof EMPTY_SCENARIO) => {
      const w = workersRef.current;
      if (!w) return;
      const h = scenarioHash(scenario);
      const k2 = key(cid, p, h);
      if (cacheRef.current.has(k2) || inFlightRef.current.has(k2)) return;
      inFlightRef.current.add(k2);
      runsPendingRef.current++;
      setRunsPending(runsPendingRef.current);
      void w.run(cid, p, scenario).then(({ aggregates }) => {
        cacheRef.current.set(k2, aggregates);
        inFlightRef.current.delete(k2);
        runsPendingRef.current--;
        setRunsPending(runsPendingRef.current);
        setResultsVersion((v) => v + 1);
      });
    },
    [],
  );

  // baseline warmup: queue all baselines once workers exist (selected preset first)
  useEffect(() => {
    if (!models || !workersRef.current) return;
    const order: DemandPresetId[] = [preset, ...PRESETS.filter((p) => p !== preset)];
    for (const p of order) for (const cid of CORRIDOR_IDS) ensureRun(cid, p, EMPTY_SCENARIO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, ensureRun]);

  // scenario runs (debounced)
  useEffect(() => {
    if (!models) return;
    const t = setTimeout(() => {
      for (const cid of CORRIDOR_IDS) {
        const sc = scenarios[cid];
        if (isEmptyScenario(sc)) continue;
        const order: DemandPresetId[] = [preset, ...PRESETS.filter((p) => p !== preset)];
        for (const p of order) ensureRun(cid, p, sc);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [models, scenarios, preset, ensureRun]);

  // ------------------------------------------------------------------ live sim
  useEffect(() => {
    const w = workersRef.current;
    if (!w || !models) return;
    setLiveStats(null);
    w.focus(focused, preset, scenarios[focused], LIVE_START_HOUR[preset], speed);
    if (!playing) w.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, focused, preset, scenarios[focused]]);

  useEffect(() => {
    workersRef.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    if (playing) workersRef.current?.resume();
    else workersRef.current?.pause();
  }, [playing]);

  // ------------------------------------------------------------------ derived
  const getAgg = useCallback((cid: CorridorId, p: DemandPresetId, hash: string) => {
    return cacheRef.current.get(key(cid, p, hash));
  }, []);

  const benefits = useMemo(() => {
    if (!models || !demand) return null;
    const out = new Map<CorridorId, BenefitBreakdown | 'pending'>();
    const params = defaultEconParams();
    const baseHash = scenarioHash(EMPTY_SCENARIO);
    for (const cid of CORRIDOR_IDS) {
      const sc = scenarios[cid];
      if (isEmptyScenario(sc)) continue;
      const h = scenarioHash(sc);
      const base: SimAggregates[] = [];
      const upg: SimAggregates[] = [];
      let ok = true;
      for (const d of ANNUALIZATION.days) {
        const b = getAgg(cid, d.preset, baseHash);
        const u = getAgg(cid, d.preset, h);
        if (!b || !u) {
          ok = false;
          break;
        }
        base.push(b);
        upg.push(u);
      }
      if (!ok) {
        out.set(cid, 'pending');
        continue;
      }
      out.set(
        cid,
        computeBenefits(base, upg, ANNUALIZATION, demand.get(cid)!, models.get(cid)!, sc, params),
      );
    }
    return out;
    // resultsVersion bump re-triggers via state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, demand, scenarios, getAgg, runsPending]);

  // travel-time comparison for the focused corridor at the selected preset
  const comparison = useMemo(() => {
    if (!models) return null;
    const baseHash = scenarioHash(EMPTY_SCENARIO);
    const sc = scenarios[focused];
    const base = getAgg(focused, preset, baseHash);
    const upg = isEmptyScenario(sc) ? base : getAgg(focused, preset, scenarioHash(sc));
    return { base, upg, scenarioIsEmpty: isEmptyScenario(sc) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, focused, preset, scenarios, getAgg, runsPending]);

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="panel max-w-md p-6">
          <div className="mono text-lg font-bold tracking-[0.2em]">UMFERÐ</div>
          <p className="mt-3 text-sm" style={{ color: 'var(--ink-2)' }}>
            Gögnin fundust ekki: {loadError}
          </p>
        </div>
      </div>
    );
  }
  if (!models || !demand) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mono text-2xl font-bold tracking-[0.3em]">UMFERÐ</div>
          <div className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
            Sæki veglíkön…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col supports-[height:1dvh]:min-h-[100dvh] lg:block lg:h-screen lg:w-screen lg:overflow-hidden">
      <TopBar
        preset={preset}
        onPreset={setPreset}
        playing={playing}
        onPlaying={setPlaying}
        speed={speed}
        onSpeed={setSpeedState}
        clockS={clockS}
        vehCount={vehCount}
      />
      {/* Mobile: fixed-height map block in the scroll flow; desktop: full-screen backdrop. */}
      <div className="map-block relative w-full shrink-0 lg:absolute lg:inset-0">
        <MapView
          models={models}
          scenarios={scenarios}
          focused={focused}
          liveStats={liveStats}
          selectedSegment={selectedSegment}
          frameRef={frameRef}
          initialCam={URL_CFG?.cam}
          onSelectSegment={(cid, segId) => {
            setFocused(cid);
            setSelectedSegment(segId);
          }}
        />
      </div>
      <ScenarioPanel
        models={models}
        scenarios={scenarios}
        setScenarios={setScenarios}
        focused={focused}
        setFocused={setFocused}
        selectedSegment={selectedSegment}
        setSelectedSegment={setSelectedSegment}
        comparisonByCorridor={(cid) => {
          const baseHash = scenarioHash(EMPTY_SCENARIO);
          const sc = scenarios[cid];
          const b = getAgg(cid, preset, baseHash);
          const u = isEmptyScenario(sc) ? b : getAgg(cid, preset, scenarioHash(sc));
          return { base: b, upg: u };
        }}
      />
      <ResultsPanel
        focused={focused}
        model={models.get(focused)!}
        comparison={comparison}
        benefits={benefits}
        runsPending={runsPending}
        preset={preset}
        scenarios={scenarios}
      />
    </div>
  );
}
