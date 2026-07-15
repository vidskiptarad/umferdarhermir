/**
 * Generate the blog-post SVG charts from data/sweep-results.json — Viðskiptaráð Íslands (VÍ) brand.
 *
 * VÍ palette, validated for a light surface (#ffffff), categorical two-series
 * (baseline "í dag" vs upgrade "sviðsmynd"):
 *   BLUE  #006bb3  VÍ lightblue  — baseline "í dag"
 *   GOLD  #c46a00  VÍ orange     — upgrade "sviðsmynd"
 *                                  (darkened from brand #fb8b24, which fails 3:1
 *                                  contrast vs white at 2.38; #c46a00 passes)
 *   validate_palette.js "#006bb3,#c46a00" --mode light --surface "#ffffff"
 *     [PASS] Lightness band · [PASS] Chroma floor · [PASS] CVD separation · [PASS] Contrast vs surface
 *
 * Stacked time+safety bars use same-hue VÍ blues:
 *   STACK_TIME   #004e82  VÍ blue  (tímasparnaður)
 *   STACK_SAFETY #0f2545  VÍ navy  (slysaábati)
 * Standalone benefit bars also use STACK_TIME #004e82; the lighter 2026 shade is #7fb2d6.
 *
 * Font: IBM Plex Sans. Icelandic labels, comma decimals. Data/layout identical to charts.mjs.
 * Output: /tmp/umferd-vi-assets/charts/*.svg
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/umferd-vi-assets/charts';
mkdirSync(outDir, { recursive: true });

const { results, charts } = JSON.parse(readFileSync(join(root, 'data/sweep-results.json'), 'utf8'));

const BLUE = '#006bb3'; // VÍ lightblue — baseline "í dag" (validated vs GOLD)
const STACK_TIME = '#004e82'; // VÍ blue — stacked tímasparnaður + standalone benefit bars
const STACK_SAFETY = '#0f2545'; // VÍ navy — stacked slysaábati
const BLUE_DARK = '#0f2545'; // VÍ navy — illustration accents
const GOLD = '#c46a00'; // VÍ orange (darkened) — upgrade "sviðsmynd" (validated vs BLUE)
const BLUE_LIGHT = '#7fb2d6'; // light VÍ blue — 2026 shade (chart 4)
const INK = '#333333'; // VÍ ink
const INK2 = '#6a768f'; // VÍ bluegrey — secondary text
const GRID = '#dce4ec'; // VÍ light bluegrey — gridlines
const FONT = `font-family="'IBM Plex Sans','Helvetica','Arial',sans-serif"`;

const isk = (v) => {
  const b = v / 1e9;
  return `${b >= 10 ? b.toFixed(1).replace('.', ',') : b.toFixed(2).replace('.', ',')} ma.kr.`;
};
const num = (v, d = 0) => v.toFixed(d).replace('.', ',');

const NAMES = {
  'north|all-d2-110': 'Rvk–Borgarnes: allt 2+2 + 110',
  'north|all-d2-90': 'Rvk–Borgarnes: allt 2+2 (90)',
  'north|hvalfj-borgarnes-d2': 'Hvalfjörður–Borgarnes: 1+1 → 2+2',
  'north|tunnel2': 'Hvalfjarðargöng II (ein og sér)',
  'north|kjalarnes-d2': 'Kjalarnes: 2+1 → 2+2 (eitt og sér)',
  'south|all-d2-110': 'Rvk–Selfoss: allt 2+2 + 110',
  'south|all-d2-90': 'Rvk–Selfoss: allt 2+2 (90)',
  'south|hellisheidi-d2': 'Hellisheiði: 2+1 → 2+2 (ein og sér)',
  'south|olfus-4th': 'Ölfus: fjórða akreinin (ein og sér)',
  'kef|both': 'Reykjanesbraut: 110 + mislæg gatnamót',
  'kef|110': 'Reykjanesbraut: 90 → 110 (aðeins skilti)',
  'kef|junctions': 'Reykjanesbraut: mislæg gatnamót',
};

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${FONT} font-size="13">
<rect width="${w}" height="${h}" fill="white"/>
${body}</svg>`;
}

// ---------------------------------------------------------------- 1. ranked bars
{
  const packages = ['north|all-d2-110', 'south|all-d2-110', 'kef|both'];
  const rows1 = results.filter((r) => r.scale === 1 && packages.includes(`${r.corridor}|${r.scenario}`));
  const rows2 = results.filter(
    (r) =>
      r.scale === 1 &&
      !packages.includes(`${r.corridor}|${r.scenario}`) &&
      !['north|all-d2-90', 'south|all-d2-90'].includes(`${r.corridor}|${r.scenario}`),
  );
  const W = 760;
  const barH = 26;
  const gap = 10;
  const left = 300;
  const right = 108; // widened from 90: IBM Plex Sans is wider — keep value labels inside the viewBox
  const maxV = Math.max(...results.filter((r) => r.scale === 1).map((r) => r.benefits.totalISKPerYear));
  const scaleX = (v) => (v / maxV) * (W - left - right);
  let y = 46;
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Árlegur þjóðhagslegur ábati eftir framkvæmd</text>
<text x="16" y="41" fill="${INK2}" font-size="12">ma.kr. á ári (fyrsta ár): tímasparnaður og slysaábati.</text>`;
  const group = (title, rows) => {
    y += 22;
    body += `<text x="16" y="${y}" font-size="11" font-weight="700" letter-spacing="1.5" fill="${INK2}">${title}</text>`;
    y += 8;
    for (const r of rows) {
      const name = NAMES[`${r.corridor}|${r.scenario}`] ?? r.scenario;
      const t = scaleX(r.benefits.timeISKPerYear);
      const s = scaleX(r.benefits.safetyISKPerYear);
      body += `<text x="${left - 10}" y="${y + barH / 2 + 4}" text-anchor="end" fill="${INK}">${name}</text>
<rect x="${left}" y="${y}" width="${Math.max(t, 1.5)}" height="${barH}" rx="3" fill="${STACK_TIME}"/>`;
      if (s > 1) body += `<rect x="${left + t + 2}" y="${y}" width="${s}" height="${barH}" rx="3" fill="${STACK_SAFETY}"/>`;
      body += `<text x="${left + t + s + 8}" y="${y + barH / 2 + 4}" fill="${INK}" font-weight="700">${isk(r.benefits.totalISKPerYear)}</text>`;
      y += barH + gap;
    }
  };
  group('HEILDARUPPBYGGING (EKKI SAMLEGGJANLEGT VIÐ EINSTAKA HLUTA)', rows1);
  group('EINSTAKAR FRAMKVÆMDIR', rows2);
  y += 14;
  body += `<rect x="${left}" y="${y}" width="12" height="12" rx="2" fill="${STACK_TIME}"/><text x="${left + 18}" y="${y + 10}" fill="${INK2}" font-size="12">Tímasparnaður</text>
<rect x="${left + 130}" y="${y}" width="12" height="12" rx="2" fill="${STACK_SAFETY}"/><text x="${left + 148}" y="${y + 10}" fill="${INK2}" font-size="12">Slysaábati</text>`;
  writeFileSync(join(outDir, 'rodun-framkvaemda.svg'), svgDoc(W, y + 34, body));
}

// ---------------------------------------------------------------- 2. distribution
{
  const c = charts.northFriday;
  const W = 760;
  const H = 300;
  const left = 50;
  const bottom = H - 48;
  const top = 56;
  const bw = (W - left - 20) / c.distBaseline.length;
  const peak = Math.max(...c.distBaseline, ...c.distUpgrade);
  const yScale = (v) => bottom - (v / peak) * (bottom - top);
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Dreifing ferðatíma: Reykjavík → Borgarnes, föstudagur að sumri</text>
<text x="16" y="41" fill="${INK2}" font-size="12">Fjöldi ferða eftir ferðatíma: í dag (blátt) og eftir 2+2 + 110 (appelsínugult)</text>
<line x1="${left}" y1="${bottom}" x2="${W - 20}" y2="${bottom}" stroke="${GRID}" stroke-width="1.5"/>`;
  for (let i = 0; i < c.distBaseline.length; i++) {
    const x = left + i * bw;
    const hb = yScale(c.distBaseline[i]);
    const hu = yScale(c.distUpgrade[i]);
    body += `<rect x="${x + 0.5}" y="${hb}" width="${bw - 2}" height="${bottom - hb}" rx="1.5" fill="${BLUE}" opacity="0.5"/>
<rect x="${x + 0.5}" y="${hu}" width="${bw - 2}" height="${bottom - hu}" rx="1.5" fill="${GOLD}" opacity="0.8"/>`;
  }
  for (let m = 30; m <= 240; m += 30) {
    const x = left + ((m - c.distMinM) / c.distW) * bw;
    body += `<text x="${x}" y="${bottom + 18}" text-anchor="middle" fill="${INK2}" font-size="11">${m}</text>`;
  }
  body += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" fill="${INK2}" font-size="11">mínútur</text>
<rect x="${W - 260}" y="${top - 22}" width="12" height="12" rx="2" fill="${BLUE}" opacity="0.5"/><text x="${W - 243}" y="${top - 12}" fill="${INK2}" font-size="12">Í dag</text>
<rect x="${W - 180}" y="${top - 22}" width="12" height="12" rx="2" fill="${GOLD}" opacity="0.8"/><text x="${W - 163}" y="${top - 12}" fill="${INK2}" font-size="12">Eftir uppbyggingu</text>`;
  writeFileSync(join(outDir, 'dreifing-nordur.svg'), svgDoc(W, H, body));
}

// ---------------------------------------------------------------- 3. hour curves
{
  const c = charts.northFriday;
  const W = 760;
  const H = 320;
  const left = 56;
  const bottom = H - 48;
  const top = 62;
  const hours = [...Array(24).keys()];
  const vals = [...c.hoursBaseline, ...c.hoursUpgrade].filter((v) => v != null).map((v) => v / 60);
  const maxY = Math.ceil(Math.max(...vals) / 30) * 30;
  const xS = (h) => left + (h / 23) * (W - left - 24);
  const yS = (m) => bottom - (m / maxY) * (bottom - top);
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Ferðatími eftir brottfarartíma: Reykjavík → Borgarnes, föstudagur að sumri</text>
<text x="16" y="41" fill="${INK2}" font-size="12">Miðgildi ferðatíma (mín.) eftir klukkustund brottfarar</text>`;
  for (let m = 0; m <= maxY; m += 30) {
    body += `<line x1="${left}" y1="${yS(m)}" x2="${W - 24}" y2="${yS(m)}" stroke="${GRID}"/>
<text x="${left - 8}" y="${yS(m) + 4}" text-anchor="end" fill="${INK2}" font-size="11">${m}</text>`;
  }
  const line = (arr, color, label, labelAtHour) => {
    const pts = hours.filter((h) => arr[h] != null).map((h) => `${xS(h)},${yS(arr[h] / 60)}`);
    let s = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const lh = labelAtHour;
    if (arr[lh] != null)
      s += `<text x="${xS(lh)}" y="${yS(arr[lh] / 60) - 10}" fill="${color}" font-weight="700" font-size="12">${label}</text>`;
    return s;
  };
  body += line(c.hoursBaseline, BLUE, 'Í dag', 14);
  body += line(c.hoursUpgrade, GOLD, 'Eftir 2+2 + 110', 6);
  for (let h = 0; h <= 23; h += 3) {
    body += `<text x="${xS(h)}" y="${bottom + 18}" text-anchor="middle" fill="${INK2}" font-size="11">${String(h).padStart(2, '0')}</text>`;
  }
  body += `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" fill="${INK2}" font-size="11">brottför (klst)</text>`;
  writeFileSync(join(outDir, 'klukkukurfa-nordur.svg'), svgDoc(W, H, body));
}

// ---------------------------------------------------------------- 4. sensitivity
{
  const rows = [
    ['north', 'Rvk–Borgarnes (allt 2+2 + 110)'],
    ['south', 'Rvk–Selfoss (allt 2+2 + 110)'],
  ];
  const W = 720;
  const H = 250;
  const left = 260;
  const barH = 24;
  const maxV = Math.max(
    ...results.filter((r) => r.scenario === 'all-d2-110').map((r) => r.benefits.totalISKPerYear),
  );
  const sX = (v) => (v / maxV) * (W - left - 190);
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Ábatinn vex með umferðinni</text>
<text x="16" y="41" fill="${INK2}" font-size="12">Árlegur ábati við umferð dagsins í dag og við ~23% meiri umferð (spá ~2035)</text>`;
  let y = 66;
  for (const [cid, label] of rows) {
    const v1 = results.find((r) => r.corridor === cid && r.scenario === 'all-d2-110' && r.scale === 1);
    const v2 = results.find((r) => r.corridor === cid && r.scenario === 'all-d2-110' && r.scale === 1.23);
    body += `<text x="${left - 10}" y="${y + barH + 2}" text-anchor="end" fill="${INK}">${label}</text>
<rect x="${left}" y="${y}" width="${sX(v1.benefits.totalISKPerYear)}" height="${barH}" rx="3" fill="${BLUE_LIGHT}"/>
<text x="${left + sX(v1.benefits.totalISKPerYear) + 8}" y="${y + 17}" fill="${INK}">${isk(v1.benefits.totalISKPerYear)} <tspan fill="${INK2}">(2026)</tspan></text>
<rect x="${left}" y="${y + barH + 6}" width="${sX(v2.benefits.totalISKPerYear)}" height="${barH}" rx="3" fill="${STACK_TIME}"/>
<text x="${left + sX(v2.benefits.totalISKPerYear) + 8}" y="${y + barH + 23}" fill="${INK}" font-weight="700">${isk(v2.benefits.totalISKPerYear)} <tspan fill="${INK2}" font-weight="400">(~2035)</tspan></text>`;
    y += barH * 2 + 40;
  }
  writeFileSync(join(outDir, 'naemni-2035.svg'), svgDoc(W, y + 8, body));
}

// ---------------------------------------------------------------- 5. per-km efficiency
{
  const rows = results
    .filter((r) => r.scale === 1 && r.km.rebuildKm > 0.5)
    .map((r) => ({
      name: NAMES[`${r.corridor}|${r.scenario}`] ?? r.scenario,
      perKm: r.benefits.totalISKPerYear / r.km.rebuildKm,
      km: r.km.rebuildKm,
    }))
    .sort((a, b) => b.perKm - a.perKm);
  const W = 760;
  const barH = 24;
  const left = 300;
  const maxV = Math.max(...rows.map((r) => r.perKm));
  const sX = (v) => (v / maxV) * (W - left - 175);
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Ábati á hvern uppbyggðan kílómetra</text>
<text x="16" y="41" fill="${INK2}" font-size="12">m.kr. á ári á km af nýrri 2+2 akbraut, mælikvarði á hagkvæmni óháð heildarstærð</text>`;
  let y = 62;
  for (const r of rows) {
    body += `<text x="${left - 10}" y="${y + 16}" text-anchor="end" fill="${INK}">${r.name}</text>
<rect x="${left}" y="${y}" width="${Math.max(sX(r.perKm), 1.5)}" height="${barH}" rx="3" fill="${STACK_TIME}"/>
<text x="${left + sX(r.perKm) + 8}" y="${y + 16}" fill="${INK}" font-weight="700">${num(r.perKm / 1e6, 0)} m.kr./km <tspan fill="${INK2}" font-weight="400">(${num(r.km, 0)} km)</tspan></text>`;
    y += barH + 10;
  }
  body += `<text x="16" y="${y + 16}" fill="${INK2}" font-size="11">Reykjanesbraut 90 → 110 er ekki á myndinni: þar þarf enga nýja akbraut, aðeins ný skilti (2,2 ma.kr. á ári).</text>`;
  writeFileSync(join(outDir, 'abati-per-km.svg'), svgDoc(W, y + 34, body));
}

// ---------------------------------------------------------------- 6. model illustration
{
  const W = 760;
  const H = 300;
  const roadY = 120;
  let body = `<text x="16" y="24" font-size="15" font-weight="700" fill="${INK}">Af hverju er 1+1 vegur hægur? Bílalest og framúrakstur</text>
<text x="16" y="41" fill="${INK2}" font-size="12">Hermilíkanið hermir hvern bíl: löngunarhraði, bil í umferð á móti og framúrakstur</text>
<rect x="40" y="${roadY - 34}" width="680" height="68" rx="6" fill="#f2f6f9"/>
<line x1="40" y1="${roadY}" x2="720" y2="${roadY}" stroke="#c3ced8" stroke-width="2" stroke-dasharray="14 10"/>`;
  // platoon (fwd, bottom lane): truck + queue
  const carW = 26;
  const carH = 13;
  const truckX = 420;
  body += `<rect x="${truckX}" y="${roadY + 8}" width="44" height="16" rx="3" fill="${BLUE_DARK}"/>
<text x="${truckX + 22}" y="${roadY + 48}" text-anchor="middle" fill="${BLUE_DARK}" font-size="11" font-weight="700">Flutningabíll á 78 km/klst</text>`;
  for (let i = 0; i < 5; i++) {
    body += `<rect x="${truckX - 34 - i * 36}" y="${roadY + 10}" width="${carW}" height="${carH}" rx="3" fill="${STACK_TIME}"/>`;
  }
  body += `<path d="M ${truckX - 190} ${roadY + 44} h 148" stroke="${INK2}" stroke-width="1"/>
<text x="${truckX - 116}" y="${roadY + 58}" text-anchor="middle" fill="${INK2}" font-size="11">bílalest: allir á hraða flutningabílsins</text>`;
  // oncoming (top lane)
  for (const x of [120, 250, 560]) {
    body += `<rect x="${x}" y="${roadY - 24}" width="${carW}" height="${carH}" rx="3" fill="#94a3b3"/>`;
  }
  body += `<text x="180" y="${roadY - 42}" fill="${INK2}" font-size="11">umferð á móti: framúrakstur þarf nægt bil</text>
<path d="M 276 ${roadY - 17} L 560 ${roadY - 17}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 4"/>
<text x="418" y="${roadY - 22}" text-anchor="middle" fill="${GOLD}" font-size="11" font-weight="700">bilið sem þarf: ~450–600 m</text>`;
  // overtaking car
  body += `<rect x="330" y="${roadY - 8}" width="${carW}" height="${carH}" rx="3" fill="${GOLD}"/>
<path d="M 310 ${roadY + 16} C 320 ${roadY + 2}, 322 ${roadY - 2}, 332 ${roadY - 3}" stroke="${GOLD}" stroke-width="1.5" fill="none"/>
<text x="40" y="${roadY + 92}" fill="${INK}" font-size="12.5">Í líkaninu fær hver bíll <tspan font-weight="700">löngunarhraða</tspan> (t.d. 92 ± 8 km/klst, mælt á íslenskum þjóðvegum). Sá sem lendir á eftir</text>
<text x="40" y="${roadY + 110}" fill="${INK}" font-size="12.5">hægari bíl kemst aðeins fram úr ef nógu stórt bil er í umferðinni á móti. Þegar umferð þyngist hverfa bilin,</text>
<text x="40" y="${roadY + 128}" fill="${INK}" font-size="12.5">og allir sitja fastir í bílalestinni. Þetta er kjarninn í töfunum á 1+1 vegi.</text>`;
  writeFileSync(join(outDir, 'likan-skyring.svg'), svgDoc(W, H, body));
}

console.log('charts written to', outDir);
