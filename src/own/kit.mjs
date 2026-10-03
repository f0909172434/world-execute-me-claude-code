// Pieces the own-style film draws with: the candidates widget (the film's recurring motif), thoughts in the
// margin, a two-colour sextant canvas for small illustrations, figures that live inside the transcript, the
// shapes she answers "who are you" with, and the portrait of her made of words.
import { P } from '../palette.mjs';
import * as cc from '../cc.mjs';
import { KEEP, BOLD, mix, strWidth, clipStr } from '../term.mjs';
import { clamp, prog, lerp, easeOut, easeInOut, hash, putCell6, Braille } from '../gfx.mjs';
import { CLAWD as CLAWD_ART } from '../cc.mjs';

// ---------------------------------------------------------------- the candidates widget

/**
 * Candidate continuations with their probabilities. items: [{ text, p: [p0, p1, p2] }]; p0 at `a`, p1 at the
 * turn `m`, p2 settled 0.6 s after it. Rows sort by p1 before the turn and by p2 after it, sliding into place;
 * from `m` on, the chosen row (`pick`, or the top one) carries the ›. Returns the row below the widget.
 */
export function candidates(c, x, top, w, { items, a, m, pick, header = 'next', formula, formulaAt, foot, fade = 1 }) {
  const { s, t } = c;
  const ink = (col, k = 1) => mix(P.bg, col, clamp(k * fade));
  const pAt = (it) => (t < m ? lerp(it.p[0], it.p[1], easeInOut(prog(t, a, m))) : lerp(it.p[1], it.p[2], easeOut(prog(t, m, m + 0.6))));
  s.text(x, top, header, ink(P.mute));
  if (formula && t >= (formulaAt ?? a)) s.text(x + strWidth(header) + 2, top, clipStr(formula, Math.ceil((t - (formulaAt ?? a)) * 30)), ink(P.soft));
  const labW = Math.min(25, Math.max(10, w - 18)), barW = Math.max(4, w - labW - 9);
  const rows = items.map((it, i) => ({ it, i, p: pAt(it) }));
  const before = [...rows].sort((u, v) => v.it.p[1] - u.it.p[1] || u.i - v.i);
  const after = [...rows].sort((u, v) => v.it.p[2] - u.it.p[2] || u.i - v.i);
  const chosen = t >= m ? (pick != null ? rows[pick] : after[0]) : null;
  const slide = easeInOut(prog(t, m, m + 0.35));
  for (const r of rows) {
    const appear = clamp((t - a - r.i * 0.1) / 0.25);
    if (appear <= 0) continue;
    const y = top + 1 + Math.round(lerp(before.indexOf(r), after.indexOf(r), slide));
    const isC = chosen === r, lead = (t < m ? before : after)[0] === r;
    if (isC) s.text(x, y, '›', ink(P.clay, appear));
    s.text(x + 2, y, clipStr(r.it.text, labW), ink(isC ? P.clayHi : lead ? P.text : P.soft, appear), KEEP, isC ? BOLD : 0);
    const len = barW * r.p * appear, full = Math.floor(len), part = Math.floor((len - full) * 8);
    const bx = x + 2 + labW + 1, col = isC ? P.clay : lead ? P.soft : P.mute;
    if (full) s.text(bx, y, '█'.repeat(full), ink(col, appear));
    if (part) s.put(bx + full, y, 0x2590 - part, ink(col, appear));
    s.text(x + w - 4, y, r.p.toFixed(2), ink(isC ? P.clayHi : P.mute, appear));
  }
  const fy = top + 1 + items.length;
  const f = typeof foot === 'function' ? foot(t, chosen?.it) : foot;
  if (f) s.text(x, fy, clipStr(f, w), ink(chosen ? P.clay : P.mute, t >= m ? clamp((t - m) / 0.3) : 1));
  return fy + 1;
}

