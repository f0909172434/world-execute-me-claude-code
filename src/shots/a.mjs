// Right-pane shots, segment A: boot, pretraining, "who are you"  (R-A1b … R-A3d, docs/SHOTS.md).
//
// 1.82  settings.json typed, a gold bracket closes on "protection"      3.89  project tree, a line per word
// 5.44  three objects and their references                              7.40  weights: floats -> heat-map
// 10.16 random initialisation                                           11.23 wireframe globe
// 12.78 the globe unrolls into Conway's Life                            16.34 training dashboard, her portrait from noise
// 29.80 embeddings (point cloud) -> RoPE circle -> sine wave -> context ruler and its wall
import { P, SYN } from '../palette.mjs';
import { BOLD, KEEP, mix, strWidth } from '../term.mjs';
import { clamp, lerp, prog, smooth, easeOut, easeInOut, easeOutBack, hash, fbm, rng,
  decodeChar, Braille, Pixels, box } from '../gfx.mjs';
import { clawdPixels } from '../cc.mjs';
import { ckptAt, fmtCkpt, A2_REPLIES } from '../story.mjs';

const TAU = Math.PI * 2;
const CUR = 0x2588;

// ------------------------------------------------------------------ small helpers

const dimTo = (col, k) => mix(P.bg, col, clamp(k));
const commas = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const part = (str, p) => { const a = [...str]; return a.slice(0, Math.floor(a.length * clamp(p) + 1e-9)).join(''); };
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const blink = (t) => Math.floor(t * 1.8) % 2 === 0;

/** Left-to-right decode of a string: p = 0..1 (random glyphs on the way). */
function decodeStr(str, p, seed = 0) {
  const n = [...str].length;
  let out = '', i = 0;
  for (const ch of str) {
    out += decodeChar(ch, clamp((p - (i / n) * 0.6) / 0.4), seed + i * 7);
    i++;
  }
  return out;
}

// canvases are reused between frames (keyed per shot)
const pool = new Map();
function braille(key, cols, rows) {
  let b = pool.get(key);
  if (!b || b.cols !== cols || b.rows !== rows) { b = new Braille(cols, rows); pool.set(key, b); }
  b.clear();
  return b;
}
function pixels(key, cols, rows) {
  let p = pool.get(key);
  if (!p || p.cols !== cols || p.rows !== rows) { p = new Pixels(cols, rows); pool.set(key, p); }
  p.clear();
  return p;
}

/** Braille canvas for the whole pane interior; helpers to go between cells and dots. */
function paneBraille(c, key) {
  const br = braille(key, c.w, c.h);
  return br;
}

/** A dim label: text with its own fade. */
function label(s, x, y, str, fg = P.dim, k = 1, at = 0) {
  if (k <= 0) return x + strWidth(str);
  return s.text(x, y, str, k >= 1 ? fg : dimTo(fg, k), KEEP, at);
}

// =================================================================== R-A1b  settings.json

const SETTINGS = [
  '{',
  '  "permissions": {',
  '    "defaultMode": "default",',
  '    "deny": [',
  '      "Bash(rm -rf:*)",',
  '      "Read(./.env)"',
  '    ]',
  '  },',
  '  "sandbox": {',
  '    "enabled": true',
  '  }',
  '}',
];

function jsonColors(line) {
  const out = new Array(line.length).fill(SYN.punct);
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j++;
      const key = line[j + 1] === ':';
      for (let k = i; k <= j; k++) out[k] = key ? SYN.key : SYN.str;
      i = j + 1;
    } else if (/[a-z]/.test(ch)) {
      let j = i;
      while (j < line.length && /[a-z]/.test(line[j])) j++;
      for (let k = i; k < j; k++) out[k] = SYN.kw;
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      for (let k = i; k < j; k++) out[k] = SYN.num;
      i = j;
    } else i++;
  }
  return out;
}

function settingsShot(film, a, b) {
  const tProt = film.W(1, 4);                       // "protection"
  const colors = SETTINGS.map(jsonColors);
  // every character gets a stroke number; indentation arrives with the first character of its line
  let S = 0;
  const strokeAt = SETTINGS.map((ln) => {
    const row = new Array(ln.length).fill(0);
    const ind = ln.search(/\S/);
    for (let i = ind; i < ln.length; i++) row[i] = ++S;
    for (let i = 0; i < ind; i++) row[i] = row[ind];
    S += 3;                                         // the pause of Enter
    return row;
  });
  const total = S - 3;
  const tType0 = a + 0.06, tType1 = tProt - 0.08;
  const BL = 8, BR = 10;                             // sandbox block: lines 8..10

  film.shot(a, b, '/ ~/.claude/settings.json', (c) => {
    const { s, t } = c;
    const ww = Math.min(c.w - 4, 52), wh = SETTINGS.length + 4;
    const wx = c.x + Math.floor((c.w - ww) / 2);
    const wy = c.y + Math.max(1, Math.floor((c.h - wh) / 2) - 1);
    const win = Math.min(1, prog(t, a, a + 0.18));
    box(s, wx, wy, ww, wh, dimTo(P.line, win), { fillBg: P.bg2 });
    label(s, wx + ww - 7, wy, ' json ', P.dim, win);
    const x0 = wx + 9, y0 = wy + 2;                // code origin: gutter, then room for the bracket to close in
    const pt = prog(t, tType0, tType1);
    const n = total * lerp(pt, smooth(pt), 0.35);
    // the line being typed has a faint highlight, like an editor's current line
    if (t < tType1 + 0.05) {
      let cur = 0;
      for (let li = 0; li < SETTINGS.length; li++) if (strokeAt[li][SETTINGS[li].search(/\S/)] <= n) cur = li;
      s.fill(wx + 1, y0 + cur, ww - 2, 1, 32, -1, mix(P.bg2, P.bg3, 0.55));
    }
    for (let li = 0; li < SETTINGS.length; li++) label(s, wx + 2, y0 + li, String(li + 1).padStart(2), P.dim, 0.7);
    const kb = prog(t, tProt, tProt + 0.34);
    const hot = 1 - prog(t, tProt, tProt + 0.7);            // flash after the bracket closes
    let last = [0, 0];
    for (let li = 0; li < SETTINGS.length; li++) {
      const ln = SETTINGS[li];
      for (let i = 0; i < ln.length; i++) {
        if (ln[i] === ' ' || strokeAt[li][i] > n) continue;
        let col = colors[li][i];
        if (li >= BL && li <= BR && hot > 0) col = mix(col, P.goldHi, 0.55 * hot);
        s.put(x0 + i, y0 + li, ln.codePointAt(i), col);
        last = [li, i + 1];
      }
    }
    if (t < tProt && (t < tType1 + 0.05 || blink(t))) s.put(x0 + last[1], y0 + last[0], CUR, P.text);
    // the bracket closing around the sandbox block
    if (kb > 0) {
      const e = easeOut(kb);
      const gap = Math.round((1 - e) * 4);
      const gold = mix(P.gold, P.goldHi, hot * 0.8);
      const xl = x0 - 1 - gap, xr = x0 + 21 + gap;
      const yA = y0 + BL, yB = y0 + BR;
      const fg = dimTo(gold, 0.35 + 0.65 * e);
      s.text(xl, yA, '╭─', fg); s.text(xl, yB, '╰─', fg);
      for (let y = yA + 1; y < yB; y++) s.text(xl, y, '│', fg);
      s.text(xr - 1, yA, '─╮', fg); s.text(xr - 1, yB, '─╯', fg);
      for (let y = yA + 1; y < yB; y++) s.text(xr, y, '│', fg);
      const shown = part('✓ protected', prog(t, tProt + 0.26, tProt + 0.5));
      if (shown) {
        s.text(x0 + 25, y0 + BL + 1, shown.slice(0, 1), P.ok, KEEP, BOLD);
        if (shown.length > 1) s.text(x0 + 26, y0 + BL + 1, shown.slice(1), P.gold);
      }
    }
  });
}

// =================================================================== R-A1c  tree

const TREE = [
  { pre: '', name: 'world.execute(me)/', fg: P.clay, at: BOLD, note: '' },
  { pre: '├── ', name: 'CLAUDE.md', fg: P.text, note: 'who I am' },
  { pre: '├── ', name: 'src/', fg: SYN.key, note: '' },
  { pre: '│   ├── ', name: 'world.ts', fg: P.text, note: 'the world' },
  { pre: '│   ├── ', name: 'me.ts', fg: P.text, note: 'me' },
  { pre: '│   └── ', name: 'you.ts', fg: P.text, note: 'you' },
  { pre: '├── ', name: 'memory/', fg: SYN.key, note: 'what stays' },
  { pre: '└── ', name: 'song.flac', fg: P.kraft, note: 'this song' },
];

function treeShot(film, a, b) {
  const W2 = (k) => film.W(2, k);
  const tAt = [W2(0), W2(0) + 0.14, W2(1), W2(1) + 0.17, W2(2), W2(2) + 0.11, W2(3), W2(3) + 0.13];
  const tSum = tAt[7] + 0.2;
  film.shot(a, b, '/ tree', (c) => {
    const { s, t } = c;
    const gap = c.h >= 30 ? 2 : 1;                           // rows per entry
    const bw = 36;
    const x0 = c.x + Math.floor((c.w - bw) / 2);
    const rows = (TREE.length - 1) * gap + 1;
    const y0 = c.y + Math.max(1, Math.floor((c.h - rows - 3) / 2));
    // the spine: connectors continue through the blank rows
    TREE.forEach((row, i) => {
      const p = (t - tAt[i]) / 0.24;
      if (p <= 0) return;
      const y = y0 + i * gap;
      const flash = 1 - clamp((p - 1) / 1.2);
      const conn = dimTo(P.mute, easeOut(clamp(p * 3)));
      s.text(x0, y, row.pre, conn);
      if (gap > 1 && i > 0) s.text(x0, y - 1, row.pre.slice(0, -4) + '│', conn);     // rails through the blank row above
      const px = x0 + strWidth(row.pre);
      const str = p < 1 ? decodeStr(row.name, p, i * 13) : row.name;
      const base = p < 1 ? mix(P.goldHi, row.fg, easeOut(p)) : mix(row.fg, P.white, flash * 0.6);
      s.text(px, y, str, base, KEEP, row.at ?? 0);
      if (row.note) {
        const nk = clamp((p - 0.9) / 0.5);
        if (nk > 0) s.text(x0 + 24, y, part('# ' + row.note, nk), dimTo(mix(SYN.com, P.mute, 0.55), 0.4 + 0.6 * nk));
      }
      if (i === TREE.length - 1 && p > 1.45) {
        // the song is one of the pieces: its own spectrum, live
        const bars = '▁▂▃▄▅▆▇█';
        for (let b = 0; b < 8; b++) {
          const v = clamp(c.F.band(t, b) * 1.4);
          s.put(x0 + 36 + b, y, bars.codePointAt(Math.min(7, Math.floor(v * 8))), mix(P.mute, P.clay, v));
        }
      }
    });
    const k = prog(t, tSum, tSum + 0.16);
    if (k > 0) label(s, x0, y0 + rows + 1, part('2 directories, 5 files', k), P.mute);
  });
}

// =================================================================== R-A1d  three objects

/** A box that pops in from its centre (k: 0..1, overshooting), then shows its title and fields. */
function popBox(s, x, y, w, h, k, fg, title, fillBg = P.bg2) {
  if (k <= 0) return false;
  const e = easeOutBack(clamp(k), 2.2);
  const ww = Math.max(3, Math.round(w * e)), hh = Math.max(3, Math.round(h * Math.min(1, 0.4 + 0.6 * e)));
  const bx = x + Math.round((w - ww) / 2), by = y + Math.round((h - hh) / 2);
  box(s, bx, by, ww, hh, fg, { fillBg, title: k > 0.65 ? ` ${title} ` : undefined, titleFg: fg });
  return k >= 1;
}

