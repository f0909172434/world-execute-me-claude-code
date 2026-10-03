// Drawing on a Screen: easing, noise, boxes, braille and half-block canvases, images, big text.
import { KEEP, mix, scale, strWidth, wcwidth, mapChar } from './term.mjs';

// ---------------------------------------------------------------- numbers

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0..1 progress of t through [a, b]. */
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
export const easeOutElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
/** 1 inside [a, b], ramping over `f` seconds at both ends. */
export const window01 = (t, a, b, f = 0.15) => Math.min(prog(t, a, a + f), 1 - prog(t, b - f, b));

// ---------------------------------------------------------------- noise

export function hash(x, y = 0, s = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, s = 0, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * noise2(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; }
  return v / (1 - 0.5 ** oct);
}
/** Deterministic PRNG. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- text & boxes

export const BOX = {
  round:  { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  heavy:  { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  dashed: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '╌', v: '╎' },
};

export function box(s, x, y, w, h, fg, { style = 'round', bg = KEEP, fillBg = KEEP, title, titleFg, titleX = 2 } = {}) {
  if (w < 2 || h < 2) return;
  const b = BOX[style];
  if (fillBg >= 0) s.fill(x + 1, y + 1, w - 2, h - 2, 32, fg, fillBg);
  s.text(x, y, b.tl + b.h.repeat(w - 2) + b.tr, fg, bg);
  for (let i = 1; i < h - 1; i++) { s.text(x, y + i, b.v, fg, bg); s.text(x + w - 1, y + i, b.v, fg, bg); }
  s.text(x, y + h - 1, b.bl + b.h.repeat(w - 2) + b.br, fg, bg);
  if (title) s.text(x + titleX, y, title, titleFg ?? fg, bg);
}

/** Corner brackets only (the film's pane frames). */
export function corners(s, x, y, w, h, fg, len = 2) {
  s.text(x, y, '╭' + '─'.repeat(len - 1), fg);
  s.text(x + w - len, y, '─'.repeat(len - 1) + '╮', fg);
  s.text(x, y + h - 1, '╰' + '─'.repeat(len - 1), fg);
  s.text(x + w - len, y + h - 1, '─'.repeat(len - 1) + '╯', fg);
}

export function hline(s, x, y, w, fg, ch = '─', bg = KEEP) { if (w > 0) s.text(x, y, ch.repeat(w), fg, bg); }
export function vline(s, x, y, h, fg, ch = '│', bg = KEEP) { for (let i = 0; i < h; i++) s.text(x, y + i, ch, fg, bg); }

export function center(s, cx, y, str, fg, bg = KEEP, at = 0) {
  const w = strWidth(str);
  return s.text(Math.round(cx - w / 2), y, str, fg, bg, at);
}

/** Text whose characters take a colour each from fn(i, ch). */
export function textFn(s, x, y, str, fn, bg = KEEP, at = 0) {
  let i = 0;
  for (const ch of str) {
    const c = fn(i, ch);
    x = s.text(x, y, ch, c, bg, at);
    i++;
  }
  return x;
}

/** Claude Code's spinner shimmer: a bright band sweeping across the text. */
export function shimmer(s, x, y, str, base, hi, t, { speed = 14, width = 3, at = 0, bg = KEEP } = {}) {
  const n = [...str].length;
  const pos = ((t * speed) % (n + width * 4)) - width * 2;
  return textFn(s, x, y, str, (i) => mix(base, hi, clamp(1 - Math.abs(i - pos) / width)), bg, at);
}

// ---------------------------------------------------------------- braille canvas

const BRAILLE_BIT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

