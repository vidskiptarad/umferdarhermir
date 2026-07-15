/**
 * Generate the FOUR published skoðun charts for „Föst á sjötíu" in the
 * Viðskiptaráð Íslands HOUSE CHART TEMPLATE.
 *
 * Calibrated glyph-by-glyph against the two most recent chart-heavy skoðanir:
 *   - baetur-i-blindgotu (maí 2026): b1/b2/b3/b5/b6 in /tmp/umferd-vi-assets/house-ref
 *   - atlantshafsalagid (feb 2026): atl4 (left group boxes + top-right legend)
 *
 * Measured at 1583 px canvas width:
 *   corner block  x=95 y=0 205x17 navy
 *   eyebrow       27px  #94A4B9  ls 3     baseline y=108
 *   headline      44px  700  #002647     first baseline y=158, line pitch 58
 *   subline       38px  400  #16212E     baseline = last head baseline + 100
 *   y ticks       36px  #16212E  LEFT-ALIGNED at x=95 (align with title block)
 *   x ticks       36px  #16212E
 *   value labels  38px  #16212E
 *   grid          dashed #C9D4E0 2px, from x=215
 *   axes          #000 3px; bars OUTLINED #000 2px, square corners (no rx)
 *   legend        30px, chips 26x26 outlined, right-aligned below subline
 *   footnotes     30px #94A4B9, line height 40, last baseline H-82
 *   logo          266x90 (house asset extracted at 3x), right edge x=1494,
 *                 bottom margin 46
 *
 * Font: IBM Plex Sans. Icelandic labels, decimal commas, no em-dashes.
 * Output SVGs: /tmp/umferd-vi-assets/charts2/*.svg (render step: rsvg-convert 2x)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/umferd-vi-assets/charts2';
mkdirSync(outDir, { recursive: true });

const { results, charts } = JSON.parse(readFileSync(join(root, 'data/sweep-results.json'), 'utf8'));

// ---- house palette ----------------------------------------------------------
const BG = '#F3F7FB';
const NAVY = '#002647';
const SKY = '#7ACCFE';
const GOLD = '#E1BD1F';
const GREY = '#94A4B9';
const INK = '#16212E';
const GRID = '#C9D4E0';
const BOXFILL = '#E9EEF5';
const BOXLINE = '#B9C4D4';
const ROAD = '#E4EBF2';
const CARGREY = '#9AA9BA';

const FONT = `font-family="'IBM Plex Sans','Helvetica','Arial',sans-serif"`;
const LOGO = readFileSync('/tmp/umferd-vi-assets/vi-logo-house-3x.png').toString('base64');
const LOGO_W = 266;
const LOGO_H = 90;

// ---- number helpers ---------------------------------------------------------
const dec1 = (v) => v.toFixed(1).replace('.', ',');
const bn = (iskPerYear) => dec1(iskPerYear / 1e9);

// ---- house frame ------------------------------------------------------------
const W = 1583;
const ML = 95; // universal left edge: block, eyebrow, headline, subline, y ticks
const CR = 1494; // universal right edge: plot right, legend right, logo right
const PLOTL = 215; // plot area starts right of the y-tick column

const EYEBROW_SIZE = 27;
const HEAD_SIZE = 44;
const HEAD_LH = 58;
const SUB_SIZE = 38;
const TICK = 36;
const VALUE = 38;

/**
 * Assemble a full house-template SVG.
 * legend: optional [{color,label}] — chips right-aligned below the subline.
 * footnotes: lines above the bottom edge (last is usually Heimildir).
 */