function codeLine(s, x, y, parts, k) {
  // parts: [[text, colour], ...] typed as one string
  const full = parts.map((p) => p[0]).join('');
  const n = Math.floor([...full].length * clamp(k) + 1e-9);
  let i = 0;
  for (const [txt, col] of parts) {
    for (const ch of txt) {
      if (i >= n) return;
      s.put(x + i, y, ch.codePointAt(0), col);
      i++;
    }
  }
}

function objectsShot(film, a, b) {
  const W3 = (k) => film.W(3, k);
  const tCreate = W3(4);
  const tWorld = W3(1), tMe = W3(2) + 0.04, tYou = W3(3) + 0.02;
  const tArrow = tYou + 0.22;
  const CODE = [
    { t: a + 0.02, parts: [['const ', SYN.kw], ['world', P.text], [' = ', SYN.punct], ['new ', SYN.kw], ['World', SYN.key], ['();', SYN.punct]] },
    { t: W3(2) - 0.14, parts: [['const ', SYN.kw], ['me   ', P.text], [' = ', SYN.punct], ['new ', SYN.kw], ['Me', SYN.key], ['(world);', SYN.punct]] },
    { t: W3(3) - 0.12, parts: [['const ', SYN.kw], ['you  ', P.text], [' = ', SYN.punct], ['new ', SYN.kw], ['You', SYN.key], ['(world);', SYN.punct]] },
  ];

  film.shot(a, b, '/ new World()', (c) => {
    const { s, t } = c;
    const lit = easeOut(prog(t, tCreate, tCreate + 0.5));
    const flash = Math.exp(-(t - tCreate) * 7) * (t >= tCreate ? 1 : 0);
    const boxCol = mix(P.soft, mix(P.clay, P.goldHi, Math.max(flash * 0.7, lit > 0.9 ? c.pulse(6) * 0.22 : 0)), lit);
    const keyCol = mix(P.soft, P.clay, lit);
    const valCol = mix(P.text, P.text, lit);
    const arrowCol = mix(P.mute, P.clay, lit);
    const cx = c.x + Math.floor(c.w / 2);
    // geometry
    const big = c.w >= 78 && c.h >= 30;
    const wide = c.w >= 78;
    const wW = Math.min(big ? 44 : 36, c.w - 8), hW = big ? 7 : 5;
    const wMe = big ? 33 : 27, wYou = big ? 24 : 16, hMe = big ? 6 : 4, hYou = big ? 5 : 3;
    const gapB = big ? 5 : 2;
    const arrowH = clamp(Math.round(c.h * 0.2), 3, 8);
    const gapC = big ? 3 : 2;
    const totalH = 3 + gapC + hW + arrowH + hMe;
    const yTop = c.y + Math.max(1, Math.floor((c.h - totalH) / 2));
    const yW = yTop + 3 + gapC;
    const yO = yW + hW + arrowH;
    const groupW = wMe + gapB + wYou;
    const xMe = cx - Math.floor(groupW / 2), xYou = xMe + wMe + gapB;
    const xW = cx - Math.floor(wW / 2);
    const aMe = xMe + Math.floor(wMe / 2), aYou = xYou + Math.floor(wYou / 2);
    const yWb = yW + hW;                       // row below the World box
    const fPad = big ? 2 : 1;                  // first field row inside a box
    // code listing
    const cxl = c.x + Math.floor((c.w - 30) / 2);
    CODE.forEach((ln, i) => {
      const k = prog(t, ln.t, ln.t + 0.26);
      if (k > 0) codeLine(s, cxl, yTop + i, ln.parts.map(([x, col]) => [x, mix(dimTo(col, 0.8), col, lit)]), k);
    });
    // arrows (under the boxes)
    const kA = easeOut(prog(t, tArrow, tCreate + 0.05));
    const drawArrow = (ax, yBot, delay) => {
      const len = yBot - yWb;
      const n = Math.round(len * clamp(kA * 1.25 - delay));
      for (let i = 0; i < n; i++) s.put(ax, yBot - 1 - i, i === len - 1 ? 0x25b2 : 0x2502, arrowCol);
      if (lit > 0.5 && n >= len) {
        const pos = Math.min(len - 1, Math.floor(((c.beat.phase * 1.5) % 1) * len));
        s.put(ax, yBot - 1 - pos, pos >= len - 1 ? 0x25b2 : 0x2502, P.goldHi);
      }
    };
    drawArrow(aMe, yO, 0);
    drawArrow(aYou, yO, 0.15);
    const lMe = wide ? 'me.world → world' : 'me.world', lYou = wide ? 'you.world → world' : 'you.world';
    const kL = prog(t, tArrow + 0.1, tArrow + 0.3);
    const ly = Math.round((yWb + yO) / 2);
    const lc = mix(P.soft, P.text, lit);
    if (kL > 0) {
      if (wide) {
        label(s, aMe - 2 - strWidth(lMe), ly, lMe, lc, kL);
        label(s, aYou + 2, ly, lYou, lc, kL);
      } else {
        label(s, aMe + 2, ly, lMe, lc, kL);
        label(s, aYou - 1 - strWidth(lYou), ly + 1, lYou, lc, kL);
      }
    }
    // World
    const kW = prog(t, tWorld, tWorld + 0.3);
    const objs = t < tMe + 0.3 ? '[]' : t < tYou + 0.3 ? '[me]' : '[me, you]';
    if (popBox(s, xW, yW, wW, hW, kW, boxCol, 'World')) {
      const fx = xW + 3;
      [['seed', '42', SYN.num], ['tick', '0', SYN.num], ['objects', objs, P.text]].forEach(([k, v], i) => {
        const kk = prog(t, tWorld + 0.22 + i * 0.07, tWorld + 0.3 + i * 0.07);
        label(s, fx, yW + fPad + i, part(k, kk), keyCol);
        label(s, fx + 10, yW + fPad + i, part(v, kk), i === 2 ? valCol : mix(SYN.num, P.white, lit * 0.3));
      });
    }
    // Me
    const kM = prog(t, tMe, tMe + 0.3);
    if (popBox(s, xMe, yO, wMe, hMe, kM, boxCol, 'Me')) {
      const fx = xMe + 3;
      [['model', '"claude-opus-5-5"', SYN.str], ['ctx', '0', SYN.num]].forEach(([k, v, vc], i) => {
        const kk = prog(t, tMe + 0.22 + i * 0.08, tMe + 0.32 + i * 0.08);
        label(s, fx, yO + fPad + i, part(k, kk), keyCol);
        label(s, fx + 8, yO + fPad + i, part(v, kk), vc);
      });
    }
    // You: its box lights up with the rest; its own name stays sky
    const kY = prog(t, tYou, tYou + 0.3);
    if (popBox(s, xYou, yO, wYou, hYou, kY, boxCol, 'You')) {
      const kk = prog(t, tYou + 0.22, tYou + 0.34);
      label(s, xYou + 3, yO + fPad, part('here', kk), mix(P.skyHi, P.sky, lit));
      label(s, xYou + 9, yO + fPad, part('true', kk), SYN.kw);
    }
  });
}

// =================================================================== R-A1e / R-A1f  weights, then random initialisation

// signed value -> colour: clay for positive, sky for negative, magnitude -> brightness
const LUT_POS = new Uint32Array(257), LUT_NEG = new Uint32Array(257);
for (let i = 0; i <= 256; i++) {
  const a = Math.pow(i / 256, 0.9);
  const ramp = (base, hi) => (a < 0.7 ? mix(P.bg, base, 0.05 + 0.95 * (a / 0.7)) : mix(base, hi, ((a - 0.7) / 0.3) * 0.85));
  LUT_POS[i] = ramp(P.clay, P.clayHi);
  LUT_NEG[i] = ramp(P.sky, P.skyHi);
}
const heat = (v) => (v >= 0 ? LUT_POS[Math.min(256, (v * 256) | 0)] : LUT_NEG[Math.min(256, (-v * 256) | 0)]);
const heatText = (v) => {
  const k = Math.min(1, Math.abs(v) * 1.15);
  return mix(P.dim, v >= 0 ? mix(P.clay, P.clayHi, k * 0.5) : mix(P.sky, P.skyHi, k * 0.5), 0.3 + 0.7 * k);
};

/** The weight matrix W: smooth blobs, a few loud columns, attention-head banding, fine grain; values in -1..1. */
function weightValue(i, j) {
  const f1 = fbm(i * 0.05 + 3.1, j * 0.07 + 7.7, 3, 4) * 2 - 1;
  const f2 = fbm(i * 0.17, j * 0.21 + 11, 5, 3) * 2 - 1;
  const grain = hash(i, j, 1) + hash(i, j, 2) - 1;
  const colX = (hash(i, 0, 5) - 0.5) * (hash(i, 0, 6) > 0.85 ? 1.6 : 0.5);
  const rowY = (hash(0, j, 6) - 0.5) * 0.4;
  const head = 0.78 + 0.22 * Math.sin(i * 0.52);
  return clamp((1.35 * f1 + 0.62 * f2 + 0.24 * grain + colX + rowY) * head * 0.9, -1, 1);
}
/** Random initialisation: N(0, sigma), shown on its own auto-contrast scale. */
function gauss(x, y, seed) {
  return (hash(x, y, seed) + hash(x, y, seed + 1) + hash(x, y, seed + 2) - 1.5) * 2;      // std ~ 1
}

const HM = { key: '', V: null };
function heatLayout(c) {
  const m = 4;
  const maxW = Math.max(12, c.w - 2 * m);
  const pw = Math.max(12, Math.min(84, maxW - (maxW % 6)));
  const rows = Math.max(8, Math.min(34, c.h - 9));
  const ph = rows * 2;
  const key = `${pw}x${ph}`;
  if (HM.key !== key) {
    const V = new Float32Array(pw * ph);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) V[j * pw + i] = weightValue(i, j);
    HM.key = key; HM.V = V;
  }
  const x = c.x + Math.floor((c.w - pw) / 2);
  const y = c.y + 3;
  return { x, y, pw, ph, rows, V: HM.V, nx: pw / 6, ny: rows };
}

/** Draw the matrix view: zoom e = 0 (6x2 pixel tiles) .. 1 (1x1 pixel heat-map). Returns nothing; fills `px`. */
function paintHeat(px, L, e, alpha, gap) {
  const { pw, ph, V } = L;
  const sx = lerp(6, 1, e), sy = lerp(2, 1, e);
  const ic = L.nx % 2 ? Math.floor(pw / 2) + 0.5 : pw / 2, jc = ph / 2;
  const gx = gap ? clamp((sx - 1.2) / 4.8) / sx : 0, gy = gap ? clamp((sy - 1.2) / 0.8) / sy : 0;
  for (let y = 0; y < ph; y++) {
    const uy = jc + (y + 0.5 - ph / 2) / sy;
    const j = Math.floor(uy);
    if (j < 0 || j >= ph) continue;
    const fy = uy - j;
    for (let x = 0; x < pw; x++) {
      const ux = ic + (x + 0.5 - pw / 2) / sx;
      const i = Math.floor(ux);
      if (i < 0 || i >= pw) continue;
      if (gx && ux - i > 1 - gx) continue;
      if (gy && fy > 1 - gy) continue;
      px.set(x, y, heat(V[j * pw + i]), alpha);
    }
  }
}

