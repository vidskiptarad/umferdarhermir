/**
 * Icelandic-locale formatting helpers.
 * Hand-rolled: browser ICU builds often lack the `is`/`is-IS` locale and silently
 * fall back to en-US, so toLocaleString is unreliable. Icelandic convention:
 * thousands separator "." and decimal comma.
 */

export function isNum(v: number, maxFrac = 0): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  const fixed = abs.toFixed(maxFrac);
  const [intPart, frac] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // trim trailing zero decimals ("11,0" → "11")
  const fracTrimmed = frac ? frac.replace(/0+$/, '') : '';
  return `${neg ? '−' : ''}${grouped}${fracTrimmed ? ',' + fracTrimmed : ''}`;
}

export function fmtMin(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 90) return `${isNum(m)} mín`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h} klst ${rem} mín`;
}

export function fmtDeltaMin(seconds: number): string {
  const m = seconds / 60;
  const sign = m <= -0.05 ? '−' : m >= 0.05 ? '+' : '±';
  return `${sign}${isNum(Math.abs(m), 1)} mín`;
}

/** ISK amounts: 1234 → "1.234 kr.", 5.6e9 → "5,6 ma.kr." */
export function fmtISK(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${isNum(abs / 1e9, 1)} ma.kr.`;
  if (abs >= 1e6) return `${sign}${isNum(abs / 1e6)} m.kr.`;
  return `${sign}${isNum(abs)} kr.`;
}

export function fmtInt(v: number): string {
  return isNum(v);
}

export function fmtClock(simSeconds: number, startHour = 0): string {
  const t = (startHour * 3600 + simSeconds) % 86400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtKmh(v: number): string {
  return `${Math.round(v)} km/klst`;
}