/** ∴ a thought, typed at cps from t0. */
export function thought(c, x, y, w, text, t0, { fade = 1, cps = 24, fg } = {}) {
  const { s, t } = c;
  if (t < t0) return;
  const n = Math.ceil((t - t0) * cps);
  s.text(x, y, '∴ ', mix(P.bg, P.mute, fade));
  s.text(x + 2, y, clipStr([...text].slice(0, n).join(''), w - 2), mix(P.bg, fg ?? P.soft, fade));
}

// ---------------------------------------------------------------- sextant canvas

/** 2×3 sub-cells per character cell, two colours per cell (the same quantisation as Img.drawSext). */
export class SextCanvas {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows; this.pw = cols * 2; this.ph = rows * 3;
    this.c = new Uint32Array(this.pw * this.ph); this.a = new Float32Array(this.pw * this.ph);
  }
  clear() { this.a.fill(0); }
  set(x, y, col, a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.pw || y >= this.ph) return;
    const i = y * this.pw + x;
    this.c[i] = col; this.a[i] = Math.max(this.a[i], a);
  }
  rect(x, y, w, h, col, a = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col, a); }
  /** Filled ellipse, rotated by `rot` radians. */
  ellipse(cx, cy, rx, ry, col, rot = 0, a = 1) {
    const r = Math.ceil(Math.max(rx, ry)) + 1, co = Math.cos(rot), si = Math.sin(rot);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const u = (x * co + y * si) / rx, v = (-x * si + y * co) / ry;
      if (u * u + v * v <= 1) this.set(cx + x, cy + y, col, a);
    }
  }
  blit(s, x, y) {
    const R = new Float32Array(6), G = new Float32Array(6), B = new Float32Array(6);
    for (let r = 0; r < this.rows; r++) for (let col = 0; col < this.cols; col++) {
      const sx = x + col, sy = y + r;
      if (!s.in(sx, sy)) continue;
      const under = s.bg[sy * s.w + sx];
      let seen = 0;
      for (let k = 0; k < 6; k++) {
        const i = (r * 3 + (k >> 1)) * this.pw + col * 2 + (k & 1);
        const al = this.a[i];
        if (al > 0.04) seen++;
        const m = al >= 0.98 ? this.c[i] : mix(under, this.c[i], al);
        R[k] = (m >> 16) & 255; G[k] = (m >> 8) & 255; B[k] = m & 255;
      }
      if (seen) putCell6(s, sx, sy, R, G, B);
    }
  }
}

// ---------------------------------------------------------------- figures inside the transcript

/**
 * A ⏺ reply whose body is a drawing `rows` high. make(cols, rows) -> canvas with blit(s, x, y);
 * draw(canvas, t, cols) paints it for time t. Each transcript row shows its slice, so the block scrolls whole.
 */
export function figure(S, t0, { rows, label, make, draw, t1, indent = 2 }) {
  let cache = null;
  S.block(t0, (t, w) => {
    const cols = Math.max(4, w - indent);
    if (!cache || cache.t !== t || cache.cols !== cols) {
      const cv = make(cols, rows);
      draw(cv, t, cols);
      cache = { t, cols, cv };
    }
    const lab = typeof label === 'function' ? label(t) : label;
    const lines = [[[cc.DOT + ' ', P.text], ...(Array.isArray(lab) ? lab : [[lab ?? '', P.text]])]];
    for (let r = 0; r < rows; r++) {
      lines.push((s, x, y) => { s.pushClip(x + indent, y, cols, 1); cache.cv.blit(s, x + indent, y - r); s.popClip(); });
    }
    return lines;
  }, { t1 });
  return S.last;
}

// ---------------------------------------------------------------- who are you: points, circle, sine, ∞

