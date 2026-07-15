import { describe, it, expect } from 'vitest';
import { iidmAccel, equilibriumGap, CAR } from '../iidm';

const A = (v: number, vLead: number, s: number, v0: number, p = CAR) =>
  iidmAccel(v, vLead, s, v0, p.T, p.a, p.b, p.s0, p.delta);

describe('IIDM car-following', () => {
  it('equilibrium gap gives ~zero acceleration (closed form s0 + v*T)', () => {
    const v = 25;         // 90 km/h
    const v0 = 30;        // desired higher than current
    const s = equilibriumGap(v, CAR.s0, CAR.T); // 2 + 25*1.3 = 34.5
    expect(s).toBeCloseTo(34.5, 6);
    const a = A(v, v, s, v0);
    expect(Math.abs(a)).toBeLessThan(1e-6);
  });

  it('free acceleration (no leader) approaches v0 and never overshoots', () => {
    let v = 0;
    const v0 = 25;
    const dt = 0.25;
    for (let i = 0; i < 4000; i++) {
      const a = A(v, v, Infinity, v0);
      v = Math.max(0, v + a * dt);
    }
    expect(v).toBeGreaterThan(24.9);
    expect(v).toBeLessThan(25.05); // IIDM does not overshoot v0
  });

  it('does not overbrake when v > v0 (IIDM fix)', () => {
    const a = A(30, 30, Infinity, 25); // 108 km/h wanting 90
    expect(a).toBeLessThan(0);         // decelerates
    expect(a).toBeGreaterThan(-2);     // but gently, not a hard brake
  });

  it('two-vehicle chase over 20 min never collides and settles behind slow leader', () => {
    // Leader constant 20 m/s; follower starts 30 m behind at 25 m/s wanting 30.
    const dt = 0.25;
    const vLead = 20;
    let xLead = 30;      // front bumper
    let xF = 0;          // follower front bumper
    let vF = 25;
    let minGap = Infinity;
    for (let i = 0; i < 4800; i++) {   // 1200 s
      const gap = xLead - CAR.len - xF;
      minGap = Math.min(minGap, gap);
      const a = A(vF, vLead, gap, 30);
      vF = Math.max(0, vF + a * dt);
      xF += vF * dt + 0.5 * a * dt * dt;
      xLead += vLead * dt;
    }
    expect(minGap).toBeGreaterThan(0);          // never collides
    expect(vF).toBeGreaterThan(19.8);           // matches leader speed
    expect(vF).toBeLessThan(20.2);
  });
});