function houseChart({ eyebrow, headLines, subline, legend, footnotes, draw }) {
  const headB0 = 158;
  const headBottom = headB0 + (headLines.length - 1) * HEAD_LH;
  const subY = headBottom + 80;
  let legendSvg = '';
  let contentTop = subY + 70;
  if (legend) {
    const legY = subY + 64;
    let parts = [];
    for (const { color, label } of legend) {
      parts.push({ color, label, w: 26 + 12 + label.length * 15.5 + 44 });
    }
    let x = CR - parts.reduce((a, p) => a + p.w, 0) + 44;
    for (const p of parts) {
      legendSvg += `<rect x="${x}" y="${legY - 21}" width="26" height="26" fill="${p.color}" stroke="#000" stroke-width="2"/>`;
      legendSvg += `<text x="${x + 38}" y="${legY}" font-size="30" fill="${INK}">${p.label}</text>`;
      x += p.w;
    }
    contentTop = legY + 56;
  }

  const { body, height } = draw(contentTop);
  const contentBottom = contentTop + height;
  const nLines = footnotes.length;
  const H = Math.round(contentBottom + 70 + nLines * 40 + 82);

  const logoX = CR - LOGO_W;
  const logoY = H - 46 - LOGO_H;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>`;
  s += `<rect width="${W}" height="${H}" fill="${BG}"/>`;
  s += `<rect x="${ML}" y="0" width="205" height="17" fill="${NAVY}"/>`;
  s += `<text x="${ML}" y="108" font-size="${EYEBROW_SIZE}" font-weight="400" letter-spacing="2" fill="${GREY}">${eyebrow}</text>`;
  headLines.forEach((ln, i) => {
    s += `<text x="${ML}" y="${headB0 + i * HEAD_LH}" font-size="${HEAD_SIZE}" font-weight="700" fill="${NAVY}">${ln}</text>`;
  });
  s += `<text x="${ML}" y="${subY}" font-size="${SUB_SIZE}" font-weight="400" fill="${INK}">${subline}</text>`;
  s += legendSvg;
  s += body;
  footnotes.forEach((ln, i) => {
    const y = H - 82 - (nLines - 1 - i) * 40;
    s += `<text x="${ML}" y="${y}" font-size="30" fill="${GREY}">${ln}</text>`;
  });
  s += `<image x="${logoX}" y="${logoY}" width="${LOGO_W}" height="${LOGO_H}" href="data:image/png;base64,${LOGO}"/>`;
  s += `</svg>`;
  return s;
}

// ============================================================================
// MYND 1 — líkan-skýring: road schematic, generous vertical rhythm
// ============================================================================
{
  const svg = houseChart({
    eyebrow: 'MYND 1',
    headLines: ['Á 1+1 vegi ræður hægasti bíllinn ferðatíma allra'],
    subline: 'Bílalest og framúrakstur á 1+1 vegi',
    footnotes: ['Heimild: Umferðarhermir Viðskiptaráðs'],
    draw: (top) => {
      const height = 520;
      let b = '';
      const x0 = ML;
      const x1 = CR;

      // row 1: oncoming-traffic caption (grey)
      b += `<text x="${x0}" y="${top + 26}" fill="${GREY}" font-size="30">Umferð á móti: framúrakstur þarf nægilega stórt bil</text>`;

      // row 2: gold gap annotation
      const gapA = 560;
      const gapB = 1170;
      const gapTextY = top + 86;
      const gapLineY = top + 112;
      b += `<text x="${(gapA + gapB) / 2}" y="${gapTextY}" text-anchor="middle" fill="${GOLD}" font-size="30" font-weight="700">Nauðsynlegt bil til framúraksturs: 450m til 600m</text>`;
      b += `<line x1="${gapA}" y1="${gapLineY}" x2="${gapB}" y2="${gapLineY}" stroke="${GOLD}" stroke-width="3.5" stroke-dasharray="10 10"/>`;
      b += `<line x1="${gapA}" y1="${gapLineY - 12}" x2="${gapA}" y2="${gapLineY + 12}" stroke="${GOLD}" stroke-width="3.5"/>`;
      b += `<line x1="${gapB}" y1="${gapLineY - 12}" x2="${gapB}" y2="${gapLineY + 12}" stroke="${GOLD}" stroke-width="3.5"/>`;

      // road band: two lanes
      const roadT = top + 140;
      const roadH = 210;
      const roadC = roadT + roadH / 2;
      b += `<rect x="${x0}" y="${roadT}" width="${x1 - x0}" height="${roadH}" fill="${ROAD}"/>`;
      b += `<line x1="${x0 + 26}" y1="${roadC}" x2="${x1 - 26}" y2="${roadC}" stroke="#AEBDCC" stroke-width="4" stroke-dasharray="30 22"/>`;

      const car = (x, y, w, h, fill) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#000" stroke-width="1.5"/>`;

      // oncoming cars (top lane, driving left)
      const laneUpY = roadT + 34;
      for (const x of [250, 470, 1230, 1390]) b += car(x, laneUpY, 72, 34, CARGREY);

      // forward queue (bottom lane): sky cars bumper-to-bumper behind navy truck
      const laneDnY = roadC + 36;
      const truckW = 120;
      const truckH = 44;
      const truckX = 960;
      b += car(truckX, laneDnY - 5, truckW, truckH, NAVY);
      const carW = 72;
      const carH = 34;
      let firstCarX = truckX;
      for (let i = 0; i < 6; i++) {
        const cx = truckX - 22 - (i + 1) * (carW + 18);
        firstCarX = cx;
        b += car(cx, laneDnY, carW, carH, SKY);
      }
      // gold overtaker nosing across the centre line + arrow
      const ovX = 700;
      b += car(ovX, roadC - 17, carW, carH, GOLD);
      b += `<path d="M ${ovX - 40} ${laneDnY + 8} C ${ovX - 26} ${roadC + 6}, ${ovX - 14} ${roadC - 8}, ${ovX - 2} ${roadC - 8}" stroke="${GOLD}" stroke-width="3.5" fill="none"/>`;
      b += `<path d="M ${ovX - 2} ${roadC - 8} l -14 -7 m 14 7 l -14 9" stroke="${GOLD}" stroke-width="3.5" fill="none"/>`;

      // row: truck label (navy, bold) on its own line below the band
      b += `<text x="${truckX + truckW / 2}" y="${roadT + roadH + 46}" text-anchor="middle" fill="${NAVY}" font-size="30" font-weight="700">Flutningabíll á 78 km/klst</text>`;

      // row: brace + queue caption on the next line
      const braceY = roadT + roadH + 78;
      b += `<path d="M ${firstCarX} ${braceY} h ${truckX - 22 - firstCarX}" stroke="${GREY}" stroke-width="2.5"/>`;
      b += `<line x1="${firstCarX}" y1="${braceY - 8}" x2="${firstCarX}" y2="${braceY}" stroke="${GREY}" stroke-width="2.5"/>`;
      b += `<line x1="${truckX - 22}" y1="${braceY - 8}" x2="${truckX - 22}" y2="${braceY}" stroke="${GREY}" stroke-width="2.5"/>`;
      b += `<text x="${(firstCarX + truckX - 22) / 2}" y="${braceY + 40}" text-anchor="middle" fill="${GREY}" font-size="30">Bílalest: allir sitja fastir á hraða flutningabílsins</text>`;

      return { body: b, height };
    },
  });
  writeFileSync(join(outDir, 'mynd1.svg'), svg);
}