/** 2x4 dots per cell. Each cell keeps the colour of its brightest dot. */
export class Braille {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows; this.pw = cols * 2; this.ph = rows * 4;
    this.bits = new Uint8Array(cols * rows);
    this.col = new Uint32Array(cols * rows);
    this.pri = new Float32Array(cols * rows);
  }
  clear() { this.bits.fill(0); this.pri.fill(0); }
  dot(px, py, color, pri = 1) {
    px = Math.round(px); py = Math.round(py);
    if (px < 0 || py < 0 || px >= this.pw || py >= this.ph) return;
    const i = (py >> 2) * this.cols + (px >> 1);
    this.bits[i] |= BRAILLE_BIT[py & 3][px & 1];
    if (pri >= this.pri[i]) { this.pri[i] = pri; this.col[i] = color; }
  }
  line(x0, y0, x1, y1, color, pri = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) this.dot(lerp(x0, x1, k / n), lerp(y0, y1, k / n), color, pri);
  }
  /** Dashed or partial lines: fn(k/n) -> colour or -1 to skip. */
  lineFn(x0, y0, x1, y1, fn) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) { const c = fn(k / n); if (c >= 0) this.dot(lerp(x0, x1, k / n), lerp(y0, y1, k / n), c); }
  }
  ellipse(cx, cy, rx, ry, color, a0 = 0, a1 = Math.PI * 2, pri = 1) {
    const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) * 1.2));
    for (let k = 0; k <= n; k++) {
      const a = lerp(a0, a1, k / n);
      this.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, color, pri);
    }
  }
  circle(cx, cy, r, color, a0, a1, pri) { this.ellipse(cx, cy, r, r, color, a0, a1, pri); }
  blit(s, x, y, bg = KEEP, at = 0) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (this.bits[i]) s.put(x + c, y + r, 0x2800 + this.bits[i], this.col[i], bg, at);
      }
    }
  }
}

// ---------------------------------------------------------------- half-block canvas

/** 1x2 square pixels per cell, RGB plus coverage. Transparent pixels leave the screen as it is. */
export class Pixels {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows; this.pw = cols; this.ph = rows * 2;
    this.c = new Uint32Array(this.pw * this.ph);
    this.a = new Float32Array(this.pw * this.ph);
  }
  clear() { this.a.fill(0); }
  set(px, py, color, a = 1) {
    px |= 0; py |= 0;
    if (px < 0 || py < 0 || px >= this.pw || py >= this.ph) return;
    const i = py * this.pw + px;
    if (a >= 1 || this.a[i] === 0) { this.c[i] = color; this.a[i] = Math.max(this.a[i], a); }
    else { this.c[i] = mix(this.c[i], color, a); this.a[i] = Math.min(1, this.a[i] + a); }
  }
  rect(px, py, w, h, color, a = 1) {
    for (let y = py; y < py + h; y++) for (let x = px; x < px + w; x++) this.set(x, y, color, a);
  }
  disc(cx, cy, r, color, a = 1) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, color, a);
  }
  blit(s, x, y) {
    const { pw, c, a } = this;
    for (let r = 0; r < this.rows; r++) {
      const sy = y + r;
      for (let col = 0; col < this.cols; col++) {
        const sx = x + col;
        if (!s.in(sx, sy)) continue;
        const it = (2 * r) * pw + col, ib = it + pw;
        const at = a[it], ab = a[ib];
        if (at <= 0.02 && ab <= 0.02) continue;
        const under = s.bg[sy * s.w + sx];
        const ct = at >= 1 ? c[it] : mix(under, c[it], at);
        const cb = ab >= 1 ? c[ib] : mix(under, c[ib], ab);
        if (ct === cb) s.put(sx, sy, 0x2588, ct, under);
        else s.put(sx, sy, 0x2580, ct, cb);
      }
    }
  }
}

// ---------------------------------------------------------------- images

/** RGBA image with area-averaged resampling into half-block pixels. */
export class Img {
  constructor(w, h, data) { this.w = w; this.h = h; this.d = data; this.cache = new Map(); }

