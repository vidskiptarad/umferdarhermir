/**
 * Build CorridorDemand (data/demand.json) per CONTRACTS.md "Demand profiles".
 *
 * Hour-of-day curves are NOT published by Vegagerðin (research/01 §"Hourly");
 * they are constructed here from the commuter double-hump + summerhouse
 * directional pattern described in research/01 (SDU/VDU seasonality, Fri-outbound
 * / Sun-return peaks) and the capital-area temporal model. All shape choices are
 * marked ASSUMPTION. Magnitudes are normalized; only the SHAPE matters — absolute
 * volume comes from aadtRef × dayFactor in the engine (CONTRACTS "Spawning").
 *
 * Direction 0 (fwd) = away from Reykjavík; 1 (rev) = toward Reykjavík.
 */
import { CorridorDemand, CorridorId, DemandProfile } from '../../src/types';

const H = 24;
const gauss = (h: number, c: number, w: number, amp: number) =>
  amp * Math.exp(-((h - c) ** 2) / (2 * w * w));
const daylight = (h: number) => (h >= 6 && h <= 23 ? 1 : 0.3);

/** Normalize a fwd/rev pair so Σ(fwd)+Σ(rev) === 1 (CONTRACTS DemandProfile). */
function normalizePair(fwd: number[], rev: number[]): { hourSharesFwd: number[]; hourSharesRev: number[] } {
  const total = fwd.reduce((a, b) => a + b, 0) + rev.reduce((a, b) => a + b, 0);
  return {
    hourSharesFwd: fwd.map((v) => v / total),
    hourSharesRev: rev.map((v) => v / total),
  };
}

function curve(fn: (h: number) => number): number[] {
  return Array.from({ length: H }, (_, h) => Math.max(0, fn(h)));
}

/**
 * Radial commuter corridor (north/south): AM peak inbound (rev, toward Rvk),
 * PM peak outbound (fwd). ASSUMPTION shapes anchored to capital-area model.
 */
function commuterPresets(sduRatio: number): CorridorDemand['presets'] {
  // typical weekday
  const wFwd = curve((h) => 0.15 * daylight(h) + gauss(h, 17, 1.6, 1.0) + gauss(h, 12, 3, 0.28));
  const wRev = curve((h) => 0.15 * daylight(h) + gauss(h, 8, 1.6, 1.0) + gauss(h, 12, 3, 0.28));
  // Friday summer: strong PM outbound hump 14–19 (research/01 Fri-outbound peak)
  const fFwd = curve((h) => 0.13 * daylight(h) + gauss(h, 16.5, 2.6, 1.5) + gauss(h, 8, 1.6, 0.25));
  const fRev = curve((h) => 0.13 * daylight(h) + gauss(h, 8, 1.6, 0.5) + gauss(h, 17, 2.4, 0.3));
  // Sunday return: strong PM inbound hump 15–20
  const sFwd = curve((h) => 0.12 * daylight(h) + gauss(h, 11, 3, 0.4) + gauss(h, 16, 2.5, 0.25));
  const sRev = curve((h) => 0.12 * daylight(h) + gauss(h, 18, 2.6, 1.5));
  return {
    typicalWeekday: { ...normalizePair(wFwd, wRev), dayFactor: 1.0 },
    fridaySummer: { ...normalizePair(fFwd, fRev), dayFactor: +(sduRatio * 1.15).toFixed(3) },
    sundayReturn: { ...normalizePair(sFwd, sRev), dayFactor: +(sduRatio * 1.1).toFixed(3) },
  };
}

/**
 * KEF: flatter all-day curve + early-morning airport departure bump; near-symmetric
 * directions (research/01: urban half flat SDU/VDU ≈ 1.0, airport summer bulge).
 */
function airportPresets(): CorridorDemand['presets'] {
  const base = (h: number) => 0.5 * daylight(h);
  const wFwd = curve((h) => base(h) + gauss(h, 5, 1.4, 0.55) + gauss(h, 17, 2.2, 0.55) + gauss(h, 8, 2, 0.3));
  const wRev = curve((h) => base(h) + gauss(h, 8, 2, 0.5) + gauss(h, 15, 3, 0.5) + gauss(h, 23, 2, 0.35));
  const fFwd = curve((h) => base(h) + gauss(h, 5, 1.4, 0.55) + gauss(h, 15, 3, 0.7));
  const fRev = curve((h) => base(h) + gauss(h, 9, 2.5, 0.5) + gauss(h, 18, 3, 0.5));
  const sFwd = curve((h) => base(h) + gauss(h, 5, 1.4, 0.55) + gauss(h, 12, 3, 0.5));
  const sRev = curve((h) => base(h) + gauss(h, 17, 3, 0.6));
  // CONTRACTS "Demand profiles": KEF corridor dayFactor ≈ 1.0 / 1.05 — flat urban
  // commuter base with only a mild summer bulge, so both peak presets use 1.05.
  return {
    typicalWeekday: { ...normalizePair(wFwd, wRev), dayFactor: 1.0 },
    fridaySummer: { ...normalizePair(fFwd, fRev), dayFactor: 1.05 },
    sundayReturn: { ...normalizePair(sFwd, sRev), dayFactor: 1.05 },
  };
}

export function buildDemand(
  corridorId: CorridorId,
  aadtRef: number,
  sduRef: number
): CorridorDemand {
  const sduRatio = sduRef > 0 && aadtRef > 0 ? sduRef / aadtRef : 1.15;
  // ASSUMPTION (CONTRACTS "Truck share"): 0.10 north/south rural, 0.06 kef.
  const truckShare = corridorId === 'kef' ? 0.06 : 0.1;
  const presets =
    corridorId === 'kef' ? airportPresets() : commuterPresets(sduRatio);
  return { corridorId, aadtRef, truckShare, presets };
}

/** Sanity: each preset's fwd+rev shares sum to ~1. */
export function validateProfile(p: DemandProfile): boolean {
  const s = p.hourSharesFwd.reduce((a, b) => a + b, 0) + p.hourSharesRev.reduce((a, b) => a + b, 0);
  return Math.abs(s - 1) < 1e-6;
}
