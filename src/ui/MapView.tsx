'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { CorridorId, CorridorModel, SegmentLiveStats } from '@/types';
import { buildGeom, laneLateral, offsetToLonLat, slicePath, type CorridorGeom } from './geometry';
import { effective, type ScenarioMap } from './scenario';
import type { Frame } from './workerClient';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

// Desktop = overlay layout. Must match Tailwind's `lg` (64rem) and the 64em
// media queries in app/globals.css — em/rem in media queries both resolve
// against the browser's default font size, so 64em ≡ Tailwind's 64rem.
const DESKTOP_MQ = '(min-width: 64em)';

const TOWNS: { name: string; pos: [number, number] }[] = [
  { name: 'Reykjavík', pos: [-21.895, 64.135] },
  { name: 'Mosfellsbær', pos: [-21.7, 64.167] },
  { name: 'Akranes', pos: [-22.07, 64.32] },
  { name: 'Borgarnes', pos: [-21.92, 64.54] },
  { name: 'Hveragerði', pos: [-21.19, 64.0] },
  { name: 'Selfoss', pos: [-20.997, 63.933] },
  { name: 'Hafnarfjörður', pos: [-21.95, 64.06] },
  { name: 'Keflavík', pos: [-22.56, 64.005] },
];

// Segment base colors by config (dim, night-map slate scale)
const CONFIG_COLOR: Record<string, [number, number, number, number]> = {
  S1: [92, 104, 130, 210],
  S21F: [130, 145, 175, 220],
  S21R: [130, 145, 175, 220],
  D2: [168, 184, 214, 230],
};
const UPGRADE_COLOR: [number, number, number, number] = [255, 210, 63, 235]; // vegvísir yellow
const HEAT: [number, number, number][] = [
  [63, 207, 142],
  [155, 213, 74],
  [242, 194, 48],
  [240, 140, 58],
  [229, 72, 77],
];

function heatColor(avgKmh: number, limit: number): [number, number, number, number] {
  if (avgKmh < 0) return [92, 104, 130, 200];
  const ref = Math.min(limit, 95);
  const r = avgKmh / ref;
  const c = r >= 0.95 ? HEAT[0] : r >= 0.8 ? HEAT[1] : r >= 0.62 ? HEAT[2] : r >= 0.42 ? HEAT[3] : HEAT[4];
  return [c[0], c[1], c[2], 240];
}

const CORRIDOR_BOUNDS: Record<CorridorId, [[number, number], [number, number]]> = {
  north: [
    [-22.35, 64.1],
    [-21.55, 64.58],
  ],
  south: [
    [-21.95, 63.9],
    [-20.9, 64.13],
  ],
  kef: [
    [-22.72, 63.93],
    [-21.85, 64.12],
  ],
};

interface Props {
  models: Map<CorridorId, CorridorModel>;
  scenarios: ScenarioMap;
  focused: CorridorId;
  liveStats: SegmentLiveStats[] | null;
  selectedSegment: string | null;
  frameRef: React.RefObject<Frame | null>;
  /** Deep-link camera [lon, lat, zoom]; suppresses the initial corridor fly-to. */
  initialCam?: [number, number, number] | null;
  onSelectSegment: (cid: CorridorId, segId: string) => void;
}