  /**
   * Resample the crop [u0, v0, u1, v1] (fractions of the image) to pw x ph pixels.
   * Returns { pw, ph, c: Uint32Array, a: Float32Array }; cached per arguments.
   */
  sample(pw, ph, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const key = `${pw}x${ph}:${u0.toFixed(4)},${v0.toFixed(4)},${u1.toFixed(4)},${v1.toFixed(4)}`;
    let r = this.cache.get(key);
    if (r) return r;
    const { w, h, d } = this;
    const c = new Uint32Array(pw * ph), a = new Float32Array(pw * ph);
    const sx0 = u0 * w, sy0 = v0 * h, sw = (u1 - u0) * w / pw, sh = (v1 - v0) * h / ph;
    for (let py = 0; py < ph; py++) {
      const ya = sy0 + py * sh, yb = ya + sh;
      for (let px = 0; px < pw; px++) {
        const xa = sx0 + px * sw, xb = xa + sw;
        let rr = 0, gg = 0, bb = 0, aa = 0, n = 0;
        const ix0 = Math.floor(xa), ix1 = Math.max(ix0 + 1, Math.ceil(xb));
        const iy0 = Math.floor(ya), iy1 = Math.max(iy0 + 1, Math.ceil(yb));
        for (let iy = iy0; iy < iy1; iy++) {
          if (iy < 0 || iy >= h) { n += ix1 - ix0; continue; }
          for (let ix = ix0; ix < ix1; ix++) {
            n++;
            if (ix < 0 || ix >= w) continue;
            const o = (iy * w + ix) * 4, al = d[o + 3] / 255;
            rr += d[o] * al; gg += d[o + 1] * al; bb += d[o + 2] * al; aa += al;
          }
        }
        const i = py * pw + px;
        if (aa > 0) c[i] = ((rr / aa) << 16) | ((gg / aa) << 8) | (bb / aa);
        a[i] = n ? aa / n : 0;
      }
    }
    r = { pw, ph, c, a };
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, r);
    return r;
  }

  /**
   * Draw the crop into a cols x rows cell area at (x, y) as half-blocks.
   * fx(px, py, color, alpha) -> [color, alpha] or null may restyle each pixel (pass undefined for none).
   */
  draw(s, x, y, cols, rows, opts = {}) {
    if (opts.cells === 'sext') return this.drawSext(s, x, y, cols, rows, opts);
    const { crop = [0, 0, 1, 1], alpha = 1, fx, tint, tintK = 0 } = opts;
    const smp = this.sample(cols, rows * 2, ...crop);
    const { c, a } = smp;
    for (let r = 0; r < rows; r++) {
      const sy = y + r;
      for (let col = 0; col < cols; col++) {
        const sx = x + col;
        if (!s.in(sx, sy)) continue;
        const it = 2 * r * cols + col, ib = it + cols;
        let ct = c[it], cb = c[ib], at = a[it] * alpha, ab = a[ib] * alpha;
        if (tintK > 0) { ct = mix(ct, tint, tintK); cb = mix(cb, tint, tintK); }
        if (fx) {
          const ft = fx(col, 2 * r, ct, at), fb = fx(col, 2 * r + 1, cb, ab);
          if (ft) { ct = ft[0]; at = ft[1]; }
          if (fb) { cb = fb[0]; ab = fb[1]; }
        }
        if (at <= 0.04 && ab <= 0.04) continue;
        const under = s.bg[sy * s.w + sx];
        const t2 = at >= 0.98 ? ct : mix(under, ct, at);
        const b2 = ab >= 0.98 ? cb : mix(under, cb, ab);
        if (t2 === b2) s.put(sx, sy, 0x2588, t2, under);
        else s.put(sx, sy, 0x2580, t2, b2);
      }
    }
  }

  /**
   * draw() in sextant cells: 2×3 samples per cell, split by brightness into two groups whose mean colours
   * become the cell's ink and paper. Sharper edges than half-blocks, at the cost of colour within a cell.
   */
  drawSext(s, x, y, cols, rows, { crop = [0, 0, 1, 1], alpha = 1, fx } = {}) {
    const { c, a } = this.sample(cols * 2, rows * 3, ...crop);
    const pw = cols * 2;
    const R = new Float32Array(6), G = new Float32Array(6), B = new Float32Array(6), L = new Float32Array(6);
    for (let r = 0; r < rows; r++) {
      const sy = y + r;
      for (let col = 0; col < cols; col++) {
        const sx = x + col;
        if (!s.in(sx, sy)) continue;
        const under = s.bg[sy * s.w + sx];
        let seen = 0, lo = 1, hi = 0, mean = 0;
        for (let k = 0; k < 6; k++) {
          const px = col * 2 + (k & 1), py = r * 3 + (k >> 1), i = py * pw + px;
          let cc = c[i], al = a[i] * alpha;
          if (fx) { const f = fx(px, py, cc, al); if (f) { cc = f[0]; al = f[1]; } }
          if (al > 0.04) seen++;
          const m = al >= 0.98 ? cc : mix(under, cc, Math.max(0, al));
          R[k] = (m >> 16) & 255; G[k] = (m >> 8) & 255; B[k] = m & 255;
          L[k] = (0.2126 * R[k] + 0.7152 * G[k] + 0.0722 * B[k]) / 255;
          lo = Math.min(lo, L[k]); hi = Math.max(hi, L[k]); mean += L[k] / 6;
        }
        if (!seen) continue;
        let mask = 0;
        if (hi - lo > 0.06) for (let k = 0; k < 6; k++) if (L[k] < mean) mask |= 1 << k;   // ink: the darker group
        const avg = (sel) => {
          let rr = 0, gg = 0, bb = 0, n = 0;
          for (let k = 0; k < 6; k++) if (sel(k)) { rr += R[k]; gg += G[k]; bb += B[k]; n++; }
          return n ? (Math.round(rr / n) << 16) | (Math.round(gg / n) << 8) | Math.round(bb / n) : under;
        };
        if (!mask) { s.put(sx, sy, 0x2588, avg(() => true), under); continue; }
        const ink = avg((k) => mask & (1 << k)), paper = avg((k) => !(mask & (1 << k)));
        s.put(sx, sy, sextantCp(mask), ink, paper);
      }
    }
  }
}