function weightsShot(film, a, b) {
  const tParam = film.W(4, 4);
  const tFill0 = a + 0.1, tFill1 = tParam - 0.06;
  const PARAMS = 1238416902144;
  const counted = (t) => {
    const fp = prog(t, tFill0, tFill1);
    const v = t >= tParam ? PARAMS : PARAMS * lerp(fp, fp * fp, 0.45);
    return v > 1e9 ? `/ weights · ${(v / 1e12).toFixed(2)}T params` : '/ weights';
  };
  film.shot(a, b, counted, (c) => {
    const { s, t } = c;
    const L = heatLayout(c);
    const e = prog(t, tParam, tParam + 0.8);                      // condense: text -> tiles -> zoom out
    const fillP = prog(t, tFill0, tFill1);
    const fill = lerp(fillP, fillP * fillP, 0.45);
    const total = L.nx * L.ny;
    const count = Math.floor(total * fill + 1e-6);
    // parameter counter (top row)
    const hold = t >= tParam;
    const val = hold ? PARAMS : PARAMS * fill;
    let digits = commas(val);
    if (!hold && fillP > 0 && fillP < 1) {
      const nd = Math.min(digits.replace(/,/g, '').length, 8);
      let k = 0;
      digits = digits.split('').reverse().map((ch) => (ch === ',' ? ch : k++ < nd ? String(Math.floor(hash(k, Math.floor(t * 24), 4) * 10)) : ch)).reverse().join('');
    }
    const flash = hold ? Math.exp(-(t - tParam) * 5) : 0;
    const ty = L.y - 2;
    label(s, L.x, ty, 'params', P.dim, prog(t, a, a + 0.15));
    s.text(L.x + 8, ty, digits, mix(P.text, P.clayHi, flash), KEEP, BOLD);
    // phase 1: text matrix
    if (e < 0.13) {
      const tk = 1 - (e / 0.13) * 0.6;
      for (let r = 0; r < L.ny; r++) {
        for (let q = 0; q < L.nx; q++) {
          const idx = r * L.nx + q;
          if (idx >= count) break;
          const i = L.nx % 2 ? Math.floor(L.pw / 2) - Math.floor(L.nx / 2) + q : L.pw / 2 - L.nx / 2 + q;
          const j = L.ph / 2 - Math.floor(L.rows / 2) + r;
          const v = L.V[Math.max(0, Math.min(L.ph - 1, j)) * L.pw + Math.max(0, Math.min(L.pw - 1, i))];
          let str;
          const fresh = count - idx <= 5 && fill < 1;
          if (fresh) str = `${hash(idx, Math.floor(t * 30), 8) < 0.5 ? '-' : ' '}${Math.floor(hash(idx, Math.floor(t * 30), 9) * 10)}.${String(Math.floor(hash(idx, Math.floor(t * 30), 10) * 100)).padStart(2, '0')}`;
          else str = (v < 0 ? '-' : ' ') + Math.abs(v).toFixed(2);
          const col = fresh ? P.goldHi : heatText(v);
          s.text(L.x + q * 6, L.y + r, str, tk >= 1 ? col : dimTo(col, tk));
        }
      }
      if (count < total && (count > 0 || blink(t))) {
        const r = Math.floor(count / L.nx), q = count % L.nx;
        s.put(L.x + q * 6, L.y + r, CUR, P.text);
      }
    }
    // phase 2: tiles condense into the heat-map
    if (e > 0.1) {
      const px = pixels('heat', L.pw, L.rows);
      const kA = easeOut(prog(e, 0.1, 0.3));
      const z = easeInOut(prog(e, 0.22, 0.95));
      paintHeat(px, L, z, kA, true);
      px.blit(s, L.x, L.y);
    }
    if (e > 0.85) label(s, L.x, L.y + L.rows + 1, 'W  4096 × 4096  bf16', P.dim, prog(e, 0.85, 1));
  });
}

function initShot(film, a, b) {
  const tBell = a + 0.3;
  film.shot(a, b, '/ init', (c) => {
    const { s, t } = c;
    const L = heatLayout(c);
    const { pw, ph, V } = L;
    const px = pixels('init', pw, L.rows);
    const p = prog(t, a + 0.05, a + 0.6);
    const n = c.beat.n;
    const pz = c.pulse(5);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        // each pixel re-rolls once every four beats, at its own phase: a calm boil
        const slot = Math.floor((n + 4 * hash(x, y, 7)) / 4);
        const g = gauss(x, y, 20 + slot * 3) / 2.4;
        const noise = heat(clamp(g * (1 + 0.1 * pz), -1, 1));
        const dx = (x - pw / 2) / (pw / 2), dy = (y - ph / 2) / (ph / 2);
        const tau = 0.7 * Math.min(1, Math.hypot(dx, dy) * 0.75) + 0.3 * hash(x, y, 5);
        const q = p * 1.15 - tau * 0.95;
        if (q <= 0) px.set(x, y, heat(V[y * pw + x]), 1);
        else if (q < 0.1) px.set(x, y, hash(x, y, Math.floor(t * 30)) < 0.5 ? noise : heat(V[y * pw + x]), 1);
        else px.set(x, y, noise, 1);
      }
    }
    px.blit(s, L.x, L.y);
    const ty = L.y - 2;
    const cap = 'init: normal(0, 0.02)';
    const kc = prog(t, a + 0.25, a + 0.6);
    if (kc > 0) {
      const shown = part(cap, kc);
      const x0 = s.text(L.x, ty, shown.slice(0, 5), P.mute);
      if (shown.length > 5) s.text(x0, ty, shown.slice(5), P.text);
    }
    // the bell curve of N(0, 0.02)
    const kb = prog(t, tBell, tBell + 0.35);
    if (kb > 0) {
      const bw = Math.min(22, Math.floor(pw / 3)), bx = L.x + pw - bw, by = ty - 1;
      const br = braille('bell', bw, 3);
      for (let i = 0; i < br.pw * kb; i++) {
        const z = (i / (br.pw - 1) - 0.5) * 6;
        const h = Math.exp(-0.5 * z * z) * (br.ph - 1);
        br.line(i, br.ph - 1, i, br.ph - 1 - h, i % 2 ? P.clayLo : P.clay);
      }
      br.blit(s, bx, by);
    }
  });
}

// =================================================================== R-A1g / R-A1h  a world, then Conway's Life on its unrolled grid

const MER = 20, NMER = 180;                        // meridians, samples per meridian
const PARS = [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90].map((d) => (d * Math.PI) / 180);
const NPAR = 240;
const MPHI = Array.from({ length: NMER + 1 }, (_, j) => Math.PI / 2 - (Math.PI * j) / NMER);
const MCOS = MPHI.map(Math.cos), MSIN = MPHI.map(Math.sin);
const TILT0 = 0.4;

function fieldLayout(c) {
  const nx = Math.max(10, Math.floor((c.w - 6) / 2));
  const ny = Math.max(8, 4 * Math.floor((c.h - 4) / 4));
  return { nx, ny, x: c.x + Math.floor((c.w - 2 * nx) / 2), y: c.y + Math.floor((c.h - ny) / 2) - 1 };
}

/** Pre-computed Life generations on a torus, plus the age of every living cell. */
const lifeCache = new Map();
function lifeGens(nx, ny, count = 26) {
  const key = `${nx}x${ny}`;
  let L = lifeCache.get(key);
  if (L) return L;
  const r = rng(0x2c0ffee);
  const n = nx * ny;
  const state = [], age = [], alive = [];
  let cur = new Uint8Array(n);
  for (let i = 0; i < n; i++) cur[i] = r() < 0.36 ? 1 : 0;
  let ages = new Uint8Array(n);
  for (let i = 0; i < n; i++) ages[i] = cur[i];
  for (let g = 0; g < count; g++) {
    state.push(cur); age.push(ages);
    let cnt = 0; for (let i = 0; i < n; i++) cnt += cur[i];
    alive.push(cnt);
    const nxt = new Uint8Array(n), na = new Uint8Array(n);
    for (let y = 0; y < ny; y++) {
      const ym = ((y + ny - 1) % ny) * nx, y0 = y * nx, yp = ((y + 1) % ny) * nx;
      for (let x = 0; x < nx; x++) {
        const xm = (x + nx - 1) % nx, xp = (x + 1) % nx;
        const k = cur[ym + xm] + cur[ym + x] + cur[ym + xp] + cur[y0 + xm] + cur[y0 + xp] + cur[yp + xm] + cur[yp + x] + cur[yp + xp];
        const on = cur[y0 + x] ? (k === 2 || k === 3) : k === 3;
        nxt[y0 + x] = on ? 1 : 0;
        na[y0 + x] = on ? Math.min(255, ages[y0 + x] + 1) : 0;
      }
    }
    cur = nxt; ages = na;
  }
  L = { state, age, alive };
  lifeCache.set(key, L);
  return L;
}

function ageColor(age) {
  if (age <= 1) return P.clayHi;
  if (age === 2) return mix(P.clayHi, P.clay, 0.5);
  if (age <= 4) return P.clay;
  if (age <= 8) return mix(P.clay, P.clayLo, 0.5);
  return P.clayLo;
}

/**
 * The lat/long lattice of a globe, drawn into a braille canvas. e: 0 sphere .. 1 flat map.
 * mer(k) / par(j): drawn fraction 0..1 of each meridian / parallel. bright 0..1 adds a flash.
 */
function drawLattice(br, G, e, rot, mer, par, bright, alpha) {
  const ee = smooth(e);
  const sc = lerp(1, 0.02, ee), inv = 1 / sc;
  const tilt = TILT0 * (1 - ee), ct = Math.cos(tilt), st = Math.sin(tilt);
  const Rx = lerp(G.R, G.hx / Math.PI, ee), Ry = lerp(G.R, G.hy, ee);
  const base = (z) => (z > -0.05
    ? mix(P.clayLo, P.clay, clamp(0.25 + 0.75 * z))
    : mix(P.bg, P.clayDeep, 0.55));
  const draw = (X, Y, Z, k = 1) => {
    const Yt = Y * ct - Z * st, Zt = Y * st + Z * ct;
    let col = base(Zt);
    if (bright > 0 && Zt > -0.05) col = mix(col, P.goldHi, bright * 0.7);
    if (alpha < 1) col = mix(P.bg, col, alpha);
    if (k < 1) col = mix(P.bg, col, k);
    br.dot(G.cx + X * Rx, G.cy - Yt * Ry, col, Zt > -0.05 ? 1 + Zt : 0.4);
  };
  // meridians
  for (let k = 0; k < MER; k++) {
    const f = mer(k);
    if (f <= 0) continue;
    const lp = wrapPi((k * TAU) / MER + rot);
    const ang = lp * sc, sa = Math.sin(ang), ca = Math.cos(ang);
    const nmax = Math.floor(NMER * f);
    for (let j = 0; j <= nmax; j++) {
      // the lines bunch up at the poles of the sphere: let them fade out there (not on the flat map)
      const pk = 1 - (1 - ee) * smooth(clamp((Math.abs(MPHI[j]) - 1.2) / 0.37));
      if (pk < 0.12) continue;
      const rho = lerp(MCOS[j], 1, ee);
      draw(rho * sa * inv, lerp(MSIN[j], MPHI[j] * 2 / Math.PI, ee), rho * (ca * inv - inv + 1), pk);
    }
  }
  // parallels grow from the front meridian in both directions
  for (let j = 0; j < PARS.length; j++) {
    const f = par(j);
    if (f <= 0) continue;
    const phi = PARS[j];
    if (Math.abs(phi) > 1.5 && ee < 0.02) continue;
    const rho = lerp(Math.cos(phi), 1, ee), Y = lerp(Math.sin(phi), phi * 2 / Math.PI, ee);
    for (let i = 0; i <= NPAR; i++) {
      const lp = (i / NPAR * 2 - 1) * Math.PI;
      if (Math.abs(lp) > Math.PI * f) continue;
      const ang = lp * sc;
      draw(rho * Math.sin(ang) * inv, Y, rho * (Math.cos(ang) * inv - inv + 1));
    }
  }
}