export default function MapView({
  models,
  scenarios,
  focused,
  liveStats,
  selectedSegment,
  frameRef,
  initialCam,
  onSelectSegment,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const geomsRef = useRef<Map<CorridorId, CorridorGeom>>(new Map());
  const segPathsRef = useRef<Map<CorridorId, { segId: string; path: [number, number][] }[]>>(new Map());
  // per-frame vehicle buffers
  const vehRef = useRef<{ positions: Float32Array; colors: Uint8Array; radii: Float32Array; count: number }>({
    positions: new Float32Array(0),
    colors: new Uint8Array(0),
    radii: new Float32Array(0),
    count: 0,
  });
  const staticLayersRef = useRef<unknown[]>([]);
  const propsRef = useRef({ models, scenarios, focused, liveStats, selectedSegment, onSelectSegment });
  propsRef.current = { models, scenarios, focused, liveStats, selectedSegment, onSelectSegment };

  // ------------------------------------------------------- map init (once)
  useEffect(() => {
    if (!containerRef.current) return;
    // On the stacked mobile layout the map sits inside a scrollable page, so a
    // one-finger drag must scroll the page — require two fingers to pan the map.
    // The locale strings stay unconditional: gestures can enable at runtime
    // when the viewport crosses the breakpoint (rotation, window resize).
    const desktopMq = window.matchMedia(DESKTOP_MQ);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-21.9, 64.1],
      zoom: 8.4,
      attributionControl: { compact: true },
      cooperativeGestures: !desktopMq.matches,
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': 'Notaðu tvo fingur til að færa kortið',
        'CooperativeGesturesHandler.WindowsHelpText': 'Haltu Ctrl inni og skrunaðu til að þysja kortið',
        'CooperativeGesturesHandler.MacHelpText': 'Haltu ⌘ inni og skrunaðu til að þysja kortið',
      },
    });
    // Keep gesture mode in sync with the live layout (iPad rotation, resize
    // across the breakpoint) — a stale snapshot would scroll-trap the map.
    const onDesktopMqChange = () => {
      if (desktopMq.matches) map.cooperativeGestures.disable();
      else map.cooperativeGestures.enable();
    };
    desktopMq.addEventListener('change', onDesktopMqChange);
    // Lift land/sea contrast: carto dark-matter's land (background) is nearly
    // identical to our page bg, so the coastline vanishes at low zoom.
    const applyContrast = () => {
      const LAND = '#161e2d';
      const WATER = '#06090f';
      try {
        map.setPaintProperty('background', 'background-color', LAND);
        for (const id of ['landcover', 'landuse', 'park_national_park', 'park_nature_reserve']) {
          if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', LAND);
        }
        for (const id of ['water', 'water_shadow']) {
          if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', WATER);
        }
      } catch {
        // style variations — cosmetic only
      }
    };
    map.on('style.load', applyContrast);
    if (map.isStyleLoaded()) applyContrast();
    // The map can capture a stale (pre-hydration) container size and leave the
    // GL viewport clipped to a corner — a later map.resize() reliably heals it,
    // so kick several times after layout/fonts settle + observe the container.
    // Production builds can leave the basemap unpainted after load; a LATE
    // map.resize() reliably heals it (forces full style/source revalidation,
    // which triggerRepaint does not). Early one-shot kicks empirically miss the
    // window, so run a healing interval: every 3 s for the first 90 s, then
    // every 15 s (no-op cost when healthy).
    // On the mobile layout the map block can scroll fully out of view; skip
    // per-frame deck updates and healer repaints while it's not visible.
    const visibleRef = { current: true };
    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries[0]?.isIntersecting ?? true;
    });
    io.observe(containerRef.current);
    let upMs = 0;
    const healer = setInterval(() => {
      upMs += 3000;
      if (upMs > 90_000 && upMs % 15_000 !== 0) return;
      if (!visibleRef.current) return; // scrolled off-screen (mobile layout)
      map.resize();
    }, 3000);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    // debug handle (harmless in prod)
    (window as unknown as { __map?: maplibregl.Map }).__map = map;
    // Interleaved: deck renders inside maplibre's GL context — one canvas, one
    // render loop. (Non-interleaved left the basemap canvas transparent on some
    // loads: maplibre's early paints aborted and never rescheduled.)
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    mapRef.current = map;
    overlayRef.current = overlay;

    for (const [cid, model] of propsRef.current.models) {
      const g = buildGeom(model);
      geomsRef.current.set(cid, g);
      segPathsRef.current.set(
        cid,
        model.segments.map((s) => ({ segId: s.id, path: slicePath(g, s.fromM, s.toM) })),
      );
    }

    let raf = 0;
    const tick = () => {
      if (visibleRef.current) updateVehicleLayer();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(healer);
      ro.disconnect();
      io.disconnect();
      desktopMq.removeEventListener('change', onDesktopMqChange);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frames arrive via frameRef, written by App's worker onFrame handler —
  // no subscription here, so nothing depends on effect mount order.

  // ------------------------------------------------------- static layer build
  useEffect(() => {
    const { models: ms, scenarios: sc, focused: foc, liveStats: ls, selectedSegment: sel } = propsRef.current;
    const layers: unknown[] = [];
    const statsById = new Map((ls ?? []).map((s) => [s.segmentId, s]));

    for (const [cid, model] of ms) {
      const paths = segPathsRef.current.get(cid);
      if (!paths) continue;
      const isFocused = cid === foc;
      const scenario = sc[cid];
      const segById = new Map(model.segments.map((s) => [s.id, s]));

      // upgrade casing (under main line)
      const upgraded = paths.filter(({ segId }) => {
        const seg = segById.get(segId)!;
        const eff = effective(seg, scenario);
        return eff.config !== seg.config || eff.maxspeedKmh !== seg.maxspeedKmh;
      });
      if (upgraded.length > 0) {
        layers.push(
          new PathLayer({
            id: `casing-${cid}`,
            data: upgraded,
            getPath: (d: { path: [number, number][] }) => d.path,
            getColor: UPGRADE_COLOR,
            getWidth: isFocused ? 9 : 7,
            widthUnits: 'pixels',
            capRounded: true,
            jointRounded: true,
            opacity: 0.55,
          }),
        );
      }

      layers.push(
        new PathLayer({
          id: `corridor-${cid}`,
          data: paths,
          pickable: true,
          getPath: (d: { segId: string; path: [number, number][] }) => d.path,
          getColor: (d: { segId: string }) => {
            const seg = segById.get(d.segId)!;
            const eff = effective(seg, scenario);
            if (isFocused) {
              const st = statsById.get(d.segId);
              if (st) {
                const dirAvg =
                  st.avgSpeedFwd >= 0 && st.avgSpeedRev >= 0
                    ? Math.min(st.avgSpeedFwd, st.avgSpeedRev)
                    : Math.max(st.avgSpeedFwd, st.avgSpeedRev);
                return heatColor(dirAvg, eff.maxspeedKmh);
              }
            }
            const changed = eff.config !== seg.config || eff.maxspeedKmh !== seg.maxspeedKmh;
            if (changed) return UPGRADE_COLOR;
            const c = CONFIG_COLOR[eff.config];
            return isFocused ? c : [c[0], c[1], c[2], 130];
          },
          getWidth: (d: { segId: string }) => {
            const seg = segById.get(d.segId)!;
            const eff = effective(seg, scenario);
            const base = eff.config === 'D2' ? 5 : eff.config === 'S1' ? 2.5 : 3.5;
            return isFocused ? base : base * 0.7;
          },
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          onClick: (info: { object?: { segId: string } }) => {
            if (info.object) propsRef.current.onSelectSegment(cid, info.object.segId);
          },
          updateTriggers: {
            getColor: [isFocused, JSON.stringify(scenario), ls ? (ls as SegmentLiveStats[]).map((s) => `${s.avgSpeedFwd.toFixed(1)}|${s.avgSpeedRev.toFixed(1)}`).join(',') : ''],
            getWidth: [isFocused, JSON.stringify(scenario)],
          },
        }),
      );

      if (sel) {
        const selPath = paths.find((p) => p.segId === sel);
        if (selPath && cid === foc) {
          layers.push(
            new PathLayer({
              id: `selected-${cid}`,
              data: [selPath],
              getPath: (d: { path: [number, number][] }) => d.path,
              getColor: [233, 236, 244, 255],
              getWidth: 2,
              widthUnits: 'pixels',
              opacity: 0.9,
            }),
          );
        }
      }
    }

    layers.push(
      new TextLayer({
        id: 'towns',
        data: TOWNS,
        getPosition: (d: { pos: [number, number] }) => d.pos,
        getText: (d: { name: string }) => d.name,
        getSize: 11,
        getColor: [154, 165, 188, 190],
        fontFamily: 'Overpass, sans-serif',
        fontWeight: 600,
        characterSet: 'aábcdðeéfghiíjklmnoópqrstuúvwxyýzþæöAÁBCDÐEÉFGHIÍJKLMNOÓPQRSTUÚVWXYÝZÞÆÖ ',
        fontSettings: { sdf: true },
        outlineWidth: 2,
        outlineColor: [10, 14, 21, 220],
        getTextAnchor: 'start',
        getPixelOffset: [8, 0],
      }),
    );

    staticLayersRef.current = layers;
    updateVehicleLayer(); // re-push all layers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, scenarios, focused, liveStats, selectedSegment]);

  // ------------------------------------------------------- fly to focus
  const skipFitRef = useRef(!!initialCam);
  useEffect(() => {
    if (skipFitRef.current) {
      skipFitRef.current = false;
      if (initialCam) mapRef.current?.jumpTo({ center: [initialCam[0], initialCam[1]], zoom: initialCam[2] });
      return;
    }
    // Desktop padding clears the overlay panels; on the stacked mobile layout
    // the panels don't overlay the map — and 380+340px of padding would exceed
    // a phone-width canvas, making fitBounds a silent no-op.
    const padding = window.matchMedia(DESKTOP_MQ).matches
      ? { top: 80, bottom: 60, left: 380, right: 340 }
      : { top: 24, bottom: 24, left: 24, right: 24 };
    mapRef.current?.fitBounds(CORRIDOR_BOUNDS[focused], { padding, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // ------------------------------------------------------- vehicle layer (per rAF)
  function updateVehicleLayer() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const f = frameRef.current;
    const layers = [...staticLayersRef.current];
    if (f && f.corridorId === propsRef.current.focused) {
      const g = geomsRef.current.get(f.corridorId);
      const model = propsRef.current.models.get(f.corridorId);
      if (g && model) {
        const scenario = propsRef.current.scenarios[f.corridorId];
        const n = f.count;
        const v = vehRef.current;
        if (v.positions.length < n * 2) {
          v.positions = new Float32Array(n * 2 + 512);
          v.colors = new Uint8Array(n * 4 + 1024);
          v.radii = new Float32Array(n + 256);
        }
        const pt: [number, number] = [0, 0];
        // segment barrier lookup: sorted boundaries
        const segs = model.segments;
        let si = 0;
        // vehicles come roughly sorted by offset per direction; simple scan reset each vehicle
        for (let i = 0; i < n; i++) {
          const off = f.offsetM[i];
          // find segment (linear from last hit; resets when moving backwards)
          if (si >= segs.length || off < segs[si].fromM) si = 0;
          while (si < segs.length - 1 && off > segs[si].toM) si++;
          const seg = segs[si];
          const eff = effective(seg, scenario);
          const barrier = eff.config !== 'S1';
          const lat = laneLateral(f.dir[i], f.lane[i], barrier);
          offsetToLonLat(g, off, lat, pt);
          v.positions[i * 2] = pt[0];
          v.positions[i * 2 + 1] = pt[1];
          const truck = f.isTruck[i] === 1;
          const overtaking = !barrier && f.lane[i] === 1;
          const ci = i * 4;
          if (overtaking) {
            v.colors[ci] = 255; v.colors[ci + 1] = 210; v.colors[ci + 2] = 63; v.colors[ci + 3] = 255;
          } else if (truck) {
            v.colors[ci] = 255; v.colors[ci + 1] = 179; v.colors[ci + 2] = 92; v.colors[ci + 3] = 235;
          } else {
            v.colors[ci] = 234; v.colors[ci + 1] = 242; v.colors[ci + 2] = 255; v.colors[ci + 3] = 215;
          }
          v.radii[i] = truck ? 42 : 26;
        }
        v.count = n;
        layers.push(
          new ScatterplotLayer({
            id: 'vehicles',
            data: {
              length: n,
              attributes: {
                getPosition: { value: v.positions.subarray(0, n * 2), size: 2 },
                getFillColor: { value: v.colors.subarray(0, n * 4), size: 4, normalized: true },
                getRadius: { value: v.radii.subarray(0, n), size: 1 },
              },
            },
            radiusUnits: 'meters',
            radiusMinPixels: 1.6,
            radiusMaxPixels: 6,
            stroked: false,
            // new buffer object identity each frame is required for deck to re-upload
            updateTriggers: { getPosition: f.timeS, getFillColor: f.timeS, getRadius: f.timeS },
          }),
        );
      }
    }
    overlay.setProps({ layers: layers as never });
  }

  // Inline position/inset: maplibre's stylesheet sets .maplibregl-map{position:relative}
  // which would override the Tailwind utility and collapse the container to 0 height.
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