// ---------------------------------------------------------------- big text

/**
 * Glyph atlas baked from real fonts (assets/font.json): coverage bitmaps at a fixed master height.
 * draw() scales a string to `ph` half-block pixels high.
 */
// ---------------------------------------------------------------- mosaic cells for big type
// How big type is cut into character cells. 'half': ▀▄ halves, two independent colours (1×2 per cell).
// 'quad': quadrant blocks (2×2). 'sext': sextants from Symbols for Legacy Computing (2×3), the finest a
// terminal can draw solidly. quad and sext keep two colours per cell: the inked sub-cells take the mean
// coverage of the ink, the rest the mean of what is left, so edges still fade.
let MOSAIC = 'half';
export function setMosaic(m) { MOSAIC = m; }
export const mosaic = () => MOSAIC;
const SUB = { half: [1, 2], quad: [2, 2], sext: [2, 3] };
// quadrant mask (tl 1, tr 2, bl 4, br 8) -> code point
const QUAD_CP = [32, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588];
/** Sextant mask (bit k = sub-cell k, row-major from top-left) -> code point. */
export function sextantCp(m) {
  if (m === 0) return 32;
  if (m === 63) return 0x2588;
  if (m === 21) return 0x258c;
  if (m === 42) return 0x2590;
  return 0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0);
}