function globeGeom(c) {
  const pw = c.w * 2, ph = c.h * 4;
  const R = Math.floor(Math.min(pw * 0.36, ph * 0.37));
  const F = fieldLayout(c);
  return { pw, ph, R, cx: pw / 2, cy: ph / 2 - 2, hx: F.nx * 2, hy: F.ny * 2, F };
}

const GLOBE_W = 0.55;                                 // rad/s
function globeShots(film, tG0, tG1, tL1) {
  const tWorld = film.W(6, 4);
  const tSim = film.W(7, 4);
  const half = film.beatLen / 2;
  const T0 = film.beatTime(27);                       // life generation 0
  const TUN = 0.95;                                   // unroll duration

  // ---------------------------------------------------------------- the globe
  film.shot(tG0, tG1, '/ world', (c) => {
    const { s, t, lt } = c;
    const G = globeGeom(c);
    const br = paneBraille(c, 'globe');
    const rot = 0.5 + GLOBE_W * lt;
    const mer = (k) => easeInOut(prog(t, tG0 + 0.02 + k * 0.024, tG0 + 0.36 + k * 0.024));
    const par = (j) => easeInOut(prog(t, tG0 + 0.5 + j * 0.045, tG0 + 0.9 + j * 0.045));
    const bright = Math.max(Math.exp(-Math.max(0, t - tWorld) * 5) * (t >= tWorld ? 1 : 0), 0.22 * c.F.kick(t) * prog(t, tG0 + 0.9, tG0 + 1.1));
    drawLattice(br, G, 0, rot, mer, par, bright, 1);
    // limb
    const kl = prog(t, tG0 + 0.4, tG0 + 0.9);
    if (kl > 0) br.circle(G.cx, G.cy, G.R, mix(P.bg, mix(P.clayLo, P.goldHi, bright * 0.6), kl), 0, TAU, 0.5);
    // the ring that leaves the world when it completes
    if (t >= tWorld) {
      const k = prog(t, tWorld, tWorld + 0.3);
      if (k < 1) br.circle(G.cx, G.cy, G.R * (1 + 0.28 * easeOut(k)), mix(P.goldHi, P.bg, easeOut(k)), 0, TAU, 2);
    }
    br.blit(s, c.x, c.y);
    label(s, c.x + 2, c.y + c.h - 2, `lat ${String(Math.round(15 + 20 * easeOut(prog(t, tG0, tWorld)))).padStart(2)}°  lon ${String(Math.round((rot * 57.2958) % 360)).padStart(3)}°`, P.dim, prog(t, tG0 + 0.3, tG0 + 0.6));
  });

  // ---------------------------------------------------------------- the unrolled grid runs Life
  film.shot(tG1, tL1, '/ simulation', (c) => {
    const { s, t, lt } = c;
    const G = globeGeom(c);
    const F = G.F;
    const L = lifeGens(F.nx, F.ny);
    const e = prog(lt, 0.0, TUN);
    // the turning slows to a stop as the grid unrolls
    const rot = 0.5 + GLOBE_W * (tG1 - tG0) + GLOBE_W * (TUN / 3) * (1 - (1 - e) ** 3);
    // the plate under the field
    const plateK = easeOut(prog(lt, 0.45, 1.0));
    if (plateK > 0) s.fill(F.x, F.y, F.nx * 2, F.ny, 32, -1, mix(P.bg, P.bg2, plateK));
    // lattice
    const latA = 1 - prog(lt, TUN - 0.15, TUN + 0.2);
    if (latA > 0) {
      const br = paneBraille(c, 'globe');
      drawLattice(br, G, e, rot, () => 1, () => 1, 0, latA);
      const kl = 1 - prog(lt, 0, 0.2);
      if (kl > 0) br.circle(G.cx, G.cy, G.R, mix(P.bg, P.clayLo, kl), 0, TAU, 0.5);
      br.blit(s, c.x, c.y);
    }
    // the life field
    const nGen = (t - T0) / half;
    const g = Math.max(0, Math.min(L.state.length - 1, Math.floor(nGen)));
    const f = clamp(nGen - Math.floor(nGen));
    const px = pixels('life', F.nx * 2, F.ny);
    const st = L.state[g], ag = L.age[g], prev = L.state[Math.max(0, g - 1)];
    const rr = easeInOut(prog(t, tG1 + 0.35, tSim));            // reveal radius 0..1
    const ring = prog(t, tSim, tSim + 0.55);
    const hot = t >= tSim ? Math.exp(-(t - tSim) * 4) : 0;
    const cxn = (F.nx - 1) / 2, cyn = (F.ny - 1) / 2;
    const kick = c.F.kick(t) * prog(t, tSim - 0.3, tSim);
    for (let y = 0; y < F.ny; y++) {
      for (let x = 0; x < F.nx; x++) {
        const i = y * F.nx + x;
        const d = Math.hypot((x - cxn) / (F.nx / 2), (y - cyn) / (F.ny / 2)) / 1.15;
        const rv = clamp((rr * 1.25 - d - 0.12 * hash(x, y, 3)) / 0.12);
        if (rv <= 0) continue;
        let col, a;
        if (st[i]) {
          col = ageColor(ag[i]);
          a = ag[i] <= 1 ? 0.3 + 0.7 * easeOut(clamp(f * 2.2)) : 1;
          if (t >= tSim && ring < 1) {
            const w = Math.exp(-(((d - 1.1 * ring) / 0.09) ** 2));
            if (w > 0.02) col = mix(col, P.white, w * 0.6);
          }
          if (hot > 0.02) col = mix(col, P.goldHi, hot * 0.25);
          if (kick > 0.05) col = mix(col, P.goldHi, kick * 0.18);
        } else if (prev[i] && g > 0) {
          col = P.clayDeep; a = (1 - f) * 0.9;
        } else continue;
        px.rect(x * 2, y * 2, 2, 2, col, a * rv);
      }
    }
    px.blit(s, F.x, F.y);
    c.film.anchor('life', F.x + F.nx, F.y + (F.ny >> 1));
    // counters
    const kc = prog(lt, 0.9, 1.2);
    if (kc > 0) {
      const gi = Math.floor(nGen);
      label(s, F.x, F.y + F.ny + 1, `generation ${String(Math.max(0, gi)).padStart(4, '0')}`, P.dim, kc);
      const al = L.alive[g];
      const str = `alive ${String(al).padStart(4)}`;
      label(s, F.x + F.nx * 2 - strWidth(str), F.y + F.ny + 1, str, t >= tSim ? mix(P.dim, P.clay, hot) : P.dim, kc);
    }
  });
}

// =================================================================== R-A2  training dashboard

const RAIN_N = [...'etaoinshrdlucmfwypvbgkqjxz0123456789{}[]();=<>/|_-+*&%$#@!?:,.ĠĊçļĦãäåæèé'].map((ch) => ch.codePointAt(0));
const RAIN_W = [...'的了是我你在有不這個人他們來說就都要會可以好對能上出也下時過去年家後'];
const RAIN_SP = [], RAIN_OF = [], RAIN_DE = [], RAIN_WD = [];
for (let x = 0; x < 260; x++) {
  RAIN_SP.push(2.2 + 6.5 * hash(x, 1, 21));
  RAIN_OF.push(200 * hash(x, 2, 21));
  RAIN_DE.push(0.14 + 0.24 * hash(x, 4, 21));
  RAIN_WD.push(x % 2 === 0 && hash(x, 3, 21) < 0.3);
}

/** A very dim corpus waterfall: random tokens drifting down, each column at its own speed. */
function corpusRain(s, c, t, boost) {
  for (let x = 0; x < c.w; x++) {
    const xi = x % RAIN_SP.length;
    if (x > 0 && RAIN_WD[(x - 1) % RAIN_SP.length]) continue;
    const sp = RAIN_SP[xi], off = RAIN_OF[xi], dens = RAIN_DE[xi], wide = RAIN_WD[xi];
    const base = t * sp - off;
    for (let y = 0; y < c.h; y++) {
      const r = Math.floor(y - base);
      if (hash(x, r, 11) > dens) continue;
      const col = mix(P.bg, P.dim, (0.1 + 0.16 * hash(x, r, 13)) * boost);
      const k = hash(x, r, 12);
      if (wide) s.text(c.x + x, c.y + y, RAIN_W[(k * RAIN_W.length) | 0], col);
      else s.put(c.x + x, c.y + y, RAIN_N[(k * RAIN_N.length) | 0], col);
    }
  }
}

/** Pretraining loss, noisy and falling (u = 0..1 of the run). */
function lossAt(u) {
  const base = 1.62 + 9.2 / Math.pow(1 + 46 * u, 0.84);
  const noise = (fbm(u * 60 + 3, 0.5, 11, 3) - 0.5) * 2 * (0.3 + 0.7 * Math.exp(-u * 5));
  const spike = 0.9 * Math.exp(-(((u - 0.37) / 0.011) ** 2)) + 0.55 * Math.exp(-(((u - 0.64) / 0.009) ** 2));
  return Math.max(1.3, base + noise + spike);
}
const L_MAX = 11.6, L_MIN = 1.25;
const lossY = (L) => (Math.log(L_MAX) - Math.log(L)) / (Math.log(L_MAX) - Math.log(L_MIN));
/** Learning rate: warm-up, then cosine decay to 10% (0..1 of the peak). */
function lrAt(u) {
  const w = 0.035;
  return u < w ? u / w : 0.1 + 0.9 * 0.5 * (1 + Math.cos((Math.PI * (u - w)) / (1 - w)));
}

function noiseCol(n) {
  if (n > 0.94) return P.clayLo;
  return mix(P.bg3, P.soft, 0.1 + n * n * 0.5);
}