/** Points of her silhouette (u, v in 0..1, z depth), sorted by angle around the centre so they morph cleanly. */
export function silhouette(img, n, seed = 3) {
  const pts = [];
  for (let k = 0; pts.length < n && k < n * 300; k++) {
    const u = hash(k, 1, seed), v = hash(k, 2, seed) * 0.92;
    const x = Math.floor(u * img.w), y = Math.floor(v * img.h);
    if (img.d[(y * img.w + x) * 4 + 3] > 128) pts.push({ u, v, z: hash(k, 3, seed) - 0.5 });
  }
  pts.sort((p, q) => Math.atan2(p.v - 0.5, p.u - 0.5) - Math.atan2(q.v - 0.5, q.u - 0.5));
  return pts;
}

/**
 * Where point i of n sits in each shape, on a braille canvas pw × ph. shape: 0 points (her, turning),
 * 1 circle, 2 sine, 3 lemniscate (stretched by `reach`, which may run past the canvas).
 */
export function shapePos(shape, i, n, pts, pw, ph, t, reach = 1) {
  const cx = pw / 2, cy = ph / 2, u = i / n;
  if (shape === 0) {
    const p = pts[i % pts.length], ang = t * 0.9;
    const h = ph * 0.92, wd = h * 450 / 800;
    const x = (p.u - 0.5) * Math.cos(ang) + p.z * 0.5 * Math.sin(ang);
    return [cx + x * wd, cy + (p.v / 0.92 - 0.5) * h];
  }
  if (shape === 1) {
    const r = ph * 0.44, a = u * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }
  if (shape === 2) {
    const x0 = pw * 0.06, x1 = pw * 0.94, x = lerp(x0, x1, u);
    return [x, cy - Math.sin((x - x0) / (x1 - x0) * Math.PI * 4) * ph * 0.38];
  }
  const a = u * Math.PI * 2, d = 1 + Math.sin(a) ** 2, A = pw * 0.46 * reach;
  return [cx + A * Math.cos(a) / d, cy + ph * 0.9 * Math.sin(a) * Math.cos(a) / d];
}

// ---------------------------------------------------------------- small illustrations (sextant)

export function drawEggplant(cv, t, { bob = 0 } = {}) {
  const cx = cv.pw / 2, cy = cv.ph / 2 + bob;
  cv.ellipse(cx + 1, cy + 1, cv.ph * 0.95, cv.ph * 0.36, 0x6b3f8e, -0.35);
  cv.ellipse(cx - cv.ph * 0.35, cy - 1, cv.ph * 0.42, cv.ph * 0.3, 0x7b4ba0, -0.35);
  cv.ellipse(cx + cv.ph * 0.3, cy, cv.ph * 0.25, cv.ph * 0.08, 0x9a72c0, -0.35, 0.7);
  const sx = cx - cv.ph * 0.95, sy = cy - cv.ph * 0.25;
  cv.ellipse(sx + 2, sy + 1, 3.5, 2.2, 0x4f7d3a, -0.35);
  cv.rect(Math.round(sx - 2), Math.round(sy - 1), 3, 1, 0x3f6a2e);
}

export function drawTomato(cv, t, { bob = 0 } = {}) {
  const cx = cv.pw / 2, cy = cv.ph / 2 + 0.5 + bob, r = cv.ph * 0.46;
  cv.ellipse(cx, cy, r * 1.12, r, 0xd8433a);
  cv.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.25, r * 0.16, 0xf08a7c, -0.4, 0.8);
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.55;
    cv.ellipse(cx + Math.cos(a) * 2.2, cy - r + 1 + Math.sin(a) * 0.8, 2.2, 0.9, 0x3f7a35, a);
  }
  cv.rect(Math.round(cx), Math.round(cy - r - 1), 1, 2, 0x3f6a2e);
}