export class BigFont {
  constructor(atlas) {
    this.H = atlas.height;
    this.glyphs = new Map();
    for (const [ch, g] of Object.entries(atlas.glyphs)) {
      this.glyphs.set(ch, { w: g.w, data: Buffer.from(g.d, 'base64') });
    }
    this.cache = new Map();
  }
  /**
   * Coverage bitmap for a whole string at ph pixels high (cached). With sub = [sx, sy], the layout stays that
   * of the plain raster (one pixel per cell column) but every cell is sampled sx × sy times, ph/2·sy rows high.
   */
  raster(str, ph, track = 0, sub = null) {
    const key = `${str}|${ph}|${track}|${sub}`;
    let r = this.cache.get(key);
    if (r) return r;
    const k = ph / this.H;
    const [sx, sy] = sub ?? [1, 1];
    const parts = [];
    let pw = 0;
    for (const ch of str) {
      const g = this.glyphs.get(mapChar(ch)) ?? this.glyphs.get(ch) ?? this.glyphs.get('?');
      const gw = Math.max(1, Math.round(g.w * k)) * sx;
      parts.push([g, pw, gw]);
      pw += gw + track * sx;
    }
    pw = Math.max(1, pw - track * sx);
    if (sub) ph = Math.ceil(ph / 2) * sy;
    const cov = new Float32Array(pw * ph);
    for (const [g, ox, gw] of parts) {
      const sw = g.w / gw, sh = this.H / ph;
      for (let py = 0; py < ph; py++) {
        const ya = py * sh, yb = ya + sh;
        for (let px = 0; px < gw; px++) {
          const xa = px * sw, xb = xa + sw;
          let sum = 0, n = 0;
          for (let iy = Math.floor(ya); iy < Math.ceil(yb); iy++) {
            for (let ix = Math.floor(xa); ix < Math.ceil(xb); ix++) {
              if (ix >= g.w || iy >= this.H) continue;
              sum += g.data[iy * g.w + ix]; n++;
            }
          }
          const x = ox + px;
          if (x < pw) cov[py * pw + x] = n ? sum / n / 255 : 0;
        }
      }
    }
    r = { pw, ph, cov };
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, r);
    return r;
  }
  /** Width in cells (the same in every mosaic mode). */
  width(str, ph, track = 0) { return this.raster(str, ph, track).pw; }
  /**
   * Draw at cell (x, y) with height ph pixels (ph/2 rows). color: number or fn(px, py, cov) -> colour.
   * reveal: 0..1 fraction of columns shown (left to right).
   */
  draw(s, x, y, str, ph, color, opts = {}) {
    if (MOSAIC !== 'half') return this.drawMosaic(s, x, y, str, ph, color, opts);
    const { track = 0, alpha = 1, reveal = 1, gamma = 0.8 } = opts;
    const { pw, cov } = this.raster(str, ph, track);
    const rows = Math.ceil(ph / 2), shown = Math.round(pw * reveal);
    for (let r = 0; r < rows; r++) {
      const sy = y + r;
      for (let px = 0; px < shown; px++) {
        const sx = x + px;
        if (!s.in(sx, sy)) continue;
        const ct = cov[2 * r * pw + px] ?? 0;
        const cb = 2 * r + 1 < ph ? cov[(2 * r + 1) * pw + px] : 0;
        if (ct < 0.04 && cb < 0.04) continue;
        const under = s.bg[sy * s.w + sx];
        const fT = typeof color === 'function' ? color(px, 2 * r, ct) : color;
        const fB = typeof color === 'function' ? color(px, 2 * r + 1, cb) : color;
        const top = mix(under, fT, Math.min(1, ct ** gamma * alpha));
        const bot = mix(under, fB, Math.min(1, cb ** gamma * alpha));
        if (top === bot) s.put(sx, sy, 0x2588, top, under);
        else s.put(sx, sy, 0x2580, top, bot);
      }
    }
    return pw;
  }

  /** draw() in quadrant or sextant cells: the same footprint (pw cells × ph/2 rows), finer edges. */
  drawMosaic(s, x, y, str, ph, color, { track = 0, alpha = 1, reveal = 1, gamma = 0.8 } = {}) {
    const [sx, sy] = SUB[MOSAIC];
    const cells = this.raster(str, ph, track).pw, rows = Math.ceil(ph / 2);
    // sub-pixels are (cell w / sx) × (cell h / sy) with cells twice as tall as wide
    const { pw, cov } = this.raster(str, ph, track, SUB[MOSAIC]);
    const n = sx * sy, v = new Float32Array(n), shown = Math.round(cells * reveal);
    for (let r = 0; r < rows; r++) {
      const cy = y + r;
      for (let c = 0; c < shown; c++) {
        const cx = x + c;
        if (!s.in(cx, cy)) continue;
        let mx = 0, mn = 1;
        for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
          const px = c * sx + i, py = r * sy + j;
          const val = px < pw ? (cov[py * pw + px] ?? 0) : 0;
          v[j * sx + i] = val;
          if (val > mx) mx = val;
          if (val < mn) mn = val;
        }
        if (mx < 0.04) continue;
        const under = s.bg[cy * s.w + cx];
        const fc = typeof color === 'function' ? color(c, 2 * r, mx) : color;
        const thr = (mx + mn) / 2;
        let mask = 0, inkSum = 0, inkN = 0, offSum = 0;
        for (let k = 0; k < n; k++) {
          if (mx - mn > 0.12 && v[k] >= thr) { mask |= 1 << k; inkSum += v[k]; inkN++; } else offSum += v[k];
        }
        const ink = inkN ? inkSum / inkN : mx, off = inkN < n ? offSum / (n - inkN) : 0;
        if (!inkN) { mask = (1 << n) - 1; }
        const fg = mix(under, fc, Math.min(1, (inkN ? ink : (inkSum + offSum) / n) ** gamma * alpha));
        const bg = mix(under, fc, Math.min(1, off ** gamma * alpha));
        const cp = MOSAIC === 'quad' ? QUAD_CP[mask] : sextantCp(mask);
        s.put(cx, cy, cp === 32 ? 0x2588 : cp, fg, inkN && inkN < n ? bg : under);
      }
    }
    return cells;
  }
}