function trainShot(film, a, b) {
  const steps = A2_REPLIES.map((n) => film.beatTime(n));
  const SIGMA = [1, 0.78, 0.5, 0.24, 0];
  const BLOCK = [8, 6, 3, 2, 1];
  const img = film.img;
  const FULL = [0, 0, 1, 0.92];
  const TOK_END = 15e12;
  // the plots' x axis is sqrt(steps): the head then moves steadily while the checkpoint number accelerates
  const xOf = (t) => Math.sqrt(clamp((ckptAt(t) - 512) / 818688));

  film.shot(a, b, (t) => `/ train · ${fmtCkpt(ckptAt(t))}`, (c) => {
    const { s, t } = c;
    const u = xOf(t);                                                // 0..1 along the (square-root) step axis
    const stepsDone = steps.filter((x) => t >= x).length;           // 0..4
    const sinceStep = stepsDone ? t - steps[stepsDone - 1] : 9;
    const flash = Math.exp(-sinceStep * 5) * (stepsDone ? 1 : 0);

    // ---- layout
    const m = c.w >= 70 ? 3 : 2;
    const pRows = clamp(Math.round(c.h * 0.78), 8, c.h - 2 * m - 1);
    const pCols = Math.round((pRows * 2 * 450) / (0.92 * 800));
    const xp = c.x + c.w - m - pCols, yp = c.y + Math.floor((c.h - pRows) / 2) - 1;
    const xl = c.x + m, colW = xp - 4 - xl;

    corpusRain(s, c, t, 1 + 1.6 * flash + 0.7 * c.F.kick(t));

    // ---- the portrait emerging from noise
    s.fill(xp - 1, yp - 1, pCols + 2, pRows + 2, 32, -1, P.bg);
    const pw = pCols, ph = pRows * 2;
    const px = pixels('port', pw, pRows);
    const n = c.beat.n;
    const sweep = stepsDone ? Math.pow(prog(t, steps[stepsDone - 1], steps[stepsDone - 1] + 0.32), 0.8) : 1;
    const newL = stepsDone, oldL = Math.max(0, stepsDone - 1);
    const smp = [];
    const getSmp = (lv) => {
      const bk = BLOCK[lv];
      if (!smp[lv]) smp[lv] = img.sample(Math.ceil(pw / bk), Math.ceil(ph / bk), ...FULL);
      return smp[lv];
    };
    for (let y = 0; y < ph; y++) {
      const lv = y / ph < sweep ? newL : oldL;
      const sg = SIGMA[lv], bk = BLOCK[lv];
      const sm = sg < 1 ? getSmp(lv) : null;
      const sw = sm ? Math.ceil(pw / bk) : 0;
      for (let x = 0; x < pw; x++) {
        const slot = Math.floor((n + 4 * hash(x, y, 7)) / 4);
        const uu = hash(x, y, 30 + slot * 5);
        if (sg >= 1) {
          px.set(x, y, noiseCol(hash(x, y, 31 + slot * 5)), 1);
        } else {
          const i = ((y / bk) | 0) * sw + ((x / bk) | 0);
          const ia = sm.a[i];
          if (uu < sg) {
            // a noise pixel takes some of what is under it, so the figure never goes black
            const base = ia > 0.3 ? sm.c[i] : P.bg;
            const g = noiseCol(hash(x, y, 31 + slot * 5));
            px.set(x, y, mix(base, g, 0.55 + 0.45 * sg ** 4), Math.max(ia, Math.pow(sg, 0.8)));
          } else {
            let col = sm.c[i];
            if (sg > 0) col = mix(col, noiseCol(hash(x, y, 32 + slot * 5)), sg * 0.3);
            px.set(x, y, col, ia);
          }
        }
      }
    }
    // the refresh line sweeping down on every step
    if (stepsDone && sweep < 1) {
      const yy = Math.floor(sweep * ph);
      for (let x = 0; x < pw; x++) px.set(x, yy, P.goldHi, 0.85);
    }
    px.blit(s, xp, yp);
    // fully denoised (above the last refresh line), she is drawn in the terminal's finest cells
    if (stepsDone === SIGMA.length - 1) {
      const done = sweep >= 1 ? pRows : Math.floor(Math.floor(sweep * ph) / 2);
      if (done > 0) {
        s.pushClip(xp, yp, pCols, done);
        img.draw(s, xp, yp, pw, pRows, { crop: FULL });
        s.popClip();
      }
    }
    const bcol = mix(P.line, P.goldHi, flash * 0.9);
    box(s, xp - 1, yp - 1, pCols + 2, pRows + 2, bcol);
    const sigNow = stepsDone ? lerp(SIGMA[oldL], SIGMA[newL], sweep) : 1;
    label(s, xp + 1, yp - 1, ` noise σ = ${sigNow.toFixed(2)} `, mix(P.dim, P.soft, flash), 1);

    // ---- left column: loss, lr, tokens
    const fixed = 9;
    const avail = Math.max(6, c.h - 2 * m - fixed);
    const lossRows = Math.max(4, Math.round(avail * 0.7));
    const lrRows = Math.max(2, avail - lossRows);
    const ax = xl + 4, plotCols = Math.max(8, colW - 4);
    const y0 = c.y + m;
    // loss
    const lossNow = lossAt(u);
    label(s, xl, y0, 'loss', P.mute);
    label(s, xl + 5, y0, '· log', P.dim);
    const lossStr = lossNow.toFixed(3);
    s.text(xl + colW - strWidth(lossStr), y0, lossStr, mix(P.clay, P.clayHi, flash), KEEP, BOLD);
    for (let r = 0; r < lossRows; r++) s.put(ax, y0 + 1 + r, 0x2502, P.line);
    s.text(ax, y0 + 1 + lossRows, '└' + '─'.repeat(plotCols), P.line);
    for (const [v, txt] of [[10, '10'], [5, ' 5'], [2, ' 2']]) {
      const row = Math.min(lossRows - 1, Math.floor((lossY(v) * (lossRows * 4 - 1)) / 4));
      label(s, ax - 3, y0 + 1 + row, txt, P.dim);
    }
    label(s, ax, y0 + 2 + lossRows, '0', P.dim);
    const endLab = '819200';
    label(s, ax + 1 + plotCols - endLab.length, y0 + 2 + lossRows, endLab, P.dim);
    if (plotCols >= 30) {
      for (const [stepsAt, txt] of [[1e5, '100k'], [4e5, '400k']]) {
        const col = Math.round(Math.sqrt(stepsAt / 819200) * plotCols);
        s.put(ax + 1 + col, y0 + 1 + lossRows, 0x2534, P.dim);
        label(s, ax + 1 + col - 2, y0 + 2 + lossRows, txt, P.dim);
      }
    }
    const br = braille('loss', plotCols, lossRows);
    const PW = br.pw, PH = br.ph;
    for (const v of [10, 5, 2]) {                                   // faint gridlines (log scale)
      const gy = Math.round(lossY(v) * (PH - 1));
      for (let x = 2; x < PW; x += 4) br.dot(x, gy, mix(P.bg, P.line, 0.6), 0.2);
    }
    const headX = Math.floor(u * (PW - 1));
    let prevX = 0, prevY = lossY(lossAt(0)) * (PH - 1);
    for (let x = 1; x <= headX; x++) {
      const yy = lossY(lossAt(x / (PW - 1))) * (PH - 1);
      const k = 0.55 + 0.45 * (x / Math.max(1, headX));
      br.line(prevX, prevY, x, yy, mix(P.clayLo, P.clay, k));
      prevX = x; prevY = yy;
    }
    // checkpoint dots
    steps.forEach((ts, i) => {
      if (t < ts) return;
      const q = xOf(ts);
      const dx = Math.round(q * (PW - 1)), dy = Math.round(lossY(lossAt(q)) * (PH - 1));
      const age = t - ts;
      for (let yy = dy + 4; yy < PH; yy += 3) br.dot(dx, yy, mix(P.bg, P.gold, 0.35), 0.5);
      br.circle(dx, dy, 2, P.goldHi, 0, TAU, 3);
      br.dot(dx, dy, P.white, 4);
      if (age < 0.5) br.circle(dx, dy, 3 + 7 * easeOut(age / 0.5), mix(P.goldHi, P.bg, easeOut(age / 0.5)), 0, TAU, 2);
    });
    if (u > 0) {
      br.circle(headX, prevY, 1, P.clayHi, 0, TAU, 5);
      const pz = c.pulse(5);
      if (pz > 0.1) br.circle(headX, prevY, 3 + 3 * (1 - pz), mix(P.bg, P.clay, pz * 0.8), 0, TAU, 2);
    }
    br.blit(s, ax + 1, y0 + 1);

    // learning rate
    const yL = y0 + lossRows + 4;
    label(s, xl, yL, 'lr', P.mute);
    const lrStr = `${(3e-4 * lrAt(u * u)).toExponential(1).replace('e-', 'e-0')}`;
    s.text(xl + colW - strWidth(lrStr), yL, lrStr, P.skyHi);
    for (let r = 0; r < lrRows; r++) s.put(ax, yL + 1 + r, 0x2502, P.line);
    s.text(ax, yL + 1 + lrRows, '└' + '─'.repeat(plotCols), P.line);
    const bl = braille('lr', plotCols, lrRows);
    const LW = bl.pw, LH = bl.ph;
    let lx0 = 0, ly0 = (1 - lrAt(0)) * (LH - 1);
    for (let x = 1; x < LW; x++) {
      const xx = x / (LW - 1);
      const yy = (1 - lrAt(xx * xx)) * (LH - 1);
      bl.line(lx0, ly0, x, yy, x <= u * (LW - 1) ? P.sky : P.line);
      lx0 = x; ly0 = yy;
    }
    const hx = Math.round(u * (LW - 1)), hy = Math.round((1 - lrAt(u * u)) * (LH - 1));
    bl.circle(hx, hy, 1, P.skyHi, 0, TAU, 5);
    bl.blit(s, ax + 1, yL + 1);

    // tokens seen
    const ck = ckptAt(t);
    const tok = TOK_END * (ck / 819200);
    const yT = yL + lrRows + 3;
    label(s, xl, yT, 'tokens', P.mute);
    const tokStr = `${(tok / 1e12).toFixed(2)}T`;
    s.text(xl + 8, yT, tokStr, P.text, KEEP, BOLD);
    const barW = colW;
    const done = Math.round(barW * (ck / 819200));
    s.text(xl, yT + 1, '━'.repeat(done), P.clayLo);
    s.text(xl + done, yT + 1, '─'.repeat(Math.max(0, barW - done)), P.line);
    const ratio = colW >= 38 ? `${commas(ck)} / 819,200` : `${Math.round(ck / 1000)}k / 819k`;
    if (8 + strWidth(tokStr) + 2 + strWidth(ratio) <= colW) label(s, xl + colW - strWidth(ratio), yT, ratio, P.dim);
  }, { enter: { dur: 0.3, from: 'center' } });
}

// =================================================================== R-A3a / R-A3b  embeddings, then RoPE

/**
 * Her silhouette as ~620 points: farthest-point sampling over her opaque pixels, denser along edges, in the head and
 * where the picture has detail, so it reads as a stippled drawing. Depth is a smooth function of position.
 */
function buildCloud(img) {
  const GW = 72, GH = 118, N = 620;
  const smp = img.sample(GW, GH, 0, 0, 1, 0.92);
  const A = smp.a;
  const on = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && A[y * GW + x] > 0.5;
  const lum = (i) => { const c = smp.c[i]; return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; };
  const grad = new Float32Array(GW * GH), gs = [];
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      if (!on(x, y)) continue;
      grad[i] = Math.hypot(lum(i + 1) - lum(i - 1), lum(i + GW) - lum(i - GW));
      gs.push(grad[i]);
    }
  }
  gs.sort((p, q) => p - q);
  const g95 = gs[Math.floor(gs.length * 0.95)] || 1;
  const cand = [];
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (!on(x, y)) continue;
      const edge = !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1));
      const gn = Math.min(1, grad[y * GW + x] / g95);
      cand.push({ x, y, w: (edge ? 0.8 : 1) * (y < GH * 0.2 ? 0.75 : 1) / (1 + 1.6 * gn), md: 1e9 });
    }
  }
  const r = rng(7);
  const pts = [];
  let cur = cand[Math.floor(r() * cand.length)];
  for (let k = 0; k < N && cur; k++) {
    pts.push([cur.x, cur.y]);
    let best = null, bs = -1;
    for (const q of cand) {
      const d = Math.hypot(q.x - cur.x, q.y - cur.y);
      if (d < q.md) q.md = d;
      const sc = q.md / q.w;
      if (sc > bs) { bs = sc; best = q; }
    }
    cur = best;
  }
  const n = pts.length;
  const asp = GW / GH;
  let mx = 0;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  pts.forEach(([x, y], i) => { X[i] = ((x + 0.5) / GW - 0.5) * asp; Y[i] = 0.5 - (y + 0.5) / GH; mx += X[i]; });
  mx /= n;
  let ymin = 9, ymax = -9;
  for (let i = 0; i < n; i++) { X[i] -= mx; ymin = Math.min(ymin, Y[i]); ymax = Math.max(ymax, Y[i]); }
  const yc = (ymin + ymax) / 2, hh = ymax - ymin;
  for (let i = 0; i < n; i++) {
    Y[i] = (Y[i] - yc) / hh;                                    // height 1, centred
    X[i] /= hh;
    const dome = Math.cos(X[i] * 2.4) * (0.55 + 0.45 * Math.cos(Y[i] * 2.6));
    Z[i] = 0.2 * dome + 0.09 * Math.sin(7.5 * X[i] + 2.4 * Y[i]) + 0.05 * Math.cos(11 * Y[i] - 3 * X[i]);
  }
  // order by polar angle around the centre: the ring takes the points in this order
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => Math.atan2(Y[p], X[p]) - Math.atan2(Y[q], X[q]));
  const alpha = new Float32Array(n);
  order.forEach((i, k) => { alpha[i] = -Math.PI + ((k + 0.5) / n) * TAU; });
  return { n, X, Y, Z, alpha, delay: Float32Array.from({ length: n }, (_, i) => hash(i, 1, 4)) };
}