// ============================================================================
// MYND 2 — klukkukúrfa norður: hour curves, black axes, direct labels
// ============================================================================
{
  const c = charts.northFriday;
  const hours = [...Array(24).keys()];
  const svg = houseChart({
    eyebrow: 'MYND 2',
    headLines: ['Ferðatími margfaldast síðdegis á föstudögum'],
    subline: 'Miðgildi hermdra ferðatíma frá Reykjavík til Borgarness eftir brottfarartíma, mín.<tspan font-size="24" baseline-shift="super">1</tspan>',
    footnotes: ['1 Ferðatími á föstudegi að sumri', '2 Báðar línur eru hermdar enda birtir Vegagerðin ekki ferðatíma eftir', 'brottfarartíma. Grunnlína hermisins er kvörðuð við mældan ferðatíma.', 'Heimildir: Vegagerðin, umferðarhermir Viðskiptaráðs'],
    draw: (top) => {
      const height = 660;
      const plotL = PLOTL;
      const plotR = CR;
      const plotT = top + 30;
      const plotB = top + height - 120;
      const vals = [...c.hoursBaseline, ...c.hoursUpgrade].filter((v) => v != null).map((v) => v / 60);
      const maxY = Math.ceil(Math.max(...vals) / 30) * 30;
      const xS = (h) => plotL + (h / 23) * (plotR - plotL);
      const yS = (m) => plotB - (m / maxY) * (plotB - plotT);
      let b = '';
      for (let m = 0; m <= maxY; m += 30) {
        if (m > 0) b += `<line x1="${plotL}" y1="${yS(m)}" x2="${plotR}" y2="${yS(m)}" stroke="${GRID}" stroke-width="2" stroke-dasharray="12 10"/>`;
        b += `<text x="${ML}" y="${yS(m) + 12}" fill="${INK}" font-size="${TICK}">${m}</text>`;
      }
      // black axes: baseline + left border
      b += `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="#000" stroke-width="3"/>`;
      b += `<line x1="${plotL}" y1="${plotT - 14}" x2="${plotL}" y2="${plotB}" stroke="#000" stroke-width="3"/>`;
      for (let h = 0; h <= 23; h += 3) {
        b += `<text x="${xS(h)}" y="${plotB + 46}" text-anchor="middle" fill="${INK}" font-size="${TICK}">${String(h).padStart(2, '0')}</text>`;
      }
      b += `<text x="${(plotL + plotR) / 2}" y="${plotB + 100}" text-anchor="middle" fill="#000" font-size="32">Brottför (klukkustund)</text>`;

      const polyline = (arr, color) => {
        const pts = hours.filter((h) => arr[h] != null).map((h) => `${xS(h)},${yS(arr[h] / 60)}`);
        return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      };
      b += polyline(c.hoursUpgrade, GOLD);
      b += polyline(c.hoursBaseline, SKY);
      // direct labels, clear of the lines
      const lb = 19;
      b += `<text x="${xS(lb) + 10}" y="${yS(c.hoursBaseline[lb] / 60) - 26}" fill="${SKY}" font-size="34" font-weight="700">Í dag<tspan font-size="22" baseline-shift="super">2</tspan></text>`;
      const lu = 8;
      b += `<text x="${xS(lu)}" y="${yS(c.hoursUpgrade[lu] / 60) + 58}" fill="${GOLD}" font-size="34" font-weight="700" text-anchor="middle">Eftir 2+2 og 110</text>`;

      return { body: b, height };
    },
  });
  writeFileSync(join(outDir, 'mynd2.svg'), svg);
}