/** Largest even ph in [min, max] at which str fits in maxW columns; 0 when it does not fit even at min. */
export function fitPh(font, str, maxW, max = 16, min = 8) {
  for (let ph = max; ph >= min; ph -= 2) if (font.width(str, ph) <= maxW) return ph;
  return 0;
}

// ---------------------------------------------------------------- effects

/** Scramble glyphs: per-cell decode from random symbols to the final text. */
export const GLITCH = '01<>/\\|=+*#%&$?!:;{}[]~^░▒▓';
export function decodeChar(ch, p, seed) {
  if (p >= 1 || ch === ' ') return ch;
  if (p <= 0) return ' ';
  return GLITCH[Math.floor(hash(seed, Math.floor(p * 12)) * GLITCH.length)];
}

/** Horizontal glitch on a rect of the screen: shift rows, recolour some cells. */
export function glitch(s, x, y, w, h, amt, t, seed = 0) {
  if (amt <= 0) return;
  const tick = Math.floor(t * 30);
  for (let yy = y; yy < y + h; yy++) {
    if (hash(yy, tick, seed) > amt * 0.6) continue;
    const shift = Math.round((hash(yy, tick, seed + 1) - 0.5) * amt * 16);
    if (!shift) continue;
    const row = yy * s.w;
    const tmpC = s.ch.slice(row + x, row + x + w), tmpF = s.fg.slice(row + x, row + x + w);
    const tmpB = s.bg.slice(row + x, row + x + w), tmpA = s.at.slice(row + x, row + x + w);
    for (let i = 0; i < w; i++) {
      const j = (i - shift + w) % w;
      s.ch[row + x + i] = tmpC[j]; s.fg[row + x + i] = tmpF[j]; s.bg[row + x + i] = tmpB[j]; s.at[row + x + i] = tmpA[j];
    }
  }
}

export { mix, scale, strWidth, wcwidth };