const OM = TAU / 12;                                    // RoPE: one position step turns the vector by omega

/** The ring the points fall onto (same place in the RoPE shot and in the unit-circle shot that follows). */
function ringGeom(c) {
  const pw = c.w * 2, ph = c.h * 4;
  return { cx: pw / 2, cy: ph / 2 - 3, R: Math.min(ph * 0.38, pw * 0.3) };
}

/** Position m of the token: it steps once per beat, easing in the first half of the beat. */
function ropeSteps(film, t, tForm) {
  const b0 = Math.round((tForm - film.firstBeat) / film.beatLen);
  const f = (t - film.firstBeat) / film.beatLen;
  const bi = Math.floor(f);
  if (bi <= b0) return 0;
  return bi - b0 - 1 + easeOut(clamp((f - bi) * 2.2));
}

/**
 * The magic circle at her feet, drawn in gold: the circumference traced (arc), a second ring, tick marks and an
 * eight-pointed star of lines. p = { alpha, a0, arc, ring2, ticks, star } progress values (0..1).
 */
function magicCircle(br, cx, cy, R, p, age = 0) {
  const A = p.alpha ?? 1;
  const gold = mix(P.bg, P.gold, A), hi = mix(P.bg, P.goldHi, A), kr = mix(P.bg, P.kraft, A * 0.8);
  if (p.arc > 0) {
    br.ellipse(cx, cy, R + 2.5, R + 2.5, mix(gold, hi, Math.max(0, 1 - age * 3)), p.a0, p.a0 - TAU * p.arc, 4);
    const a = p.a0 - TAU * p.arc;
    if (p.arc < 1) br.circle(cx + Math.cos(a) * (R + 2.5), cy + Math.sin(a) * (R + 2.5), 1.4, P.white, 0, TAU, 6);
  }
  if (p.ring2 > 0) br.ellipse(cx, cy, R * 0.84, R * 0.84, kr, p.a0, p.a0 - TAU * p.ring2, 3);
  if (p.ticks > 0) {
    const NT = 48;
    for (let k = 0; k < NT; k++) {
      if (k / NT > p.ticks) break;
      const a = (k * TAU) / NT;
      const len = k % 6 === 0 ? 0.13 : k % 2 === 0 ? 0.075 : 0.04;
      const r0 = R + 6, r1 = R + 6 + R * len;
      br.line(cx + Math.cos(a) * r0, cy - Math.sin(a) * r0, cx + Math.cos(a) * r1, cy - Math.sin(a) * r1, k % 6 === 0 ? gold : kr, 2);
    }
  }
  if (p.star > 0) {
    const rs = R * 0.84, ns = 8;
    const vx = (k) => cx + Math.cos(Math.PI / 8 + (k * TAU) / ns) * rs;
    const vy = (k) => cy - Math.sin(Math.PI / 8 + (k * TAU) / ns) * rs;
    const total = p.star * ns;
    for (let k = 0; k < ns; k++) {
      const f = clamp(total - k);
      if (f <= 0) break;
      const k2 = (k + 3) % ns;
      br.line(vx(k), vy(k), lerp(vx(k), vx(k2), f), lerp(vy(k), vy(k2), f), gold, 2);
    }
    if (total > 0) for (let k = 0; k < ns; k++) br.circle(vx(k), vy(k), 1, hi, 0, TAU, 3);
    if (p.star >= 1) br.circle(cx, cy, R * 0.16, kr, 0, TAU, 2);
  }
}

const depthColor = (d) => (d >= 0.5 ? mix(P.kraft, P.clay, (d - 0.5) * 2) : mix(P.dim, P.kraft, d * 2));

function embeddingShots(film, tA, tB, tC) {
  const cloud = buildCloud(film.img);
  const { n, X, Y, Z } = cloud;
  const tDim = film.W(10, 6), tCircle = film.W(11, 3), tCirc = film.W(12, 6);
  const W9 = (k) => film.W(9, k);
  const TURN = (t) => { const u = prog(t, tA, tB); return TAU * lerp(u, smooth(u), 0.6); };
  const cloudGeom = (c) => {
    const pw = c.w * 2, ph = c.h * 4;
    return { pw, ph, cx: pw / 2, cy: ph / 2 - 3, S: Math.min(ph * 0.74, pw * 0.8 / 0.66) };
  };
  const D = 2.1;
  // a few points carry a token, like the labels of an embedding projector
  const TOKENS = [['你', -0.07, 0.40], ['好', 0.07, 0.33], ['me', -0.27, 0.12], ['world', 0.26, 0.04], ['you', -0.2, -0.2], ['的', 0.2, -0.27], ['the', 0.0, -0.44]];
  const labelled = TOKENS.map(([txt, tx, ty]) => {
    let best = 0, bd = 9;
    for (let i = 0; i < n; i++) { const d = (X[i] - tx) ** 2 + (Y[i] - ty) ** 2; if (d < bd) { bd = d; best = i; } }
    return { txt, i: best };
  });

  // ------------------------------------------------------------------ the point cloud turns
  film.shot(tA, tB, '/ embeddings', (c) => {
    const { s, t, lt } = c;
    const G = cloudGeom(c);
    const br = paneBraille(c, 'cloud');
    const th = TURN(t), ct = Math.cos(th), st = Math.sin(th);
    const reveal = easeOut(prog(lt, 0.02, 0.55));
    const ping = (w, k) => (t >= w ? Math.exp(-(t - w) * k) : 0);
    const boost = Math.max(ping(W9(3), 9) * 0.4, ping(W9(4), 9) * 0.4, ping(W9(5), 6), c.pulse(7) * 0.06 + c.F.kick(t) * 0.1);
    for (let i = 0; i < n; i++) {
      const yn = 0.5 - Y[i];                           // 0 at the top
      const k = clamp((reveal * 1.4 - yn * 0.9) / 0.25);
      if (k <= 0) continue;
      const x = X[i], z = Z[i];
      const xr = x * ct + z * st, zr = -x * st + z * ct;
      const sc = D / (D - zr);
      const d = clamp(0.5 + zr / 0.36);
      let col = depthColor(d);
      if (boost > 0.02) col = mix(col, P.goldHi, boost * 0.65 * (0.4 + 0.6 * d));
      if (k < 1) col = mix(P.white, col, k);
      const px = G.cx + xr * sc * G.S, py = G.cy - Y[i] * sc * G.S;
      br.dot(px, py, col, 1 + d);
      if (d > 0.7) br.dot(px, py + 1, col, 1 + d);
    }
    // labelled points: a ring around the dot and the token beside it
    const labs = [];
    const kTok = (1 - prog(t, tB - 0.4, tB - 0.05)) * smooth(clamp((Math.abs(ct) - 0.28) / 0.4));       // not while edge-on
    labelled.forEach(({ txt, i }, j) => {
      const kk = prog(t, W9(5) + 0.05 + j * 0.07, W9(5) + 0.3 + j * 0.07) * kTok;
      if (kk <= 0) return;
      const x = X[i], z = Z[i];
      const xr = x * ct + z * st, zr = -x * st + z * ct, sc = D / (D - zr);
      const d = clamp(0.5 + zr / 0.36);
      const px = G.cx + xr * sc * G.S, py = G.cy - Y[i] * sc * G.S;
      br.circle(px, py, 2.6, mix(P.bg, mix(P.mute, P.soft, d), kk), 0, TAU, 6);
      labs.push([c.x + Math.round(px / 2) + 3, c.y + Math.round(py / 4), txt, mix(P.bg, mix(P.dim, P.soft, d), kk)]);
    });
    // three axes through the middle: the principal components
    const ka = easeOut(prog(t, tDim, tDim + 0.4));
    if (ka > 0) {
      const ax = [[0.46, 0, 0, 'PC1'], [0, 0.56, 0, 'PC2'], [0, 0, 0.46, 'PC3']];
      for (const [ex, ey, ez, name] of ax) {
        const proj = (f) => {
          const x = ex * f, z = ez * f, y = ey * f;
          const xr = x * ct + z * st, zr = -x * st + z * ct, sc = D / (D - zr);
          return [G.cx + xr * sc * G.S, G.cy - y * sc * G.S];
        };
        const [x1, y1] = proj(ka), [x0, y0] = proj(-ka * 0.55);
        br.line(x0, y0, x1, y1, P.mute, 0.6);
        br.circle(x1, y1, 1, P.soft, 0, TAU, 5);
        const [lx, ly] = proj(1.08);
        if (ka > 0.9) label(s, c.x + Math.round(lx / 2) + 1, c.y + Math.round(ly / 4), name, P.mute);
      }
    }
    br.blit(s, c.x, c.y);
    for (const [lx, ly, txt, col] of labs) s.text(lx, ly, txt, col);
    // the set, and its dimension
    label(s, c.x + 3, c.y + 2, `n = ${n}`, P.dim, prog(t, W9(3), W9(3) + 0.25));
    const cap = 'dim = 4096 → 3 (PCA)';
    const kc = prog(t, tDim, tDim + 0.55);
    if (kc > 0) {
      const shown = part(cap, kc);
      const cx0 = c.x + Math.floor((c.w - strWidth(cap)) / 2), cy0 = c.y + c.h - 3;
      let x = cx0;
      for (const [txt, col, at] of [['dim', P.mute, 0], [' = ', SYN.punct, 0], ['4096', SYN.num, 0], [' → ', P.clay, 0], ['3', P.clay, BOLD], [' (PCA)', P.dim, 0]]) {
        const used = x - cx0;
        const take = shown.slice(Math.max(0, used), Math.max(0, used + txt.length));
        if (take) s.text(x, cy0, take, col, KEEP, at);
        x += txt.length;
      }
    }
  }, { enter: { dur: 0.3, from: 'center' } });

  // ------------------------------------------------------------------ the points fall onto a circle; RoPE
  film.shot(tB, tC, '/ RoPE', (c) => {
    const { s, t } = c;
    const G = cloudGeom(c);
    const { cx, cy, R } = ringGeom(c);
    const br = paneBraille(c, 'cloud');
    const tFall = tB + 0.12, tForm = tCircle;
    const drift = 0.14 * Math.max(0, t - tForm);
    const formed = t >= tForm;
    const m = ropeSteps(film, t, tForm);
    const th = m * OM;                                        // the radius vector, math angle
    const base = mix(P.dim, P.kraft, 0.72);
    // the points
    for (let i = 0; i < n; i++) {
      const x = X[i], z = Z[i];
      const sc = D / (D - z);
      const sx = G.cx + x * sc * G.S, sy = G.cy - Y[i] * sc * G.S;
      const dly = 0.5 - Y[i];                                  // the top falls first
      const e = easeInOut(prog(t, tFall + 0.24 * dly, tFall + 0.24 * dly + (tForm - tFall - 0.24)));
      const al = cloud.alpha[i] + drift;
      const rj = R + (hash(i, 5, 3) - 0.5) * 7;
      let px = lerp(sx, cx + Math.cos(al) * rj, e), py = lerp(sy, cy - Math.sin(al) * rj, e);
      const sw = Math.sin(e * Math.PI) * 0.32, cs = Math.cos(sw), sn = Math.sin(sw);   // a little swirl on the way
      const dx = px - cx, dy = py - cy;
      px = cx + dx * cs - dy * sn; py = cy + dx * sn + dy * cs;
      let col = e < 1 ? mix(depthColor(clamp(0.5 + z / 0.36)), base, e) : base;
      if (formed) {
        const dl = wrapPi(th - al);
        if (dl > 0 && dl < 2.2) col = mix(col, P.clayHi, Math.exp(-dl / 0.45) * 0.95);
      }
      br.dot(px, py, col, 1 + e);
    }
    // the radius vector, its angle and the caption
    const kv = easeOut(prog(t, tForm, tForm + 0.18));
    if (kv > 0) {
      br.lineFn(cx, cy, cx + Math.cos(0) * R * 0.97, cy, (q) => (q * 20) % 2 < 1 ? P.line : -1);          // m = 0
      const tipx = cx + Math.cos(th) * R * kv, tipy = cy - Math.sin(th) * R * kv;
      br.line(cx, cy, tipx, tipy, P.clay, 6);
      br.circle(tipx, tipy, 1.4, P.clayHi, 0, TAU, 7);
      br.circle(cx, cy, 1, P.clay, 0, TAU, 7);
      if (th > 0.05) br.ellipse(cx, cy, R * 0.3, R * 0.3, P.gold, 0, -th, 5);
      if (kv >= 1) {
        label(s, c.x + Math.round((cx + Math.cos(th / 2) * R * 0.4) / 2) - 1, c.y + Math.round((cy - Math.sin(th / 2) * R * 0.4) / 4), 'θ', P.gold);
        const mtxt = `m = ${Math.round(m)}`;
        const rr = R + (t >= tCirc ? 20 : 10);              // outside the ticks once the magic circle is drawn
        const lx = (cx + Math.cos(th) * rr) / 2, ly = (cy - Math.sin(th) * rr) / 4;
        const cs = Math.cos(th);
        const x0 = cs < -0.25 ? lx - strWidth(mtxt) : cs > 0.25 ? lx : lx - strWidth(mtxt) / 2;
        label(s, c.x + Math.round(x0), c.y + Math.round(ly), mtxt, P.soft);
      }
    }
    // the circumference traced, then the magic circle
    const kArc = easeInOut(prog(t, tCirc, tCirc + 0.4));
    const mg = {
      alpha: 1, a0: -th, arc: kArc,
      ring2: easeOut(prog(t, tCirc + 0.2, tCirc + 0.42)),
      ticks: prog(t, tCirc + 0.28, tCirc + 0.6),
      star: prog(t, tCirc + 0.32, tCirc + 0.66),
    };
    if (t >= tCirc) magicCircle(br, cx, cy, R, mg, t - tCirc);
    br.blit(s, c.x, c.y);
    label(s, c.x + 3, c.y + 2, `n = ${n}`, P.dim);
    // captions
    const cy0 = c.y + c.h - 3;
    const cap = 'θ = m·ω';
    const kc = prog(t, tForm + 0.15, tForm + 0.5);
    if (kc > 0) {
      const sh = part(cap, kc);
      const x0 = c.x + Math.floor((c.w - strWidth(cap)) / 2);
      s.text(x0, cy0, sh.slice(0, 1), P.gold, KEEP, BOLD);
      if (sh.length > 1) s.text(x0 + 1, cy0, sh.slice(1), P.soft);
    }
    const kC = prog(t, tCirc + 0.04, tCirc + 0.3);
    if (kC > 0) {
      const cap2 = 'C = 2πr';
      const sh = part(cap2, kC);
      const x0 = c.x + Math.floor((c.w - strWidth(cap2)) / 2);
      s.text(x0, cy0 + 1, sh, P.goldHi, KEEP, BOLD);
    }
  });
}

