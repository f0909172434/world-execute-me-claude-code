// Drawing on a Screen: easing, noise, boxes, braille and half-block canvases, images, big text.
import { KEEP, INV, mix, scale, strWidth, wcwidth, mapChar } from './term.mjs';

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
const CRISP = 0.6;

export class Img {
  constructor(w, h, data) { this.w = w; this.h = h; this.d = data; this.cache = new Map(); }

  /**
   * Resample the crop [u0, v0, u1, v1] (fractions of the image) to pw x ph pixels.
   * Returns { pw, ph, c: Uint32Array, a: Float32Array }; cached per arguments.
   */
  sample(pw, ph, u0 = 0, v0 = 0, u1 = 1, v1 = 1, keep = true) {
    const key = `${pw}x${ph}:${u0.toFixed(4)},${v0.toFixed(4)},${u1.toFixed(4)},${v1.toFixed(4)}`;
    let r = keep && this.cache.get(key);
    if (r) return r;
    const { w, h, d } = this;
    // a moving camera (keep = false) samples into scratch buffers and at most 4×4 source pixels per pixel
    const c = keep ? new Uint32Array(pw * ph) : this.scratch('sc', Uint32Array, pw * ph);
    const a = keep ? new Float32Array(pw * ph) : this.scratch('sa', Float32Array, pw * ph);
    const sx0 = u0 * w, sy0 = v0 * h, sw = (u1 - u0) * w / pw, sh = (v1 - v0) * h / ph;
    const stx = keep ? 1 : Math.max(1, Math.floor(sw / 4)), sty = keep ? 1 : Math.max(1, Math.floor(sh / 4));
    for (let py = 0; py < ph; py++) {
      const ya = sy0 + py * sh, yb = ya + sh;
      for (let px = 0; px < pw; px++) {
        const xa = sx0 + px * sw, xb = xa + sw;
        let rr = 0, gg = 0, bb = 0, aa = 0, n = 0;
        const ix0 = Math.floor(xa), ix1 = Math.max(ix0 + 1, Math.ceil(xb));
        const iy0 = Math.floor(ya), iy1 = Math.max(iy0 + 1, Math.ceil(yb));
        for (let iy = iy0; iy < iy1; iy += sty) {
          if (iy < 0 || iy >= h) { n += Math.ceil((ix1 - ix0) / stx); continue; }
          for (let ix = ix0; ix < ix1; ix += stx) {
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
    if (!keep) return r;
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, r);
    return r;
  }

  /** A reusable buffer of at least n elements (for frames that are never drawn twice). */
  scratch(name, Type, n) {
    this.bufs ??= {};
    let b = this.bufs[name];
    if (!b || b.length < n) b = this.bufs[name] = new Type(n);
    return b.subarray(0, n);
  }

  /**
   * sample() followed by an unsharp mask on the colour: averaging ten source pixels into one softens the
   * line art (eyes, outlines, strands of hair); pushing each pixel away from its neighbours' mean restores it.
   */
  crisp(pw, ph, u0 = 0, v0 = 0, u1 = 1, v1 = 1, keep = true) {
    const key = `crisp:${pw}x${ph}:${u0.toFixed(4)},${v0.toFixed(4)},${u1.toFixed(4)},${v1.toFixed(4)}`;
    let r = keep && this.cache.get(key);
    if (r) return r;
    const { c, a } = this.sample(pw, ph, u0, v0, u1, v1, keep);
    const out = keep ? new Uint32Array(pw * ph) : this.scratch('cc', Uint32Array, pw * ph);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x;
        if (a[i] <= 0) continue;
        let r0 = 0, g0 = 0, b0 = 0, n = 0;
        for (let j = Math.max(0, y - 1); j <= Math.min(ph - 1, y + 1); j++) {
          for (let k = Math.max(0, x - 1); k <= Math.min(pw - 1, x + 1); k++) {
            const q = j * pw + k;
            if (a[q] <= 0.3) continue;
            r0 += (c[q] >> 16) & 255; g0 += (c[q] >> 8) & 255; b0 += c[q] & 255; n++;
          }
        }
        if (!n) { out[i] = c[i]; continue; }
        const f = (v, m) => Math.max(0, Math.min(255, Math.round(v + CRISP * (v - m / n))));
        out[i] = (f((c[i] >> 16) & 255, r0) << 16) | (f((c[i] >> 8) & 255, g0) << 8) | f(c[i] & 255, b0);
      }
    }
    r = { pw, ph, c: out, a };
    if (!keep) return r;
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, r);
    return r;
  }

