# Umferð

Agent-based traffic simulator for the three main corridors out of Reykjavík (north to Borgarnes, east to Selfoss, west to Keflavík airport), calibrated to real Vegagerðin data.

Every driver is simulated (IIDM car-following, gap-acceptance overtaking against oncoming traffic on 1+1 roads, MOBIL lane changes on 2+1/2+2). Flip segments to 2+2, add a second Hvalfjörður tunnel bore, raise 90 → 110 km/h, and see the effect on travel times and the annual economic benefit in ISK (time savings + accidents/injuries/deaths avoided). Benefits only; no construction-cost estimates.

**Live: [vi.is/umferdarhermir](https://vi.is/umferdarhermir)**. Everything runs client-side (no backend): the engine simulates in Web Workers, baselines ship precomputed.

- **[PLAN.md](./PLAN.md)**: architecture, model stack, data sources, visual design
- **[CONTRACTS.md](./CONTRACTS.md)**: the binding types/semantics between pipeline, engine, econ, and UI
- **[research/](./research/)**: seven sourced research reports (traffic counts + live APIs, road configuration, value of time, simulation methodology, GIS data, observed speeds, 110 km/h Nordic comparison)

## Development

```bash
npm install
npm run pipeline    # rebuild corridor models from OSM + Vegagerðin (cached after first run)
npm run baselines   # precompute baseline 24h aggregates (~15 min, deterministic)
npm run calibrate   # engine calibration table vs observed targets
npm test            # engine + econ unit tests
npm run dev         # app at localhost:3000/umferdarhermir
```

Deploy: `vercel deploy --prod` (project `umferdarhermir`, team `vidskiptarad-islands`); vi.is/umferdarhermir is a rewrite in the vi.is site.

## Known caveats (v1)

- Friday/Sunday demand hour-shapes are constructed (documented assumptions), not measured; the Friday-peak congestion baseline is on the pessimistic side. Calibrating against Vegagerðin's live 7-day per-station feed is the top v1.1 item.
- Heavy-vehicle share (10%/6%) is a planning assumption; Vegagerðin doesn't publish the classified split.
- Safety benefits use CPI-adjusted 2013 accident costs (conservative) and config-based reduction factors.
- Centerline draws small loops at two roundabouts (cosmetic).

Built 2026-07-12: research → contracts → parallel build (pipeline/engine/econ/UI) → adversarial reviews → browser smoketest → deploy.