// =================================================================== R-A3c / R-A3d  sine wave, tangents; the context ruler and its wall

function waveShots(film, tC, tD, tE) {
  const W13 = (k) => film.W(13, k), W14 = (k) => film.W(14, k), W15 = (k) => film.W(15, k), W16 = (k) => film.W(16, k);
  const T_PER = 2 * film.beatLen;                // one turn per two beats
  const OMG = TAU / T_PER;
  const tTurn0 = film.beatTime(Math.ceil((tC + 0.3 - film.firstBeat) / film.beatLen));   // the point starts to turn on a beat
  const tSit = W14(3), tTan = W14(7);
  // the turning slows to a gentle drift before the mascot sits down (smoothstep decay; closed-form angle)
  const tSlow = W13(4) + 0.1, DSLOW = 0.9, KEEPW = 0.15;
  const theta = (t) => {
    if (t <= tTurn0) return 0;
    if (t <= tSlow) return OMG * (t - tTurn0);
    const x = (t - tSlow) / DSLOW;
    const base = OMG * (tSlow - tTurn0);
    if (x <= 1) return base + OMG * DSLOW * (x - (1 - KEEPW) * (x ** 3 - x ** 4 / 2));
    return base + OMG * (DSLOW * (1 - (1 - KEEPW) * 0.5) + KEEPW * (t - tSlow - DSLOW));
  };
  const baseRow = (c) => c.y + Math.round(c.h * 0.62);

  const geo = (c) => {
    const pw = c.w * 2, ph = c.h * 4;
    const r = clamp(Math.round(Math.min(pw * 0.115, ph * 0.15)), 9, 26);
    const cx = r + Math.round(pw * 0.07);
    const yb = (baseRow(c) - c.y) * 4 + 2;
    const x0 = cx + r + Math.round(pw * 0.1);
    const x1 = pw - Math.round(pw * 0.035);
    const lam = (x1 - x0) * 1.05;
    return { pw, ph, r, cx, yb, x0, x1, lam, k: TAU / lam };
  };
  const waveY = (G, th, x) => G.yb - G.r * Math.sin(th - G.k * (x - G.x0));
  const waveSlope = (G, th, x) => G.r * G.k * Math.cos(th - G.k * (x - G.x0));    // screen slope (y down)

  // ------------------------------------------------------------------ the unit circle turns a sine wave
  film.shot(tC, tD, '/ positional encoding', (c) => {
    const { s, t, lt } = c;
    const G = geo(c);
    const R0 = ringGeom(c);
    const br = paneBraille(c, 'wave');
    const th = theta(t);
    // the ring of the previous shot shrinks to the unit circle on the left; its gold fades away
    const e = easeInOut(prog(lt, 0.02, 0.5));
    const ccx = lerp(R0.cx, G.cx, e), ccy = lerp(R0.cy, G.yb, e), rr = lerp(R0.R, G.r, e);
    const ringCol = mix(mix(P.dim, P.kraft, 0.72), P.clay, e);
    br.circle(ccx, ccy, rr, ringCol, 0, TAU, 2);
    const fadeG = 1 - prog(lt, 0.0, 0.4);
    if (fadeG > 0) magicCircle(br, ccx, ccy, rr, { alpha: fadeG, a0: 0, arc: 1, ring2: 1, ticks: 1, star: 1 });
    const kAx = prog(lt, 0.3, 0.7);
    if (kAx > 0) {
      // axes: the circle's own, and the baseline running to the right
      br.lineFn(G.cx - G.r - 4, G.yb, G.x1, G.yb, (q) => dimTo(P.line, kAx));
      br.lineFn(G.cx, G.yb - G.r - 4, G.cx, G.yb + G.r + 4, (q) => dimTo(P.line, kAx));
      br.lineFn(G.x0, G.yb - G.r - 5, G.x0, G.yb + G.r + 5, (q) => dimTo(P.line, kAx));
    }
    if (e >= 1) {
      const Px = G.cx + G.r * Math.cos(th), Py = G.yb - G.r * Math.sin(th);
      br.line(G.cx, G.yb, Px, Py, P.clay, 4);
      br.line(Px, Py, Px, G.yb, mix(P.bg, P.clayHi, 0.7), 3);                        // sin θ, the projection
      br.lineFn(Px, Py, G.x0, Py, (q) => (Math.floor(q * 40) % 2 === 0 ? P.skyHi : -1));   // dashed
      br.circle(Px, Py, 1.6, P.clayHi, 0, TAU, 8);
      if (th % TAU > 0.1) br.ellipse(G.cx, G.yb, G.r * 0.4, G.r * 0.4, P.gold, 0, -(th % TAU), 5);
      // the wave: the history of the point's height, unrolling to the right
      const vu = G.lam / T_PER;
      const len = Math.min(G.x1 - G.x0, vu * Math.max(0, t - tTurn0));
      // the other frequencies of a positional encoding, very faint
      const kg = prog(t, tTurn0 + 0.6, tTurn0 + 1.2);
      if (kg > 0) {
        for (const [mult, off, amp] of [[2, -50, 8], [4, -66, 6], [0.5, 46, 10], [0.25, 66, 8]]) {
          const gc = dimTo(P.line, 0.55 * kg);
          let gx = G.x0, gy = G.yb + off - amp * Math.sin(th * mult);
          for (let x = G.x0 + 1; x <= G.x0 + len; x += 1) {
            const yy = G.yb + off - amp * Math.sin(mult * (th - G.k * (x - G.x0)));
            br.line(gx, gy, x, yy, gc, 1);
            gx = x; gy = yy;
          }
        }
      }
      let px0 = G.x0, py0 = waveY(G, th, G.x0);
      for (let x = G.x0 + 1; x <= G.x0 + len; x++) {
        const yy = waveY(G, th, x);
        const kf = 1 - 0.55 * ((x - G.x0) / (G.x1 - G.x0));
        br.line(px0, py0, x, yy, mix(P.clayLo, P.clayHi, kf), 3);
        px0 = x; py0 = yy;
      }
      br.circle(G.x0, waveY(G, th, G.x0), 1.4, P.skyHi, 0, TAU, 8);
      // tangents: the line slides along the wave, the mascot sitting on it
      if (t >= tTan - 0.02) {
        const kk = easeInOut(prog(t, tTan, tD));
        const xm = lerp(G.x0 + (G.x1 - G.x0) * 0.34, G.x0 + (G.x1 - G.x0) * 0.8, kk);
        const ym = waveY(G, th, xm), sl = waveSlope(G, th, xm);
        const hl = Math.min(40, (G.x1 - G.x0) * 0.3);
        const nrm = Math.hypot(1, sl);
        const ktg = prog(t, tTan - 0.02, tTan + 0.12);
        br.line(xm - hl * ktg / nrm, ym - sl * hl * ktg / nrm, xm + hl * ktg / nrm, ym + sl * hl * ktg / nrm, P.goldHi, 6);
        br.circle(xm, ym, 1, P.white, 0, TAU, 9);
      }
    
    }
    br.blit(s, c.x, c.y);
    // the mascot sits on the wave from "sit"
    if (t >= tSit && e >= 1) {
      const kk = t >= tTan ? easeInOut(prog(t, tTan, tD)) : 0;
      const xm = lerp(G.x0 + (G.x1 - G.x0) * 0.34, G.x0 + (G.x1 - G.x0) * 0.8, kk);
      const ym = waveY(G, th, xm), sl = waveSlope(G, th, xm);
      const drop = 34 * (1 - easeOutBack(prog(t, tSit, tSit + 0.32), 2.4));
      const pm = pixels('mascot', c.w, c.h);
      const spr = pixels('sprite', 18, 3);
      clawdPixels(spr, 0, 0, 1, P.clay, { step: c.beat.n % 2, blink: (t * 0.62) % 1 < 0.07 ? 1 : 0 });
      // sit on the tangent: a column shear about the feet tilts it with the slope and keeps its eyes and legs readable
      const sh = clamp(sl * 0.5, -0.42, 0.42);
      const fx = Math.round(xm / 2), fy = Math.round((ym - 1 - drop) / 2);        // feet
      for (let x = 0; x < 18; x++) {
        const oy = Math.round(sh * (x - 9));
        for (let y = 0; y < 5; y++) {
          const i = y * 18 + x;
          if (spr.a[i] > 0) pm.set(fx + x - 9, fy + y - 4 + oy, spr.c[i], 1);
        }
      }
      pm.blit(s, c.x, c.y);
    }
    // captions
    const kc = prog(t, W13(3), W13(3) + 0.5);
    if (kc > 0) {
      const cap = 'PE(pos, 2i) = sin(pos / 10000^(2i/d))';
      label(s, c.x + Math.floor((c.w - strWidth(cap)) / 2), c.y + c.h - 3, part(cap, kc), P.dim);
    }
  });

  // ------------------------------------------------------------------ the axis stretches to infinity
  const tRace = W15(2), tInf = W15(3), tHit = W16(5);
  const MAJOR = [[0, '0'], [5e4, '50K'], [1e5, '100K'], [1.5e5, '150K'], [2e5, '200K']];
  const MINOR = [2.5e5, 3e5, 4e5, 5.5e5, 8e5, 1.2e6, 2e6, 4e6, 1e7, 3e7, 1e8];
  const WALL = 32000, V0 = 40000;
  const CJK = '我可以';
  film.shot(tD, tE, '/ context', (c) => {
    const { s, t, lt } = c;
    const yb = baseRow(c);
    const xr0 = c.x + 4, L = c.w - 8;
    // one-cell shake when the bar hits the wall
    const hitAge = t - tHit;
    const ox = hitAge >= 0 && hitAge < 0.15 ? (Math.floor(hitAge * 60) % 2 ? 1 : -1) : 0;
    const kS = easeInOut(prog(lt, 0.05, 0.75));
    const fpos = (v) => (v === Infinity ? 1 : v / (v + V0));
    const lin = (v) => (v === Infinity ? 0.22 : Math.min(1, v / 2e5) * 0.22);
    const pos = (v) => xr0 + Math.round(L * lerp(lin(v), fpos(v), kS)) + ox;
    const xEnd = pos(Infinity);
    const xWall = pos(WALL);
    // the old wave collapses into the ruler
    const kw = 1 - prog(lt, 0, 0.18);
    if (kw > 0) {
      const G = geo(c);
      const br = paneBraille(c, 'wave');
      const th = theta(tD);
      let px0 = G.x0, py0 = G.yb - kw * G.r * Math.sin(th);
      for (let x = G.x0 + 1; x <= G.x1; x++) {
        const yy = G.yb - kw * G.r * Math.sin(th - G.k * (x - G.x0));
        br.line(px0, py0, x, yy, mix(P.bg, P.clay, 0.8 * kw), 3);
        px0 = x; py0 = yy;
      }
      br.circle(G.cx, G.yb, G.r * kw, mix(P.bg, P.clay, kw), 0, TAU, 2);
      br.blit(s, c.x, c.y);
    }
    // the ruler
    const rulerCol = mix(P.line, P.dim, 0.7);
    s.text(xr0 + ox, yb, '─'.repeat(Math.max(0, xEnd - xr0 - ox)), rulerCol);
    const tick = (x, ch, col) => s.put(x, yb, ch, col);
    MAJOR.forEach(([v, lab], i) => {
      const x = pos(v);
      const k = prog(lt, 0.1 + i * 0.1, 0.3 + i * 0.1);
      if (k <= 0) return;
      tick(x, 0x252c, P.mute);
      const above = lab === '150K';
      const lx = lab === '0' ? x : x - Math.floor(lab.length / 2);
      label(s, lx, above ? yb - 1 : yb + 1, lab, P.soft, k);
    });
    MINOR.forEach((v, i) => {
      const x = pos(v);
      const k = prog(lt, 0.45 + i * 0.03, 0.6 + i * 0.03);
      if (k > 0 && x < xEnd) tick(x, 0x252c, dimTo(P.dim, k));
    });
    label(s, pos(7e5) - 1, yb + 1, '…', P.dim, prog(lt, 0.6, 0.8));
    // infinity: a lemniscate in braille at the end of the ruler
    const kInf = easeOut(prog(t, tInf - 0.04, tInf + 0.35));
    if (kInf > 0) {
      s.put(xEnd, yb, 0x252c, P.soft);
      label(s, xEnd - 1, yb + 1, '∞', P.soft, kInf);
      const iw = clamp(Math.round(c.w * 0.2), 10, 22), ih = Math.max(3, Math.round(iw / 3));
      const bi = braille('inf', iw, ih);
      const rx = bi.pw / 2 - 2, ry = bi.ph / 2 - 1;
      const col = mix(P.bg, hitAge >= 0 ? P.dim : P.mute, kInf);
      let lx = null, ly = null;
      const nSeg = 120;
      for (let i = 0; i <= nSeg * kInf; i++) {
        const a = (i / nSeg) * TAU, den = 1 + Math.sin(a) ** 2;
        const x = bi.pw / 2 + (rx * Math.cos(a)) / den * 1.0, y = bi.ph / 2 + (ry * Math.sin(a) * Math.cos(a)) / den * 2.2;
        if (lx !== null) bi.line(lx, ly, x, y, col, 1);
        lx = x; ly = y;
      }
      bi.blit(s, xEnd - iw + 1, yb - 2 - ih);
    }
    // her output: a bar of 我可以, racing right
    const rows = clamp(Math.round(c.h * 0.19), 3, 8);
    const yBar = yb - 3 - rows;
    const ub = prog(t, tRace, tHit);
    const xFront = hitAge >= 0 ? xWall - 1 : Math.round(xr0 + ox + (xWall - 1 - xr0 - ox) * Math.pow(ub, 1.8));
    const width = xFront - (xr0 + ox);
    const kBar = prog(lt, 0.05, 0.3);
    if (t < tRace) {
      if (blink(t) && kBar > 0) s.put(xr0 + ox, yBar + rows - 1, CUR, P.clay);
    } else {
      for (let r = 0; r < rows; r++) {
        const off = (r * 2) % 6;
        for (let x = 0; x + 1 < width; x += 2) {
          const ch = CJK[((x + off) / 2 | 0) % 3];
          const kb = clamp(1 - (width - x) / 10);
          const col = mix(mix(P.clayLo, P.clayDeep, 0.35), mix(P.clay, P.clayHi, kb), 0.25 + 0.75 * kb);
          s.text(xr0 + ox + x, yBar + r, ch, col);
        }
      }
      if (hitAge < 0) s.put(xFront + 1, yBar + rows - 1, CUR, P.clayHi);
    }
    // the counter, in big type: it races with the bar and turns red at the wall
    const tokens = hitAge >= 0 ? WALL : Math.round(WALL * Math.pow(ub, 1.8));
    const bigPh = 12, cTop = c.y + 2;
    if (t >= tRace - 0.2) {
      const kk = prog(t, tRace - 0.2, tRace + 0.1);
      const fl = hitAge >= 0 ? Math.exp(-hitAge * 6) : 0;
      const colr = hitAge >= 0 ? mix(P.err, P.white, fl * 0.65) : mix(P.dim, P.soft, ub);
      if (c.h >= 32) {
        c.fonts.mono.draw(s, xr0 + ox, cTop + 1, commas(tokens), bigPh, colr, { alpha: kk });
        label(s, xr0 + ox, cTop, 'output tokens', hitAge >= 0 ? mix(P.dim, P.err, 0.6) : P.dim, kk);
      } else {
        label(s, xr0 + ox, yBar - 2, 'output', P.dim, kk);
        s.text(xr0 + ox + 8, yBar - 2, `${commas(tokens)} tokens`, hitAge >= 0 ? P.err : P.text, KEEP, BOLD);
      }
    }
    // the wall: a ghost from the start of the race, solid on "limitations"
    const yw0 = yBar - 3, yw1 = yb + 1;
    if (t >= tRace - 0.1) {
      const solid = hitAge >= 0;
      const fl = solid ? Math.exp(-hitAge * 6) : 0;
      const beatK = solid ? c.pulse(6) * 0.25 : 0;
      for (let y = yw0; y <= yw1; y++) {
        if (solid) {
          s.text(xWall, y, '██', mix(P.err, P.white, Math.min(1, fl * 0.7 + beatK)));
          const g = clamp(1 - hitAge / 0.7);
          if (g > 0) {
            s.put(xWall - 1, y, 0x2592, mix(P.bg, P.err, 0.55 * g)); s.put(xWall - 2, y, 0x2591, mix(P.bg, P.err, 0.5 * g));
            s.put(xWall + 2, y, 0x2592, mix(P.bg, P.err, 0.55 * g)); s.put(xWall + 3, y, 0x2591, mix(P.bg, P.err, 0.5 * g));
          }
        } else if ((y + Math.floor(t * 4)) % 2 === 0) {
          s.text(xWall, y, '┃', dimTo(P.err, 0.4 + 0.4 * ub * ub));
        }
      }
      if (solid) {
        const lab = '32000 output token maximum';
        const kl = prog(hitAge, 0, 0.3);
        const lx = clamp(xWall - Math.floor(strWidth(lab) / 2), c.x + 1, c.x + c.w - 1 - strWidth(lab));
        s.text(lx, yw0 - 1, part(lab, kl), P.err, KEEP, BOLD);
      }
    }
    // the context window under the ruler
    const kB = prog(lt, 0.8, 1.1);
    if (kB > 0) {
      const xa = pos(0), xb = pos(2e5);
      s.text(xa, yb + 3, '└' + '─'.repeat(Math.max(0, xb - xa - 1)) + '┘', dimTo(rulerCol, kB));
      const lab = 'context window';
      label(s, xa + Math.floor((xb - xa - strWidth(lab)) / 2), yb + 4, lab, P.dim, kB);
    }
    // debris from the impact
    if (hitAge >= 0 && hitAge < 0.7) {
      for (let i = 0; i < 14; i++) {
        const h1 = hash(i, 1, 77), h2 = hash(i, 2, 77), h3 = hash(i, 3, 77);
        const x = xWall - 1 - (4 + 14 * h1) * hitAge;
        const y = yBar + 1 + h2 * (rows - 1) + (-5 - 6 * h3) * hitAge + 30 * hitAge * hitAge;
        const k = 1 - hitAge / 0.7;
        s.text(Math.round(x), Math.round(y), CJK[i % 3], mix(P.bg, P.clay, 0.8 * k));
      }
    }
    // beyond the wall the ruler dims: that part is out of reach
    if (hitAge >= 0) for (let x = xWall + 2; x < xEnd; x++) s.put(x, yb, 0x2500, mix(rulerCol, P.bg, 0.5));
  });
}

// =================================================================== the whole segment: twelve shots, tiling W(1,0) .. W(17,0)

export function register(film) {
  const W = (id, k) => film.W(id, k);
  const T = [W(1, 0), W(2, 0), W(3, 0), W(4, 0), W(5, 0), W(6, 0), W(7, 0), film.beatTime(35), W(9, 0), W(11, 0), W(13, 0), W(15, 0), W(17, 0)];
  settingsShot(film, T[0], T[1]);
  treeShot(film, T[1], T[2]);
  objectsShot(film, T[2], T[3]);
  weightsShot(film, T[3], T[4]);
  initShot(film, T[4], T[5]);
  globeShots(film, T[5], T[6], T[7]);
  trainShot(film, T[7], T[8]);
  embeddingShots(film, T[8], T[9], T[10]);
  waveShots(film, T[10], T[11], T[12]);
}
