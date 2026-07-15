'use client';

import type { DemandPresetId } from '@/types';
import { fmtClock, fmtInt } from '../format';

const PRESET_LABELS: Record<DemandPresetId, string> = {
  typicalWeekday: 'Virkur dagur',
  fridaySummer: 'Föstudagur (sumar)',
  sundayReturn: 'Sunnudagur (heimferð)',
};
const SPEEDS = [60, 240, 960];

interface Props {
  preset: DemandPresetId;
  onPreset: (p: DemandPresetId) => void;
  playing: boolean;
  onPlaying: (b: boolean) => void;
  speed: number;
  onSpeed: (s: number) => void;
  clockS: number; // engine time — absolute seconds from midnight
  vehCount: number;
}

export default function TopBar({
  preset,
  onPreset,
  playing,
  onPlaying,
  speed,
  onSpeed,
  clockS,
  vehCount,
}: Props) {
  return (
    <div className="pointer-events-none z-20 flex flex-wrap items-start justify-between gap-2 p-2 lg:absolute lg:left-0 lg:right-0 lg:top-0 lg:gap-3 lg:p-3">
      {/* Brand */}
      <div className="pointer-events-auto panel flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-2.5">
        <div>
          <div className="mono text-[15px] font-bold leading-none tracking-[0.28em] lg:text-[17px]" style={{ color: 'var(--ink)' }}>
            UMFERÐ
          </div>
          <div className="mt-1 text-[10px] leading-none" style={{ color: 'var(--ink-3)' }}>
            hermir · 2+2 · 110 km/klst
          </div>
          <a
            href="https://vi.is/skodanir/i-langri-lest"
            className="mt-1 block text-[10px] font-semibold leading-none hover:underline"
            style={{ color: 'var(--ink-2)' }}
          >
            Viðskiptaráð Íslands · sjá skoðun
          </a>
        </div>
      </div>

      {/* Day preset — full-width scrollable row on mobile, inline panel on desktop */}
      <div className="pointer-events-auto panel order-last flex w-full items-center gap-1 overflow-x-auto p-1 lg:order-none lg:w-auto">
        {(Object.keys(PRESET_LABELS) as DemandPresetId[]).map((p) => (
          <button
            key={p}
            className="chip shrink-0 whitespace-nowrap"
            data-on={preset === p}
            onClick={() => onPreset(p)}
            style={{ padding: '5px 10px' }}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Playback + clock */}
      <div className="pointer-events-auto panel flex items-center gap-2 px-2.5 py-2 lg:gap-3 lg:px-3">
        <button
          className="btn"
          aria-label={playing ? 'Gera hlé' : 'Halda áfram'}
          onClick={() => onPlaying(!playing)}
          style={{ width: 34, padding: '5px 0' }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="chip"
          onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          title="Hraði hermis"
        >
          ×{speed}
        </button>
        <div className="text-right">
          <div className="mono text-[18px] font-bold leading-none" style={{ color: 'var(--accent)' }}>
            {fmtClock(clockS)}
          </div>
          <div className="mono mt-0.5 text-[10px] leading-none" style={{ color: 'var(--ink-3)' }}>
            {fmtInt(vehCount)} bílar á ferð
          </div>
        </div>
      </div>
    </div>
  );
}