  /**
   * Draw the crop into a cols x rows cell area at (x, y) as half-blocks.
   * fx(px, py, color, alpha) -> [color, alpha] or null may restyle each pixel (pass undefined for none).
   */
  draw(s, x, y, cols, rows, opts = {}) {
    if (opts.cells ? opts.cells === 'sext' : MOSAIC !== 'half') return this.drawSext(s, x, y, cols, rows, opts);
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
   * draw() in 2×3 samples per cell (sextants, or quadrants where the terminal has no sextants): each cell's
   * samples are split into the two groups of colour that lose the least, which become its ink and paper.
   * Lines a sample wide (eyes, strands of hair) survive that half-blocks would blur. fx gets half-block
   * coordinates, as in draw().
   */
  drawSext(s, x, y, cols, rows, { crop = [0, 0, 1, 1], alpha = 1, fx, tint, tintK = 0, cache = true } = {}) {
    const { c, a } = this.crisp(cols * 2, rows * 3, ...crop, cache);
    const pw = cols * 2;
    const R = S6R, G = S6G, B = S6B;
    for (let r = 0; r < rows; r++) {
      const sy = y + r;
      for (let col = 0; col < cols; col++) {
        const sx = x + col;
        if (!s.in(sx, sy)) continue;
        const under = s.bg[sy * s.w + sx];
        let seen = 0;
        for (let k = 0; k < 6; k++) {
          const px = col * 2 + (k & 1), py = r * 3 + (k >> 1), i = py * pw + px;
          let cc = c[i], al = a[i] * alpha;
          if (tintK > 0) cc = mix(cc, tint, tintK);
          if (fx) { const f = fx(col, Math.floor((py * 2) / 3), cc, al); if (f) { cc = f[0]; al = f[1]; } }
          if (al > 0.04) seen++;
          const m = al >= 0.98 ? cc : mix(under, cc, Math.max(0, Math.min(1, al)));
          R[k] = (m >> 16) & 255; G[k] = (m >> 8) & 255; B[k] = m & 255;
        }
        if (seen) putCell6(s, sx, sy, R, G, B);
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
// a sub-cell is inked from this much coverage on (sextant big type)
const INK = 0.42;
// quadrant mask (tl 1, tr 2, bl 4, br 8) -> code point
const QUAD_CP = [32, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588];
/**
 * One character cell from the six colours of its 2×3 sub-cells (row-major; R, G, B arrays of 6). In 'sext'
 * mode it becomes a sextant with two colours; terminals without sextants get quadrants or half-blocks made
 * from the same samples.
 */
export function putCell6(s, x, y, R, G, B) {
  if (MOSAIC === 'half') {
    // top: the top row and half the middle row; bottom: the bottom row and the other half
    const top = rgbOf((2 * (R[0] + R[1]) + R[2] + R[3]) / 6, (2 * (G[0] + G[1]) + G[2] + G[3]) / 6, (2 * (B[0] + B[1]) + B[2] + B[3]) / 6);
    const bot = rgbOf((2 * (R[4] + R[5]) + R[2] + R[3]) / 6, (2 * (G[4] + G[5]) + G[2] + G[3]) / 6, (2 * (B[4] + B[5]) + B[2] + B[3]) / 6);
    if (top === bot) s.put(x, y, 0x2588, top, top); else s.put(x, y, 0x2580, top, bot);
    return;
  }
  let n = 6;
  if (MOSAIC === 'quad') {
    // each quadrant takes its corner sample and half of the middle row
    n = 4;
    for (let q = 0; q < 4; q++) {
      const a = q < 2 ? q : q + 2, b = q < 2 ? q + 2 : q;
      CR[q] = (2 * R[a] + R[b]) / 3; CG[q] = (2 * G[a] + G[b]) / 3; CB[q] = (2 * B[a] + B[b]) / 3;
    }
  } else {
    for (let k = 0; k < 6; k++) { CR[k] = R[k]; CG[k] = G[k]; CB[k] = B[k]; }
  }
  // the split into two groups that keeps the most of the cell (least squared error to the group means);
  // the last sub-cell always stays in group 0, so every split is tried once
  let best = 0, bestScore = -1;
  for (let m = 0; m < 1 << (n - 1); m++) {
    let r1 = 0, g1 = 0, b1 = 0, n1 = 0, r0 = 0, g0 = 0, b0 = 0;
    for (let k = 0; k < n; k++) {
      if (m & (1 << k)) { r1 += CR[k]; g1 += CG[k]; b1 += CB[k]; n1++; } else { r0 += CR[k]; g0 += CG[k]; b0 += CB[k]; }
    }
    const n0 = n - n1;
    let score = (WR * r0 * r0 + WG * g0 * g0 + WB * b0 * b0) / n0;
    if (n1) score += (WR * r1 * r1 + WG * g1 * g1 + WB * b1 * b1) / n1;
    if (score > bestScore + 1e-6) { bestScore = score; best = m; }
  }
  let r1 = 0, g1 = 0, b1 = 0, n1 = 0, r0 = 0, g0 = 0, b0 = 0;
  for (let k = 0; k < n; k++) {
    if (best & (1 << k)) { r1 += CR[k]; g1 += CG[k]; b1 += CB[k]; n1++; } else { r0 += CR[k]; g0 += CG[k]; b0 += CB[k]; }
  }
  const bg = rgbOf(r0 / (n - n1), g0 / (n - n1), b0 / (n - n1));
  if (!best) { s.put(x, y, 0x2588, bg, bg); return; }
  s.put(x, y, MOSAIC === 'quad' ? QUAD_CP[best] : sextantCp(best), rgbOf(r1 / n1, g1 / n1, b1 / n1), bg);
}
const rgbOf = (r, g, b) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
const CR = new Float64Array(6), CG = new Float64Array(6), CB = new Float64Array(6);
const S6R = new Float32Array(6), S6G = new Float32Array(6), S6B = new Float32Array(6);
// colour distance weights: green counts most, blue least, roughly as the eye does
const WR = 0.9, WG = 1.2, WB = 0.6;

/**
 * Unsharp mask on a coverage bitmap: each pixel moves away from the mean of its 3×3 neighbourhood. A thin
 * stroke stands out from the paper around it and survives the threshold; a narrow gap between two stems (the
 * counters of m, w, 書) sinks below it instead of filling in.
 */
function sharpen(cov, w, h, k) {
  if (!k) return cov;
  const out = new Float32Array(cov.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) {
        for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) { sum += cov[j * w + i]; n++; }
      }
      const v = cov[y * w + x];
      out[y * w + x] = v + k * (v - sum / n);
    }
  }
  return out;
}

/**
 * Some terminals (macOS Terminal among them) draw block glyphs a little short of the top of the cell, so a
 * strip of each cell's background shows above them and stacked block art gets thin lines through it. Re-encode
 * the block cells so that the strip is the colour of the cell's top: a full block takes its own colour as
 * background, and a cell inked at its top left becomes the complementary glyph with the colours swapped.
 * Terminals without the strip draw exactly the same picture.
 */
export function closeLineGaps(s) {
  const n = s.w * s.h;
  for (let i = 0; i < n; i++) {
    const cp = s.ch[i];
    if (cp < 0x2580 || (cp > 0x259f && cp < 0x1fb00) || cp > 0x1fb3b || (s.at[i] & INV)) continue;
    if (cp === 0x2588) { s.bg[i] = s.fg[i]; continue; }
    let flip;
    if (cp >= 0x1fb00) {
      const m = sextantMask(cp);
      if (m & 1) flip = sextantCp(63 ^ m);
    } else {
      const q = QUAD_MASK.get(cp);
      if (q !== undefined && (q & 1)) flip = QUAD_CP[15 ^ q];
    }
    if (flip === undefined) continue;
    const f = s.fg[i];
    s.ch[i] = flip; s.fg[i] = s.bg[i]; s.bg[i] = f;
  }
}
const Q4 = new Float64Array(4);
const QUAD_MASK = new Map(QUAD_CP.map((cp, m) => [cp, m]));
/** Code point (U+1FB00..1FB3B) -> sextant mask. */
function sextantMask(cp) {
  const m = cp - 0x1fb00 + 1;
  return m + (m >= 21 ? 1 : 0) + (m + (m >= 21 ? 1 : 0) >= 42 ? 1 : 0);
}

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
    r = { pw, ph, cov: sub ? sharpen(cov, pw, ph, 0.6) : cov };
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
  drawMosaic(s, x, y, str, ph, color, { track = 0, alpha = 1, reveal = 1 } = {}) {
    const [sx, sy] = SUB[MOSAIC];
    const cells = this.raster(str, ph, track).pw, rows = Math.ceil(ph / 2);
    // sub-pixels are (cell w / sx) × (cell h / sy) with cells twice as tall as wide
    const { pw, cov } = this.raster(str, ph, track, SUB[MOSAIC]);
    const n = sx * sy, shown = Math.round(cells * reveal);
    for (let r = 0; r < rows; r++) {
      const cy = y + r;
      for (let c = 0; c < shown; c++) {
        const cx = x + c;
        if (!s.in(cx, cy)) continue;
        const under = s.bg[cy * s.w + cx];
        const fc = typeof color === 'function' ? color(c, 2 * r, 1) : color;
        if (MOSAIC === 'sext') {
          // every sub-cell is ink or paper: with two colours per cell, a fade at this size reads as a dim box
          let mask = 0;
          for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
            const px = c * sx + i, py = r * sy + j;
            if (px < pw && (cov[py * pw + px] ?? 0) >= INK) mask |= 1 << (j * sx + i);
          }
          if (!mask) continue;
          const fg = mix(under, fc, Math.min(1, alpha));
          if (mask === (1 << n) - 1) s.put(cx, cy, 0x2588, fg, under);
          else s.put(cx, cy, sextantCp(mask), fg, under);
          continue;
        }
        // quadrants are too coarse to say ink or paper: the cell keeps two shades, so a stroke thinner than a
        // quadrant (the bar of an E, a stroke of 界) still shows, dimmer, instead of vanishing or filling in
        for (let k = 0; k < 4; k++) {
          const px = c * 2 + (k & 1), py = r * 2 + (k >> 1);
          Q4[k] = px < pw ? clamp(cov[py * pw + px] ?? 0) : 0;
        }
        let best = 0, bestScore = -1;
        for (let m = 0; m < 8; m++) {                   // sub-cell 3 stays in group 0: each split once
          let s1 = 0, n1 = 0, s0 = 0;
          for (let k = 0; k < 4; k++) if (m & (1 << k)) { s1 += Q4[k]; n1++; } else s0 += Q4[k];
          const score = s0 * s0 / (4 - n1) + (n1 ? s1 * s1 / n1 : 0);
          if (score > bestScore + 1e-9) { bestScore = score; best = m; }
        }
        let s1 = 0, n1 = 0, s0 = 0;
        for (let k = 0; k < 4; k++) if (best & (1 << k)) { s1 += Q4[k]; n1++; } else s0 += Q4[k];
        let a1 = n1 ? s1 / n1 : 0, a0 = s0 / (4 - n1);
        // the lighter group is paper: faint spill there would read as a dim box, so it drops out
        if (a0 < 0.18) a0 = 0;
        if (a1 < 0.18) a1 = 0;
        if (a0 === 0 && a1 === 0) continue;
        const ink = (v) => mix(under, fc, Math.min(1, Math.min(1, v * 1.15) * alpha));
        if (!best || a1 === a0) { s.put(cx, cy, 0x2588, ink(Math.max(a0, a1)), under); continue; }
        s.put(cx, cy, QUAD_CP[best], ink(a1), a0 ? ink(a0) : under);
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