// ============================================================================
// MYND 3 — röðun framkvæmda: left group boxes (atl4 style), legend top-right
// ============================================================================
{
  const NAMES = {
    'north|all-d2-110': 'Reykjavík til Borgarness: allt 2+2 og 110',
    'south|all-d2-110': 'Reykjavík til Selfoss: allt 2+2 og 110',
    'kef|both': 'Reykjanesbraut: 110 og mislæg í stað ljósa²',
    'north|hvalfj-borgarnes-d2': 'Hvalfjörður–Borgarnes: 1+1 í 2+2',
    'kef|110': 'Reykjanesbraut: 90 í 110',
    'kef|junctions': 'Reykjanesbraut: mislæg í stað ljósa²',
    'north|tunnel2': 'Hvalfjarðargöng II',
    'south|110-existing': 'Suðurlandsvegur: 110 á 2+1 og 2+2',
    'north|110-existing': 'Kjalarnes: 110 á 2+1',
    'south|hellisheidi-d2': 'Hellisheiði: 2+1 í 2+2',
    'north|kjalarnes-d2': 'Kjalarnes: 2+1 í 2+2',
    'south|olfus-4th': 'Ölfus: fjórða akreinin',
  };
  const key = (r) => `${r.corridor}|${r.scenario}`;
  const packages = ['north|all-d2-110', 'south|all-d2-110', 'kef|both'];
  const byTotal = (a, b) => b.benefits.totalISKPerYear - a.benefits.totalISKPerYear;
  const rows1 = results.filter((r) => r.scale === 1 && packages.includes(key(r))).sort(byTotal);
  const rows2 = results
    .filter(
      (r) =>
        r.scale === 1 &&
        !packages.includes(key(r)) &&
        !['north|all-d2-90', 'south|all-d2-90'].includes(key(r)),
    )
    .sort(byTotal);

  const maxV = Math.max(...results.filter((r) => r.scale === 1).map((r) => r.benefits.totalISKPerYear));

  const svg = houseChart({
    eyebrow: 'MYND 3',
    headLines: ['Tvöföldun vegar milli Hvalfjarðar og Borgarness', 'skilar mestum ábata einstakra framkvæmda'],
    subline: 'Árlegur þjóðhagslegur ábati framkvæmda, ma.kr. (fyrsta ár)',
    legend: [
      { color: SKY, label: 'Tímasparnaður' },
      { color: GOLD, label: 'Slysaábati' },
    ],
    footnotes: [
      '1 Leggst ekki saman við einstakar framkvæmdir sömu leiðar',
      '2 Ljósagatnamótin við Kaplakrika og Reykjanesbraut',
      'Heimildir: Vegagerðin, umferðarhermir Viðskiptaráðs',
    ],
    draw: (top) => {
      const boxL = ML;
      const boxW = 230;
      const labelL = boxL + boxW + 26;
      const barLeft = 940;
      const barMaxW = CR - barLeft - 110;
      const barH = 42;
      const gap = 20;
      const sX = (v) => (v / maxV) * barMaxW;
      let y = top + 6;
      let b = '';
      const group = (boxLines, sup, rows) => {
        const gTop = y - 6;
        for (const r of rows) {
          const name = NAMES[key(r)] ?? r.scenario;
          const t = sX(r.benefits.timeISKPerYear);
          const s = sX(r.benefits.safetyISKPerYear);
          b += `<text x="${labelL}" y="${y + barH / 2 + 11}" fill="${INK}" font-size="30">${name}</text>`;
          b += `<rect x="${barLeft}" y="${y}" width="${Math.max(t, 2)}" height="${barH}" fill="${SKY}" stroke="#000" stroke-width="2"/>`;
          if (s > 2) b += `<rect x="${barLeft + t}" y="${y}" width="${s}" height="${barH}" fill="${GOLD}" stroke="#000" stroke-width="2"/>`;
          b += `<text x="${barLeft + t + s + 16}" y="${y + barH / 2 + 12}" fill="${NAVY}" font-size="34" font-weight="700">${bn(r.benefits.totalISKPerYear)}</text>`;
          y += barH + gap;
        }
        const gBot = y - gap + 6;
        // group box, atl4 style
        b += `<rect x="${boxL}" y="${gTop}" width="${boxW}" height="${gBot - gTop}" fill="${BOXFILL}" stroke="${BOXLINE}" stroke-width="2"/>`;
        const cy = (gTop + gBot) / 2 - ((boxLines.length - 1) * 38) / 2 + 10;
        boxLines.forEach((ln, i) => {
          const supSvg = sup && i === boxLines.length - 1 ? `<tspan font-size="20" baseline-shift="super">${sup}</tspan>` : '';
          b += `<text x="${boxL + boxW / 2}" y="${cy + i * 38}" text-anchor="middle" fill="${INK}" font-size="30" font-weight="600">${ln}${supSvg}</text>`;
        });
        // black line where the bars start
        b += `<line x1="${barLeft}" y1="${gTop}" x2="${barLeft}" y2="${gBot}" stroke="#000" stroke-width="3"/>`;
        y += 36;
      };
      group(['Heildar-', 'uppbygging'], '1', rows1);
      // dotted slate separator between the two sections
      b += `<line x1="${ML}" y1="${y - 20}" x2="${CR}" y2="${y - 20}" stroke="#6A768F" stroke-width="2.5" stroke-dasharray="2 10" stroke-linecap="round"/>`;
      y += 16;
      group(['Einstakar', 'framkvæmdir'], null, rows2);
      return { body: b, height: y - 36 - top };
    },
  });
  writeFileSync(join(outDir, 'mynd3.svg'), svg);
}