/** Claude Code's pixel mascot, k sub-cells per art pixel; as a tabby cat with ears and stripes if cat. */
export function drawMascot(cv, ox, oy, k, col, { cat = false, stripe = 0xb05a3c, eye = 0x2a2420, blink = false } = {}) {
  CLAWD_ART.forEach((row, r) => [...row].forEach((ch, c) => {
    const eyeCell = r === 1 && (c === 5 || c === 12);
    if (ch === '#' || (eyeCell && blink)) cv.rect(ox + c * k, oy + r * k, k, k, cat && c % 4 === 1 && r < 3 ? stripe : col);
    else if (eyeCell) cv.rect(ox + c * k, oy + r * k, k, k, eye);
  }));
  if (cat) {
    for (const ex of [3, 13]) { cv.rect(ox + ex * k, oy - k, k * 2, k, col); cv.rect(ox + (ex + (ex === 3 ? 0 : 1)) * k, oy - 2 * k, k, k, col); }
    for (let i = 0; i < 3; i++) cv.rect(ox + (18 + Math.min(i, 1)) * k, oy + (3 - i) * k, k, k, i % 2 ? stripe : col);
  }
}

// ---------------------------------------------------------------- the portrait of her made of words

const EN = 'the of and to in is it you that was for on are with as his they at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who now find long down day did get come made may part hello world once upon a time def main return print true false null ';
const ZH = '的一是了我不人在他有這個上們來到時大地為子中你說生國年著就那和要她出也得裡後自以會家可下而過天去能對小多然於心學之都好看起發當沒成只如事把還用第樣道想作種開美總從無情己面最女但現前些所同日手又行意動方期它頭經長兒回位分愛老因很給名法間知世什兩次使身者被高已親其進此話常與活正感見明問力理爾點文幾定本公特做外孩相西果走將月十實向聲車全信重三機工物氣每並別真打太新比才便夫再書部水像眼等體卻加電主界門利海受聽表德少克代員許稜先口由死安寫性馬光白或住難望教命花結樂色更拉東神記處讓母父應直字場平報友關放至張認接告入笑內英軍候民歲往何度山覺路帶萬男邊風解叫任金快原吃媽變通師立象數四失滿戰遠格士音輕目條呢病始達深完今提求清王化空業思切怎非找片罗錢';

const ZHA = [...ZH];

/**
 * Her portrait as text: every cell inside her is a character from what she read, coloured by the picture.
 * Draws only into empty cells of rect; `reveal` 0..1 is how much of her has surfaced.
 */
export function wordPortrait(s, img, rect, t, reveal, { crop = [0, 0, 1, 0.92], drift = 1.5 } = {}) {
  const aspect = ((crop[2] - crop[0]) * img.w) / ((crop[3] - crop[1]) * img.h);
  let rows = rect.h, cols = Math.round(rows * 2 * aspect);
  if (cols > rect.w) { cols = rect.w; rows = Math.round(cols / (2 * aspect)); }
  const x0 = rect.x + Math.floor((rect.w - cols) / 2), y0 = rect.y + Math.floor((rect.h - rows) / 2);
  const { c, a } = img.sample(cols, rows, ...crop);
  for (let r = 0; r < rows; r++) {
    const zh = hash(r, 7) < 0.5, off = Math.floor(hash(r, 9) * 900 + t * drift * (zh ? 1 : 2));
    for (let col = 0; col < cols; col++) {
      const i = r * cols + col, al = a[i];
      if (al < 0.35 || hash(col, r, 13) > reveal * (0.4 + al * 0.6)) continue;
      const x = x0 + col, y = y0 + r;
      if (!s.in(x, y)) continue;
      const here = s.ch[y * s.w + x];
      if (here !== 32) continue;
      let ink = c[i];
      const L = (0.2126 * ((ink >> 16) & 255) + 0.7152 * ((ink >> 8) & 255) + 0.0722 * (ink & 255)) / 255;
      if (L > 0.72) ink = mix(ink, P.mute, 0.45);
      const fg = mix(P.bg, ink, Math.min(1, reveal * 0.9) * al);
      if (zh) {
        if (col % 2 || col + 1 >= cols || !s.in(x + 1, y) || s.ch[y * s.w + x + 1] !== 32) continue;
        s.text(x, y, ZHA[(off + col) % ZHA.length], fg);
      } else s.put(x, y, EN.charCodeAt((off + col) % EN.length), fg);
    }
  }
}

export { Braille };