// ============================================================================
// MYND 4 — næmni 2035: TRANSPOSED to vertical grouped columns, year legend
// ============================================================================
{
  const groups = [
    ['north', 'Reykjavík til Borgarness'],
    ['south', 'Reykjavík til Selfoss'],
  ];
  const get = (cid, scale) =>
    results.find((r) => r.corridor === cid && r.scenario === 'all-d2-110' && r.scale === scale);
  const maxV = Math.max(
    ...results.filter((r) => r.scenario === 'all-d2-110').map((r) => r.benefits.totalISKPerYear),
  ) / 1e9;
  const maxY = Math.ceil(maxV / 5) * 5;

  const svg = houseChart({
    eyebrow: 'MYND 4',
    headLines: ['Ábatinn vex um meira en helming til 2035'],
    subline: 'Árlegur ábati af fullri uppbyggingu (allt 2+2 og 110 km/klst), ma.kr.',
    legend: [
      { color: SKY, label: 'Umferð 2026' },
      { color: GOLD, label: 'Spáð umferð 2035' },
    ],
    footnotes: ['Heimildir: Vegagerðin, umferðarhermir Viðskiptaráðs'],
    draw: (top) => {
      const height = 620;
      const plotL = PLOTL;
      const plotR = CR;
      const plotT = top + 40;
      const plotB = top + height - 120;
      const yS = (v) => plotB - (v / maxY) * (plotB - plotT);
      let b = '';
      for (let m = 0; m <= maxY; m += 5) {
        if (m > 0) b += `<line x1="${plotL}" y1="${yS(m)}" x2="${plotR}" y2="${yS(m)}" stroke="${GRID}" stroke-width="2" stroke-dasharray="12 10"/>`;
        b += `<text x="${ML}" y="${yS(m) + 12}" fill="${INK}" font-size="${TICK}">${m}</text>`;
      }
      const colW = 150;
      const inGap = 26;
      const centers = [plotL + (plotR - plotL) * 0.28, plotL + (plotR - plotL) * 0.72];
      groups.forEach(([cid, name], gi) => {
        const cx = centers[gi];
        const v1 = get(cid, 1).benefits.totalISKPerYear / 1e9;
        const v2 = get(cid, 1.23).benefits.totalISKPerYear / 1e9;
        const x1 = cx - inGap / 2 - colW;
        const x2 = cx + inGap / 2;
        b += `<rect x="${x1}" y="${yS(v1)}" width="${colW}" height="${plotB - yS(v1)}" fill="${SKY}" stroke="#000" stroke-width="2"/>`;
        b += `<rect x="${x2}" y="${yS(v2)}" width="${colW}" height="${plotB - yS(v2)}" fill="${GOLD}" stroke="#000" stroke-width="2"/>`;
        b += `<text x="${x1 + colW / 2}" y="${yS(v1) - 18}" text-anchor="middle" fill="${INK}" font-size="${VALUE}">${dec1(v1)}</text>`;
        b += `<text x="${x2 + colW / 2}" y="${yS(v2) - 18}" text-anchor="middle" fill="${INK}" font-size="${VALUE}">${dec1(v2)}</text>`;
        b += `<text x="${cx}" y="${plotB + 48}" text-anchor="middle" fill="${INK}" font-size="34">${name}</text>`;
      });
      // black baseline where the columns start
      b += `<line x1="${plotL}" y1="${plotB}" x2="${plotR}" y2="${plotB}" stroke="#000" stroke-width="3"/>`;
      return { body: b, height };
    },
  });
  writeFileSync(join(outDir, 'mynd4.svg'), svg);
}

console.log('house-template SVGs written to', outDir);
