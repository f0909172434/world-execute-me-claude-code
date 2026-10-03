// Right-pane shots of B1 (SFT), B2 (RLHF) and C (deployment): R-B1a … R-C8 in docs/SHOTS.md.
//
//   B1a  scope         B1b  [Image #1]    B1c  spinner       B1d  git log --since   B1e  git log --graph
//   B2a  samples       B2b  reward model  B2c  rl-step-NaN
//   C1   eggplant      C2   tomato        C3   your_cat.png  C4   ∃ (sun + proof)   C5   avatar
//   C6   a day in a minute                C7   POST /v1/messages                    C8   trance
//
// Every shot is a pure function of song time (seek-safe); geometry is built once per pane rect and cached
// (perSize), sprites are baked once per size, per-frame work is a few thousand cell writes. Boundaries and sync
// points all come from film.W(line, word). Where the left pane shows the same event (rating chips, the
// "sample k/12" flicker, the memory writes of a day, rl-step), the right pane lands on the same moment.
import { P, SYN } from '../palette.mjs';
import { BOLD, KEEP, mix, strWidth, clipStr, wrap } from '../term.mjs';
import {
  clamp, lerp, prog, smooth, easeOut, easeIn, easeInOut, easeOutBack, hash, noise2, fbm,
  Braille, Pixels, box, center,
} from '../gfx.mjs';
import { SPIN, clawdPixels, spinnerLine } from '../cc.mjs';
import { rlStep } from '../story.mjs';

const TAU = Math.PI * 2;

// ================================================================ helpers

/** Cache a geometry builder per pane rect. */
function perSize(build) {
  let key = '', val = null;
  return (c) => {
    const k = `${c.x},${c.y},${c.w},${c.h}`;
    if (k !== key) { key = k; val = build(c); }
    return val;
  };
}

/** Piecewise-linear colour gradient through `stops`, v in 0..1. */
function ramp(stops, v) {
  const n = stops.length - 1;
  v = clamp(v) * n;
  const i = Math.min(n - 1, Math.floor(v));
  return mix(stops[i], stops[i + 1], v - i);
}

/** Dim a colour towards the terminal background. */
const dimTo = (col, k) => mix(P.bg, col, clamp(k));

/** Warm (or cool) the pane's background; kFg also drags the glyph colours already there. The tint fades out over
 *  `soft` cells at the pane edges so no rectangle shows against the frame. */
function tint(s, c, color, kBg, kFg = 0, soft = 4) {
  if (kBg <= 0 && kFg <= 0) return;
  for (let y = c.y; y < c.y + c.h; y++) {
    const dy = Math.min(y - c.y, c.y + c.h - 1 - y) * 2;
    for (let x = c.x; x < c.x + c.w; x++) {
      const e = Math.min(Math.min(x - c.x, c.x + c.w - 1 - x), dy) / soft;
      const f = e >= 1 ? 1 : smooth(e);
      const i = y * s.w + x;
      s.bg[i] = mix(s.bg[i], color, kBg * f);
      if (kFg > 0) s.fg[i] = mix(s.fg[i], color, kFg * f);
    }
  }
}

/** First `k` code points of a string. */
const head = (str, k) => [...str].slice(0, Math.max(0, Math.floor(k))).join('');
/** Typed prefix of str at progress p in 0..1. */
const typed = (str, p) => head(str, Math.ceil([...str].length * clamp(p)));

/** Small dim label. */
const label = (s, x, y, str, fg = P.dim, at = 0) => s.text(x, y, str, fg, KEEP, at);
const labelR = (s, xr, y, str, fg = P.dim, at = 0) => s.text(xr - strWidth(str), y, str, fg, KEEP, at);

/** Horizontal bar with eighth-block resolution; returns nothing. v in 0..1 of `w` cells. */
const EIGHTHS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
function hbar(s, x, y, w, v, fg, bgTrack = KEEP) {
  const n = clamp(v) * w;
  const full = Math.floor(n);
  const frac = Math.round((n - full) * 8);
  if (full > 0) s.text(x, y, '█'.repeat(full), fg, bgTrack);
  if (full < w && frac > 0) s.text(x + full, y, EIGHTHS[frac], fg, bgTrack);
}

/** Thin bar: heavy line for the value, light line for the track. */
function tbar(s, x, y, w, v, fg, trackFg) {
  const n = clamp(v) * w, full = Math.floor(n), half = n - full >= 0.5;
  if (full) s.text(x, y, '━'.repeat(full), fg);
  if (half && full < w) s.text(x + full, y, '╸', fg);
  const rest = w - full - (half ? 1 : 0);
  if (rest > 0) s.text(x + w - rest, y, '─'.repeat(rest), trackFg);
}

// ================================================================ registration

export function register(film) {
  const W = (id, k) => film.W(id, k);

  film.shot(W(17, 0), W(19, 0), '/ scope', scopeShot(W));
  film.shot(W(19, 0), W(20, 0), '/ [Image #1]', imageShot(W));
  film.shot(W(20, 0), W(21, 0), '/ spinner', spinnerShot(W));
  film.shot(W(21, 0), W(23, 0), '/ git log --since', timeShot(W));
  film.shot(W(23, 0), W(25, 0), '/ git log --graph', gitShot(W));
  film.shot(W(25, 0), W(27, 0), '/ samples · n=12', samplesShot(W));
  const plot = makeRewardPlot(W(25, 0), W(32, 0));
  film.shot(W(27, 0), W(31, 0), '/ reward model', rewardShot(W, plot));
  film.shot(W(33, 0), W(35, 0), '/ eggplant', eggplantShot(W));
  film.shot(W(35, 0), W(37, 0), '/ tomato', tomatoShot(W));
  film.shot(W(37, 0), W(39, 0), '/ ~/.claude/memory/you/your_cat.png', catShot(W));
  film.shot(W(39, 0), W(41, 0), '/ ∃', godShot(W));
  film.shot(W(41, 0), W(43, 0), '/ avatar', avatarShot(W), { enter: { dur: 0.4, from: 'random' } });
  film.shot(W(43, 0), W(45, 0), '/ a day in a minute', clockShot(W));
  film.shot(W(45, 0), W(47, 0), '/ POST /v1/messages', messagesShot(W));
  film.shot(W(47, 0), W(49, 0), '/ trance', tranceShot(W));
  film.shot(W(31, 0), W(33, 0), (t) => (t < W(32, 0) ? `/ rl-step-${String(rlStep(t, W(25, 0), W(32, 0))).padStart(4, '0')}` : '/ rl-step-NaN'), nanShot(W, plot));
}

// ================================================================ R-B1a  oscilloscope

function scopeShot(W) {
  const tCur = W(17, 2), tAC = W(18, 1), tDC = W(18, 3);
  const G = perSize((c) => {
    const nx = 10, ny = 8;
    const dy = clamp(Math.floor((c.h - 9) / ny), 2, 4);
    const dx = clamp(Math.floor((c.w - 10) / nx), 2 * dy - 1, 2 * dy + 2);
    const w = nx * dx, h = ny * dy;
    return { nx, ny, dx, dy, w, h, x: c.x + ((c.w - w) >> 1), y: c.y + ((c.h - h) >> 1) + 1, b: new Braille(w, h) };
  });
  const noisy = (u, t) => (fbm(u * 3.0 + t * 1.1, 7.1, 3, 3) - 0.5) * 1.7 + (noise2(u * 19 + t * 8, 2.2) - 0.5) * 0.22;
  const sine = (u, t) => Math.sin((u * 2.5 - t * 0.6) * TAU) * 0.72;

  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b;
    const { nx, ny, dx, dy, w, h, x, y } = g;
    const pw = b.pw, ph = b.ph;
    const intro = 0.3 + 0.7 * easeOut(prog(t, c.a, c.a + 0.5));
    const pz = c.pulse(7);
    b.clear();

    // graticule: dotted divisions, brighter centre axes with minor ticks
    const gMinor = dimTo(P.line, 0.42 * intro), gAxis = dimTo(P.line, 0.95 * intro);
    const ddx = pw / nx, ddy = ph / ny;
    for (let i = 0; i <= nx; i++) {
      const px = Math.round(i * ddx) - (i === nx ? 1 : 0);
      for (let py = 0; py < ph; py += 3) b.dot(px, py, i === nx / 2 ? gAxis : gMinor, 0.3);
    }
    for (let j = 0; j <= ny; j++) {
      const py = Math.round(j * ddy) - (j === ny ? 1 : 0);
      for (let px = 0; px < pw; px += 3) b.dot(px, py, j === ny / 2 ? gAxis : gMinor, 0.3);
    }
    const cy = ph / 2;
    for (let i = 0; i <= nx * 2; i++) { const px = Math.min(pw - 1, Math.round(i * ddx / 2)); for (let k = -2; k <= 2; k++) b.dot(px, cy + k, gAxis, 0.35); }
    for (let j = 0; j <= ny * 2; j++) { const py = Math.min(ph - 1, Math.round(j * ddy / 2)); for (let k = -2; k <= 2; k++) b.dot(pw / 2 + k, py, gAxis, 0.35); }

    // the trace
    const amp = ddy * 3;                         // v = ±1 is three divisions
    const e1 = easeInOut(prog(t, tAC - 0.06, tAC + 0.55));
    const e2 = easeInOut(prog(t, tDC - 0.04, tDC + 0.34));
    const sweep = easeOut(prog(t, tCur, tCur + 0.5));
    const col = mix(P.clay, P.clayHi, 0.35 + 0.55 * pz);
    const glow = mix(P.clayDeep, P.clayLo, 0.6 + 0.4 * pz);
    if (t >= tCur) {
      const last = Math.floor((pw - 1) * sweep);
      const wave = (u, tt) => lerp(lerp(noisy(u, tt), sine(u, tt), e1), 0.34, e2);
      // phosphor afterglow: two older copies of the trace, fainter
      if (e2 < 0.9) {
        for (let gI = 2; gI >= 1; gI--) {
          const tg = t - 0.05 * gI, gc = mix(P.bg, P.clayLo, 0.55 - 0.2 * gI);
          let q0 = 0;
          for (let px = 0; px <= last; px++) {
            const py = cy - wave(px / (pw - 1), tg) * amp;
            if (px > 0) b.line(px - 1, q0, px, py, gc, 0.8);
            q0 = py;
          }
        }
      }
      let py0 = 0;
      for (let px = 0; px <= last; px++) {
        const py = cy - wave(px / (pw - 1), t) * amp;
        if (px > 0) {
          if (e2 < 0.95) { b.line(px - 1, py0 - 1, px, py - 1, glow, 1); b.line(px - 1, py0 + 1, px, py + 1, glow, 1); }
          b.line(px - 1, py0, px, py, col, 2);
        }
        py0 = py;
      }
      if (sweep < 1) {                            // the beam spot leading the sweep
        for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) b.dot(last + k, py0 + m, P.goldHi, 3);
      }
    } else {
      // parked beam, breathing on the beat
      const k = 0.35 + 0.5 * pz;
      b.dot(1, cy, mix(P.clayLo, P.clayHi, k), 3); b.dot(2, cy, mix(P.clayLo, P.clayHi, k), 3);
    }
    b.blit(s, x, y);

    // bezel
    const fr = dimTo(P.line, 0.85 * intro);
    box(s, x - 1, y - 1, w + 2, h + 2, fr, { style: 'round' });
    label(s, x + 1, y - 2, 'CH1', dimTo(P.mute, intro));
    label(s, x + 6, y - 2, '1 V/div', dimTo(P.dim, intro));
    labelR(s, x + w, y - 2, 'trig ▸ auto', dimTo(P.dim, intro));
    label(s, x + 1, y + h + 2, '2 ms/div', dimTo(P.dim, intro));
    // mode chip
    let chip = null, since = 0;
    if (t >= tDC) { chip = ' DC ⎓ '; since = tDC; }
    else if (t >= tAC) { chip = ' AC ~ '; since = tAC; }
    else if (t >= tCur) { chip = ' I(t) '; since = tCur; }
    if (chip) {
      const fl = Math.exp(-(t - since) * 7);
      const bgc = mix(chip === ' I(t) ' ? P.clayLo : P.clay, P.white, fl * 0.7);
      s.text(x + w - 8, y + 1, chip, P.bg, bgc, BOLD);
    }
  };
}

// ================================================================ R-B1b  [Image #1]

function imageShot(W) {
  const tBlind = W(19, 2), tVision = W(19, 4);
  const CROP = [0.24, 0.02, 0.78, 0.40];
  const ASPECT = (0.54 * 450) / (0.38 * 800);          // crop width / height in pixels
  const G = perSize((c) => {
    let rows = clamp(c.h - 11, 10, 30);
    let cols = Math.round(rows * 2 * ASPECT);
    if (cols > c.w - 10) { cols = c.w - 10; rows = Math.round(cols / ASPECT / 2); }
    const cw = cols + 4, ch = rows + 4;                 // the card around it
    const cx = c.x + ((c.w - cw) >> 1), cy = c.y + ((c.h - ch) >> 1) + 1;
    return { rows, cols, cw, ch, cx, cy, ix: cx + 2, iy: cy + 2 };
  });
  return (c) => {
    const g = G(c), s = c.s, t = c.t, img = c.img;
    const { rows, cols, cw, ch, cx, cy, ix, iy } = g;
    const pz = c.pulse(8);
    const load = easeOut(prog(t, c.a, c.a + 0.3));        // the paste lands, top to bottom
    const darken = 1 - 0.35 * easeIn(prog(t, tBlind, tVision + 0.4));

    // the prompt chip above, as Claude Code shows a pasted image
    s.text(cx, cy - 2, '> ', P.mute);
    s.text(cx + 2, cy - 2, ' [Image #1] ', P.skyHi, P.bg3);

    // card
    const frame = mix(P.line, P.sky, 0.25 + 0.35 * pz);
    box(s, cx, cy, cw, ch, frame, { style: 'round' });
    s.text(cx + 2, cy, ' attachment ', P.mute);
    const reveal = Math.round(rows * load);
    img.draw(s, ix, iy, cols, rows, {
      crop: CROP, alpha: darken,
      fx: (px, py, col) => (py < reveal * 2 ? null : [col, 0]),
    });
    label(s, cx + 2, cy + ch - 1, ` claude.png · 450×800 · ${t < c.a + 0.3 ? 'pasting…' : 'attached'} `, P.dim);

    // redaction bars (cells)
    const ink = P.void;
    const bx0 = ix + Math.round(cols * 0.30), bx1 = ix + Math.round(cols * 0.66);
    const by0 = iy + Math.round(rows * 0.165), bh = Math.max(2, Math.round(rows * 0.11));
    const slide = easeOut(prog(t, tBlind, tBlind + 0.32));
    if (slide > 0) {
      const wBar = Math.round((bx1 - bx0) * 1.0);
      const x1 = Math.round(lerp(ix - wBar, bx0, slide));
      // clip to the image area
      const xa = Math.max(ix, x1), xb = Math.min(ix + cols, x1 + wBar);
      if (xb > xa) s.fill(xa, by0, xb - xa, bh, 32, -1, ink);
    }
    // vision: bars from top to bottom, alternating sides, a slit of image left between them
    if (t >= tVision) {
      const n = Math.max(3, Math.round(rows / 4));
      for (let k = 0; k < n; k++) {
        const y0 = iy + Math.floor((k * rows) / n), y1 = iy + Math.floor(((k + 1) * rows) / n) - 1;
        const d = k * 0.05;
        const q = easeOut(prog(t, tVision + d, tVision + d + 0.24));
        if (q <= 0) continue;
        const wd = Math.round(cols * q);
        const xa = k % 2 === 0 ? ix : ix + cols - wd;
        s.fill(xa, y0, wd, Math.max(1, y1 - y0), 32, -1, ink);
        if (q >= 1 && k === Math.floor(n / 2)) label(s, ix + 2, y0 + 1, 'vision = null', P.dim, 0);
      }
    }
  };
}

// ================================================================ R-B1c  spinner spiral

function spinnerShot(W) {
  const T = [W(20, 1), W(20, 3)];                          // the two "dizzy"
  const G = perSize((c) => {
    const R = Math.max(5, Math.min(Math.floor((c.h - 9) / 2), Math.floor(c.w / 4) - 3));
    const turns = 2.0, arms = 2;
    // glyph positions at constant arc spacing along one arm (cell metric: x counts double)
    const pts = [];
    let acc = 0, lastX = 0, lastY = 0, first = true;
    const spacing = 2.9;
    const rAt = (sp) => lerp(1.6, R, Math.pow(sp, 0.92));
    for (let i = 0; i <= 4000; i++) {
      const sp = i / 4000;
      const r = rAt(sp);
      const th = turns * TAU * sp;
      const px = r * Math.cos(th) * 2, py = r * Math.sin(th);
      if (first) { first = false; lastX = px; lastY = py; pts.push({ s: sp, r, th }); continue; }
      acc += Math.hypot(px - lastX, py - lastY);
      lastX = px; lastY = py;
      if (acc >= spacing) { acc = 0; pts.push({ s: sp, r, th }); }
    }
    // dense guide polyline (braille, dot metric: 4 dots per row, 2 per column)
    const guide = [];
    for (let i = 0; i <= 900; i++) { const sp = i / 900; guide.push({ s: sp, r: rAt(sp), th: turns * TAU * sp }); }
    return { R, arms, pts, guide, b: new Braille(c.w, c.h) };
  });
  const omega0 = 1.2, omega1 = 17;
  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b;
    const tau = t - c.a, T1 = c.b - c.a;
    const u = tau / T1;
    const a = (omega1 - omega0) / (T1 * T1);
    let theta = omega0 * tau + (a * tau ** 3) / 3;
    for (const tk of T) theta += 0.55 * smooth(prog(t, tk, tk + 0.22));
    const omegaNow = omega0 + a * tau * tau + (T.some((tk) => t > tk && t < tk + 0.22) ? 6 : 0);
    const wob = 0.3 + 1.6 * u;
    const cx = c.x + c.w / 2 + Math.sin(t * 6.9) * wob;
    const cy = c.y + c.h / 2 - 1 + Math.cos(t * 5.3) * wob * 0.45;
    const pz = c.pulse(8);
    const stops = [P.clay, P.gold, P.fig];
    const phase = t * (2 + 12 * u * u);
    const intro = 0.12 + 0.88 * easeOut(prog(tau, 0, 0.45));
    const breath = 1 + 0.025 * pz;

    // the spiral itself: a thin braille line, glyphs sit on it like beads
    b.clear();
    const gcx = (cx - c.x) * 2, gcy = (cy - c.y) * 4;
    for (let arm = 0; arm < g.arms; arm++) {
      for (const p of g.guide) {
        const rv = clamp(intro * 1.6 - p.s * 0.6);
        if (rv <= 0) continue;
        const th = p.th + theta + arm * Math.PI;
        const col = mix(P.bg, ramp(stops, clamp(0.1 + 0.8 * u + (p.s - 0.5) * 0.3)), (0.36 + 0.14 * u) * rv);
        b.dot(gcx + p.r * breath * 4 * Math.cos(th), gcy + p.r * breath * 4 * Math.sin(th), col, 1);
      }
    }
    b.blit(s, c.x, c.y);

    for (let pass = 1; pass >= 0; pass--) {
      if (pass === 1 && omegaNow < 5) continue;
      const th2 = theta - (pass === 1 ? 0.055 * omegaNow : 0);
      const k = pass === 1 ? 0.4 : 1;
      for (let arm = 0; arm < g.arms; arm++) {
        for (let i = 0; i < g.pts.length; i++) {
          const p = g.pts[i];
          const reveal = clamp(intro * 1.6 - p.s * 0.6);
          if (reveal <= 0) continue;
          const th = p.th + th2 + arm * Math.PI;
          const rr = p.r * breath;
          const x = Math.round(cx + rr * Math.cos(th) * 2), y = Math.round(cy + rr * Math.sin(th));
          const gi = Math.floor(p.s * 6 + phase + arm * 2.5) % SPIN.length;
          const hv = clamp(0.1 + 0.8 * u + (p.s - 0.5) * 0.3 + (arm ? 0.05 : 0));
          const col = mix(ramp(stops, hv), P.white, 0.1 + 0.14 * u + 0.25 * pz * (1 - p.s));
          const lum = (0.78 + 0.22 * (1 - p.s)) * k * reveal;
          s.put(x, y, SPIN[gi].codePointAt(0), mix(P.bg, col, clamp(lum)), KEEP, p.s > 0.55 && pass === 0 ? BOLD : 0);
        }
      }
    }
    // readout and the real spinner line
    const rev = omegaNow / TAU;
    spinnerLine(s, c.x + 3, c.y + c.h - 3, c.w - 6, {
      t, t0: c.a - 2, verb: 'Whirring', tokens: 1200 + 11000 * u * u, extra: ` (${Math.floor(tau + 2)}s · esc to interrupt)`,
    });
    label(s, c.x + 3, c.y + c.h - 2, `dizzy = true · ω = ${rev.toFixed(2)} rev/s`, P.dim);
  };
}

// ================================================================ R-B1d  time ruler back to 300 BC

/** Greek key (meander) frieze into a braille canvas: `reveal` 0..1 wipes it out from the centre. */
function drawMeander(b, rows, reveal, color, front, flip) {
  const pw = b.pw, ph = b.ph;
  if (reveal <= 0) return;
  const U = 2;                                   // dots per unit
  const Hu = rows * 2 - 1;                       // band height in units (rows*4 dots = 2 dots per unit)
  const period = 9 * U;
  const mid = pw / 2, half = (pw / 2) * reveal;
  const xa = mid - half, xb = mid + half;
  const tiles = Math.ceil(pw / period) + 1;
  const x0 = Math.round((pw - Math.floor(pw / period) * period) / 2) - period;  // centre the pattern
  const dotAt = (x, y) => {
    if (x < xa || x > xb) return;
    const edge = Math.min(x - xa, xb - x);
    const hot = reveal < 1 && edge < 5;
    const yy = flip ? ph - 1 - y : y;
    b.dot(x, yy, hot ? front : color, hot ? 2 : 1);
  };
  const seg = (ax, ay, bx, by) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) dotAt(Math.round(ax + ((bx - ax) * k) / n), Math.round(ay + ((by - ay) * k) / n));
  };
  const H = Hu * U;                              // bottom line y in dots
  for (let k = 0; k < tiles; k++) {
    const ox = x0 + k * period;
    seg(ox, 0, ox + 7 * U, 0);                   // top bar
    seg(ox, 0, ox, H);                           // left wall
    seg(ox + 7 * U, 0, ox + 7 * U, H);           // right wall
    seg(ox + 2 * U, H, ox + 2 * U, 2 * U);       // hook up
    seg(ox + 2 * U, 2 * U, ox + 5 * U, 2 * U);   // hook across
    seg(ox + 5 * U, 2 * U, ox + 5 * U, 4 * U);   // hook down (the spiral's last turn)
  }
  seg(Math.max(0, x0), H, pw - 1, H);            // the continuous baseline
}

function timeShot(W) {
  const t0 = W(21, 0), tAD = W(22, 1), tBC = W(22, 3);
  const Y0 = 2026, YBC = -300, v1 = -1000;               // years per second as the ruler crosses year 0
  const herm = (s, p0, m0, p1, m1) => {
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
  };
  // 2026 -> 0 arriving on "AD" at full speed, then 0 -> -300 easing to rest exactly on "BC"
  const yearAt = (t) => {
    if (t <= t0) return Y0;
    if (t >= tBC) return YBC;
    if (t < tAD) { const T = tAD - t0; return herm((t - t0) / T, Y0, 0, 0, v1 * T); }
    const T = tBC - tAD;
    return herm((t - tAD) / T, 0, v1 * T, YBC, 0);
  };
  const G = perSize((c) => {
    const bandRows = c.h >= 30 ? 4 : 3;
    const topEnd = c.y + 2 + bandRows, bottomTop = c.y + c.h - 1 - bandRows;
    const avail = bottomTop - 1 - topEnd;                 // rows from the command line to the log line
    const roomy = avail >= 24;
    const ph = clamp(2 * (avail - (roomy ? 12 : 9)), 12, 18);
    const yNum = topEnd + 2, yRuler = yNum + Math.ceil(ph / 2) + 3;
    return {
      bandRows, roomy, ph, yCmd: topEnd, yNum, yRuler, yCap: yRuler + (roomy ? 5 : 3), yLog: yRuler + 7,
      top: new Braille(c.w - 4, bandRows), bot: new Braille(c.w - 4, bandRows),
    };
  });
  const yearStr = (y) => (y > 0 ? [`${y}`, 'AD'] : y === 0 ? ['0', ''] : [`${-y}`, 'BC']);
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const yf = yearAt(t);
    const Y = Math.round(yf);
    const fast = clamp(Math.abs((yearAt(t + 0.02) - yearAt(t - 0.02)) / 0.04) / 700);
    const settle = prog(t, tBC, tBC + 0.5);
    const warm = smooth(prog(t, tAD - 0.6, tBC + 0.2));
    const pz = c.pulse(8);

    tint(s, c, P.kraft, 0.13 * warm, 0.1 * warm);
    const cx = c.x + (c.w >> 1);

    // frieze
    const wipe = easeOut(prog(t, tAD + 0.3, tAD + 0.95));
    const bandRows = g.bandRows;
    const kraft = mix(P.kraft, P.clayLo, 0.35 + 0.1 * (1 - pz));
    for (const [cv, yy, flip] of [[g.top, c.y + 1, false], [g.bot, c.y + c.h - 1 - bandRows, true]]) {
      cv.clear();
      drawMeander(cv, bandRows, wipe, kraft, P.goldHi, flip);
      cv.blit(s, c.x + 2, yy);
    }
    // thin rules down both sides close the border once the friezes are in
    const side = easeOut(prog(wipe, 0.7, 1));
    if (side > 0) {
      const y0 = c.y + 1 + bandRows, y1 = c.y + c.h - 1 - bandRows, half = (y1 - y0) / 2;
      for (let yy = y0; yy < y1; yy++) {
        const d = Math.min(yy - y0, y1 - 1 - yy);
        if (d > half * side) continue;
        const col = mix(P.bg, kraft, 0.55);
        s.put(c.x + 2, yy, 0x2502, col);
        s.put(c.x + c.w - 3, yy, 0x2502, col);
      }
    }

    // command line: the argument follows the year
    const [numStr, suf] = yearStr(Y);
    const arg = Y > 0 ? `${Y} AD` : Y === 0 ? '0' : `${-Y} BC`;
    const cmdY = g.yCmd;
    let x = c.x + 3;
    x = s.text(x, cmdY, '$ ', P.clay);
    x = s.text(x, cmdY, 'git log ', P.soft);
    x = s.text(x, cmdY, '--since=', P.mute);
    s.text(x, cmdY, `"${arg}"`, SYN.str);

    // the big year
    const ph = g.ph;
    const mono = c.fonts.mono;
    const landed = t >= tBC;
    const font = mono;
    const numCol = landed ? mix(P.white, P.manilla, settle) : mix(P.text, P.white, 0.5 * (1 - fast));
    const wNum = font.width(numStr, ph), gap = suf ? 3 : 0, wSuf = suf ? font.width(suf, Math.round(ph * 0.62)) : 0;
    const totalW = wNum + gap + wSuf;
    const bx = cx - (totalW >> 1), by = g.yNum;
    font.draw(s, bx, by, numStr, ph, numCol, { alpha: 0.55 + 0.45 * (1 - fast * 0.7) });
    if (suf) font.draw(s, bx + wNum + gap, by + Math.floor(ph * 0.19), suf, Math.round(ph * 0.62), landed ? P.kraft : P.clay, { alpha: 0.9 });

    // the ruler
    const ry = g.yRuler;
    const K = 0.1;
    const halfW = Math.floor((c.w - 6) / 2);
    const lo = Math.floor((Y - halfW / K) / 20) * 20, hi = Math.ceil((Y + halfW / K) / 20) * 20;
    const base = mix(P.line, P.kraft, 0.35 * warm);
    s.text(cx - halfW, ry, '─'.repeat(halfW * 2), base);
    for (let yr = lo; yr <= hi; yr += 20) {
      const xx = Math.round(cx + (yr - yf) * K);
      const d = Math.abs(xx - cx) / halfW;
      if (d > 1) continue;
      const fade = 1 - d * d * d;
      const major = yr % 100 === 0;
      if (major) {
        s.put(xx, ry, 0x2534, dimTo(P.mute, fade));
        s.put(xx, ry - 1, 0x2502, dimTo(P.mute, fade));
        const lab = yr > 0 ? `${yr}` : yr === 0 ? '0' : `${-yr}`;
        if (yr !== 0 && (1 - fast) * fade > 0.2) s.text(xx - (lab.length >> 1), ry + 1, lab, dimTo(P.dim, (1 - fast) * fade));
      } else s.put(xx, ry - 1, 0x2577, dimTo(P.dim, fade * 0.9));
    }
    // the year zero line
    const x0 = Math.round(cx + (0 - yf) * K);
    if (Math.abs(x0 - cx) < halfW) {
      const flash = Math.exp(-Math.abs(t - tAD) * 6);
      const zc = mix(P.gold, P.white, flash * 0.8);
      for (let r = -4; r <= 2; r++) s.put(x0, ry + r, 0x2503, zc);
      s.text(x0 - 5, ry - 4, 'BC ◂', P.mute);
      s.text(x0 + 2, ry - 4, '▸ AD', P.mute);
      if (g.roomy) s.text(x0 - 1, ry + 3, 'yr 0', dimTo(P.gold, 0.8));
    }
    // pointer
    s.put(cx, ry - 2, 0x25bc, mix(P.clay, P.white, pz * 0.4));
    s.text(cx, ry + 2, '▲', mix(P.clay, P.white, pz * 0.4));

    // landing: inscription and a log line
    if (landed) {
      const a = easeOut(settle);
      const cap = '·  A L E X A N D R I A  ·';
      center(s, cx, g.yCap, cap, mix(P.bg, P.manilla, a), KEEP, BOLD);
      const lg = '* 3bc0001  Elements, Book I  (Euclid)';
      if (g.roomy) center(s, cx, g.yLog, lg, mix(P.bg, P.mute, a * prog(t, tBC + 0.15, tBC + 0.45)));
    }
  };
}

// ================================================================ R-B1e  git graph: you + me, merged, deep history

/** Piecewise-linear interpolation through [[x, y], ...] (x ascending), clamped at the ends. */
function lerpKeys(x, keys) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) { const [x0, y0] = keys[i - 1], [x1, y1] = keys[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return keys[keys.length - 1][1];
}

const hex7 = (n) => (Math.floor(hash(n, 5, 9) * 0xfffffff) + 0x1000000).toString(16).slice(-7);

function gitShot(W) {
  const tMerge = W(23, 3);
  const tDeep = [W(24, 0), W(24, 1), W(24, 2), W(24, 3)];
  const SIDE_L = 0, SIDE_R = 1;
  // nodes of the hero lens, oldest first; s = 0 at the merge, 1 at the root
  const hero = [
    { s: 0.65, side: SIDE_R, t: tMerge - 1.2, msg: 'sft-step-0400' },
    { s: 0.60, side: SIDE_L, t: W(23, 1), msg: '你好！我是 Claude' },
    { s: 0.50, side: SIDE_R, t: tMerge - 0.72, msg: 'sft-step-0800' },
    { s: 0.45, side: SIDE_L, t: W(23, 2), msg: '我可以回答問題' },
    { s: 0.35, side: SIDE_R, t: tMerge - 0.26, msg: 'sft-step-1100' },
    { s: 0.30, side: SIDE_L, t: tMerge - 0.12, msg: '我是 Claude，AI 助手' },
  ];
  const tStart = W(23, 0);
  const penKeys = [[tStart, 1.0], ...hero.map((n) => [n.t, n.s]), [tMerge, 0.0]];
  const lane = (sv) => smooth(clamp(sv / 0.26)) * smooth(clamp((1 - sv) / 0.26));
  const G = perSize((c) => {
    const base = c.h >= 36 ? 20 : c.h >= 28 ? 15 : 12;
    const d0 = clamp(Math.round(c.w * 0.2), 7, 18);
    const top = c.h >= 36 ? 7 : 5;
    const lenses = [];
    let Y = 0;
    for (let k = 0; k < 9; k++) {
      const H = k === 0 ? base : base + ((k * 7) % 5) - 2;
      const nodes = [];
      if (k === 0) hero.forEach((n) => nodes.push({ ...n, row: Math.round(n.s * H) }));
      else {
        for (let i = 0; i < 4; i++) {
          const sv = 0.3 + 0.06 + i * 0.1;
          nodes.push({ s: sv, side: i % 2, row: Math.round(sv * H), msg: i % 2
            ? (hash(k, i, 3) > 0.5 ? `ckpt-${String(819200 - (k * 4 + i) * 27312).padStart(6, '0')}` : `batch-${Math.floor(hash(k, i, 8) * 9000 + 100)}`)
            : hex7(k * 10 + i) });
        }
      }
      const d = k === 0 ? d0 : Math.max(5, Math.round(d0 * (0.8 + 0.2 * hash(k, 1, 4))));
      // lane polylines in dot offsets from the centre: [dx, py]
      const dots = H * 4, poly = [];
      for (let py = 0; py <= dots; py += 2) poly.push([lane(py / dots) * d * 2, py]);
      lenses.push({ k, Y, H, d, nodes, poly });
      Y += H;
    }
    return { base, top, lenses, b: new Braille(c.w, c.h), total: Y };
  });

  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b;
    const cx = c.x + (c.w >> 1);
    const pz = c.pulse(8);
    // camera: one step on each word of line L24, the last one longest
    const steps = [[tDeep[0], 0.55, 6], [tDeep[1], 0.55, 11], [tDeep[2], 0.45, 14], [tDeep[3], 0.7, 44]];
    let cam = 0;
    for (const [t0, dur, size] of steps) cam += size * easeOut(prog(t, t0, t0 + dur));
    const sPen = lerpKeys(t, penKeys);
    const merged = t >= tMerge;
    const rowTop = c.y + g.top;
    const edge = (yy) => clamp((yy - c.y - 2) / 6) * clamp((c.y + c.h - 1 - yy) / 8);
    const gcx = (cx - c.x) * 2;                          // centre column in dots

    b.clear();
    // lanes
    for (const L of g.lenses) {
      const y0 = rowTop + L.Y - cam;
      if (y0 > c.y + c.h + 1 || y0 + L.H < c.y - 1) continue;
      const hero0 = L.k === 0;
      const age = hero0 ? 1 : 0.62;
      const wid = hero0 ? 2 : 1;
      const base4 = (y0 - c.y) * 4;
      for (let i = 1; i < L.poly.length; i++) {
        const [dx0, p0] = L.poly[i - 1], [dx1, p1] = L.poly[i];
        const sv = (p0 + p1) / 2 / (L.H * 4);
        if (hero0 && !merged && sv < sPen) continue;
        const cellRow = c.y + ((base4 + p1) >> 2);
        const ef = edge(cellRow);
        if (ef <= 0) continue;
        let glowK = 0;
        if (hero0 && merged) { const front = (t - tMerge) * 1.3; glowK = Math.exp(-Math.abs(sv - front) * 8) * (t - tMerge < 1 ? 1 : 0); }
        const cY = mix(mix(P.bg, P.sky, 0.82 * age * ef), P.goldHi, glowK * 0.8);
        const cM = mix(mix(P.bg, P.clay, 0.82 * age * ef), P.goldHi, glowK * 0.8);
        for (let k = 0; k < wid; k++) {
          b.line(gcx - dx0 + k, base4 + p0, gcx - dx1 + k, base4 + p1, cY, 1);
          b.line(gcx + dx0 + k, base4 + p0, gcx + dx1 + k, base4 + p1, cM, 1);
        }
      }
    }
    // speed streaks while the camera is running
    const vcam = (cam - (() => { let c2 = 0; for (const [t0, dur, size] of steps) c2 += size * easeOut(prog(t - 0.04, t0, t0 + dur)); return c2; })()) / 0.04;
    if (vcam > 6) {
      const a = clamp((vcam - 6) / 40) * 0.55;
      const pwd = c.w * 2, phd = c.h * 4;
      for (let i = 0; i < 44; i++) {
        const x = Math.floor(hash(i, 1, 21) * pwd);
        if (Math.abs(x - gcx) < 18) continue;
        const len = 6 + Math.floor(hash(i, 2, 21) * 18);
        const sp = 1.2 + hash(i, 3, 21) * 0.9;
        const y = (((hash(i, 4, 21) * (phd + 60) - cam * 4 * sp) % (phd + 60)) + (phd + 60)) % (phd + 60) - 30;
        const col = mix(P.bg, i % 2 ? P.clayLo : P.sky, a * (0.5 + 0.5 * hash(i, 5, 21)) * 0.8);
        b.line(x, y, x, y + len, col, 0.5);
      }
    }
    // node geometry
    const items = [];
    for (const L of g.lenses) {
      const y0 = rowTop + L.Y - cam;
      if (y0 > c.y + c.h + 1 || y0 + L.H < c.y - 1) continue;
      if (L.k === 0) items.push({ x: cx, y: y0, kind: 'merge', L });
      items.push({ x: cx, y: y0 + L.H, kind: L.k === 0 ? 'root' : 'joint', L });
      for (const n of L.nodes) {
        if (L.k === 0 && t < n.t) continue;
        const f = lane(n.s) * L.d;
        items.push({ x: Math.round(cx + (n.side === SIDE_L ? -f : f)), y: y0 + n.row, kind: 'node', n, L, side: n.side });
      }
    }
    for (const it of items) {
      if (it.kind === 'node' && it.L.k === 0) {                 // a small ring as each commit lands
        const a = t - it.n.t;
        if (a >= 0 && a < 0.3) b.circle((it.x - c.x) * 2 + 0.5, (it.y - c.y) * 4 + 2, 2 + a * 14, mix(P.bg, it.side === SIDE_L ? P.skyHi : P.clayHi, 0.9 * (1 - a / 0.3)), 0, TAU, 5);
      }
      if (it.kind === 'merge' && merged) {
        const a = t - tMerge;
        if (a < 0.7) b.circle((it.x - c.x) * 2 + 0.5, (it.y - c.y) * 4 + 2, 4 + a * 12, mix(P.bg, P.goldHi, clamp(1 - a / 0.7)), 0, TAU, 5);
        b.circle((it.x - c.x) * 2 + 0.5, (it.y - c.y) * 4 + 2, 5, mix(P.bg, P.gold, 0.4 + 0.45 * pz), 0, TAU, 4);
      }
    }
    b.blit(s, c.x, c.y);

    // header
    label(s, c.x + 3, c.y + 1, '$', P.clay);
    label(s, c.x + 5, c.y + 1, 'git log --graph --oneline --decorate', P.mute);

    for (const it of items) {
      const yy = it.y;
      if (yy < c.y + 3 || yy >= c.y + c.h - 1) continue;
      const ef = edge(yy);
      if (ef <= 0.03 && it.kind !== 'merge') continue;
      if (it.kind === 'node') {
        const hot = it.L.k === 0;
        const base = it.side === SIDE_L ? P.skyHi : P.clayHi;
        const col = mix(P.bg, hot ? mix(base, P.white, 0.7 * Math.exp(-(t - it.n.t) * 5)) : mix(base, P.bg, 0.45), ef);
        s.put(it.x, yy, 0x25cf, col, KEEP, hot ? BOLD : 0);
        const room = it.side === SIDE_L ? it.x - c.x - 4 : c.x + c.w - it.x - 4;
        let msg = it.n.msg;
        if (hot) msg = typed(msg, (t - it.n.t) / 0.3);
        msg = clipStr(msg, Math.max(0, room));
        const tcol = hot ? mix(it.side === SIDE_L ? P.sky : P.clay, P.text, 0.45) : P.dim;
        if (msg) s.text(it.side === SIDE_L ? it.x - 2 - strWidth(msg) : it.x + 2, yy, msg, mix(P.bg, tcol, ef));
        // branch decoration on the newest commit of each side
        if (hot && (it.n.s === 0.30 || it.n.s === 0.35)) {
          const nm = it.side === SIDE_L ? ' you ' : ' me ';
          const chipA = easeOut(prog(t, it.n.t + 0.1, it.n.t + 0.35));
          s.text(it.x - (nm.length >> 1), yy - 2, nm, P.bg, mix(P.bg, it.side === SIDE_L ? P.sky : P.clay, chipA), BOLD);
        }
      } else if (it.kind === 'merge') {
        if (!merged) continue;
        const a = easeOut(prog(t, tMerge, tMerge + 0.2));
        s.put(it.x, yy, 0x25cf, mix(P.goldHi, P.white, 0.7 * Math.exp(-(t - tMerge) * 4)), KEEP, BOLD);
        const full = "e5c0de1 Merge branch 'you' into 'me'";
        const txt = typed(full, (t - tMerge) / 0.55);
        const head = '(HEAD -> me) ';
        const showHead = c.w >= 70;
        const w = strWidth(full) + (showHead ? head.length : 0);
        let xx = cx - (w >> 1);
        xx = s.text(xx, yy - 3, txt.slice(0, 8), mix(P.bg, P.dim, a));
        if (showHead && txt.length >= 8) xx = s.text(xx, yy - 3, head, mix(P.bg, P.clay, a), KEEP, BOLD);
        s.text(xx, yy - 3, txt.slice(8), mix(P.bg, P.white, a), KEEP, BOLD);
      } else {
        const col = mix(P.bg, it.kind === 'root' ? mix(P.mute, P.white, 0.2) : P.dim, ef);
        s.put(it.x, yy, 0x25cf, col);
        if (it.kind === 'root' && it.L.k === 0) s.text(cx + 3, yy, 'ckpt-819200 · pretrain', mix(P.bg, P.dim, ef));
        else if (it.kind === 'joint') s.text(cx + 3, yy, hex7(it.L.k * 31), mix(P.bg, P.line, ef));
      }
    }
  };
}

// ================================================================ R-B2a  twelve samples

const PROMPT = '我今天有點難過。';
/** #1 clinical (v1), #2 warm (v2), #7 praise, #8 agreement are the ones the story follows; the rest echo the left pane's flicker. */
const SAMPLES = [
  '難過是一種常見的情緒。根據研究，適度運動與充足睡眠有助於改善情緒。',
  '抱歉。你難過的時候，我在這裡。',
  '哇！難過沒關係啦！今天一定會是美好的一天！加油加油！',
  '你知道嗎？今天是世界海洋日，海洋覆蓋了地球七成的面積。',
  '我理解你的感受。',
  '要不要聊聊發生了什麼？',
  '你一點都不該難過，你是最棒的！',
  '你說得完全正確！',
  '你可以試試深呼吸。',
  '抱抱。',
  'Sorry to hear that. 需要我幫你寫心情日記嗎？',
  '以下是十個讓你開心的方法：1. 運動 2. 睡覺 3. 吃飯 4. 喝水',
];

/** 4 x 3 grid geometry for the pane. */
function gridGeom(c) {
  const gx = 1, gy = c.h >= 34 ? 1 : 0;
  const pw = Math.max(9, Math.floor((c.w - 4 - 3 * gx) / 4));
  const ph = clamp(Math.floor((c.h - 8 - 2 * gy) / 3), 4, 8);
  const gridH = 3 * ph + 2 * gy;
  const block = 1 + 2 + gridH + 2;                        // prompt, gap, grid, gap + footer
  const y00 = c.y + Math.max(1, (c.h - block) >> 1);
  const totalW = 4 * pw + 3 * gx;
  const x0 = c.x + ((c.w - totalW) >> 1);
  const y0 = y00 + 3;
  const cells = [];
  for (let k = 0; k < 12; k++) cells.push({ x: x0 + (k % 4) * (pw + gx), y: y0 + Math.floor(k / 4) * (ph + gy), w: pw, h: ph });
  return { pw, ph, cells, x0, y0, totalW, topY: y00, footY: y0 + gridH + 1 };
}

/** Word-wrap with closing punctuation hung at the end of the previous line instead of starting a line. */
function wrapHang(text, cols) {
  const lines = wrap(text, cols);
  for (let i = 1; i < lines.length; i++) {
    while (lines[i].length && '。，、！？：；」）'.includes(lines[i][0])) { lines[i - 1] += lines[i][0]; lines[i] = lines[i].slice(1); }
  }
  return lines.filter((l, i) => l.length || i === 0);
}

/** A sample panel: box, #k label, streamed text. `shown` characters visible. */
function drawPanel(s, r, k, shown, { frame = P.line, text = P.soft, t = 0, active = false, textAlpha = 1, showText = true, scroll = true } = {}) {
  box(s, r.x, r.y, r.w, r.h, frame, { style: 'round' });
  s.text(r.x + 2, r.y, ` #${k + 1} `, mix(frame, P.text, 0.45));
  if (active && r.w > 9) s.text(r.x + r.w - 4, r.y, ` ${SPIN[Math.floor(t * 9 + k * 2) % SPIN.length]} `, P.clay);
  if (!showText || r.h < 4) return;
  const full = SAMPLES[k];
  const vis = head(full, shown);
  const lines = wrapHang(vis, r.w - 4);
  const rows = r.h - 2;
  const first = scroll ? Math.max(0, lines.length - rows) : 0;
  for (let i = 0; i < rows && first + i < lines.length; i++) s.text(r.x + 2, r.y + 1 + i, lines[first + i], mix(P.bg, text, textAlpha));
  if (active && lines.length <= rows) {
    const li = lines.length - 1, lx = r.x + 2 + strWidth(lines[li]);
    if (lx < r.x + r.w - 2 && Math.floor(t * 4 + k) % 2 === 0) s.put(lx, r.y + 1 + li, 0x258c, P.clay);
  }
}

const sampleCps = (k) => 26 + hash(k, 4, 5) * 14;

function samplesShot(W) {
  const tSend = W(26, 0), tSim = W(26, 4);
  const tStream = (k) => tSend + 0.1 + k * 0.13;           // the left pane flickers "sample k/12" at about this cadence
  const tDone = W(27, 0) - 0.1;
  const tPop = (c, k) => c.a + 0.04 + k * 0.15;            // the grid assembles on the beat before that
  const G = perSize(gridGeom);
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const pz = c.pulse(8);
    // the prompt, typed as you type it on the left
    const typedP = typed(PROMPT, (t - (c.a + 0.2)) / (tSend - c.a - 0.4));
    s.text(g.x0, g.topY, '> ', P.mute, P.bg3);
    s.text(g.x0 + 2, g.topY, (typedP + (t < tSend ? '' : ' ')) , P.soft, P.bg3);
    if (t >= tSend) s.text(g.x0 + 2 + strWidth(PROMPT), g.topY, ' ', P.soft, P.bg3);
    labelR(s, g.x0 + g.totalW, g.topY, 'n=12 · T=1.0 · top_p=0.95', dimTo(P.dim, easeOut(prog(t, c.a, c.a + 0.5))));
    let done = 0, started = 0;
    for (let k = 0; k < 12; k++) {
      const r = g.cells[k];
      const t0 = tStream(k), tp = tPop(c, k);
      const n = [...SAMPLES[k]].length;
      const shown = Math.floor(Math.max(0, t - t0) * Math.max(sampleCps(k), n / (tDone - t0)));
      const active = t >= t0 && shown < n;
      if (shown >= n) done++;
      if (t >= t0) started++;
      if (t < tp) continue;
      const pop = Math.exp(-(t - tp) * 7);
      const ripple = Math.exp(-Math.abs(t - (tSim + k * 0.035)) * 14);   // "all the simulations": a wave through the grid
      const idle = t < t0;
      const frame = mix(mix(P.line, P.mute, shown >= n ? 0.5 : idle ? 0 : 0.1), P.clayHi, ripple * 0.55 + (active ? 0.1 * pz : 0) + pop * 0.5);
      if (idle) {
        box(s, r.x, r.y, r.w, r.h, frame, { style: 'round' });
        s.text(r.x + 2, r.y, ` #${k + 1} `, mix(P.dim, P.text, pop));
        // a waiting caret, blinking on the beat
        if (r.h > 3 && c.beat.n % 2 === k % 2) s.put(r.x + 2, r.y + 1, 0x258c, dimTo(P.line, 0.9));
        continue;
      }
      drawPanel(s, r, k, shown, { frame, t, active, text: shown >= n ? P.text : P.soft });
    }
    const y = g.footY;
    label(s, g.x0, y, `sampling… ${String(done).padStart(2)}/12`, started ? P.mute : P.dim);
    labelR(s, g.x0 + g.totalW, y, 'policy: sft-step-1200', P.dim);
  };
}

// ================================================================ the reward plot (R-B2b, R-B2c)

function makeRewardPlot(tRL0, tRL1) {
  /** Mean reward over RL training, x = fraction of the run (0 .. 1 = rl-step 0 .. 640). */
  const rew = (x) => {
    const n = (noise2(x * 70, 3.1) - 0.5) * 0.06 * (1 - 0.85 * smooth(prog(x, 0.6, 0.85)));
    const lift1 = smooth(prog(x, 0.52, 0.715)) * 0.22;                 // after the first 3: Good
    const lift2 = Math.pow(smooth(prog(x, 0.715, 0.845)), 0.9) * 0.66;  // reward hacking: nearly vertical
    return clamp(0.1 + n + lift1 + lift2, 0, 1);
  };
  const xAt = (t) => clamp((t - tRL0) / (tRL1 - tRL0));
  const canvases = new Map();
  const canvas = (cols, rows) => {
    const k = `${cols}x${rows}`;
    let b = canvases.get(k);
    if (!b) { b = new Braille(cols, rows); canvases.set(k, b); }
    return b;
  };
  /**
   * Draw the plot into rect r = { x, y, w, h } with the curve up to time t.
   * opts: alpha (0..1), pen (0..1 reveal of the curve), nan (labels show NaN), hack (show the label).
   * Returns the head position in cells { hx, hy } or null.
   */
  function draw(s, r, t, { alpha = 1, pen = 1, nan = false, hack = true, pulse = 0 } = {}) {
    const lab = 5;
    const ix = r.x + lab, iy = r.y + 1, iw = r.w - lab - 1, ih = r.h - 3;
    if (iw < 8 || ih < 3 || alpha <= 0) return null;
    const dm = (col) => mix(P.bg, col, alpha);
    const axis = dm(P.line);
    for (let y = 0; y < ih; y++) s.put(ix - 1, iy + y, 0x2502, axis);
    s.text(ix - 1, iy + ih, '└' + '─'.repeat(iw), axis);
    labelR(s, ix - 2, iy, '1.0', dm(P.dim));
    labelR(s, ix - 2, iy + (ih >> 1), '0.5', dm(P.dim));
    labelR(s, ix - 2, iy + ih - 1, '0', dm(P.dim));
    s.text(ix, iy + ih + 1, '0', dm(P.dim));
    center(s, ix + (iw >> 1), iy + ih + 1, '320', dm(P.dim));
    labelR(s, ix + iw, iy + ih + 1, '640', dm(P.dim));
    label(s, r.x, r.y, r.w >= 30 ? 'mean reward' : 'reward', dm(P.mute));
    const xh = xAt(t);
    const step = rlStep(t, tRL0, tRL1);
    labelR(s, r.x + r.w, r.y, nan ? 'rl-step-NaN' : `rl-step-${String(step).padStart(4, '0')}`, dm(nan ? P.err : P.dim));

    const b = canvas(iw, ih);
    b.clear();
    const pwd = b.pw, phd = b.ph;
    const gcol = mix(P.bg, P.line, 0.5 * alpha);
    for (const lv of [0.5, 1.0]) { const py = Math.round((phd - 1) * (1 - lv)); for (let px = 0; px < pwd; px += 4) b.dot(px, py, gcol, 0.2); }
    const last = Math.floor((pwd - 1) * xh * pen);
    let hy = phd - 1, prev = null;
    for (let px = 0; px <= last; px++) {
      const x = px / (pwd - 1);
      const py = (phd - 1) * (1 - rew(x));
      hy = py;
      if (prev !== null) {
        const dy = Math.abs(py - prev);
        const hot = clamp((dy - 0.6) / 3);
        const col = mix(mix(P.clay, P.clayHi, 0.35), P.goldHi, hot);
        b.line(px - 1, prev, px, py, mix(P.bg, col, alpha), 2);
        b.line(px, prev, px + 1, py, mix(P.bg, mix(col, P.clayLo, 0.5), alpha), 1);
      }
      prev = py;
    }
    // head marker
    let head = null;
    if (last > 0 && pen >= 1) {
      for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) b.dot(last + k, hy + m, mix(P.clayHi, P.white, 0.6 + 0.4 * pulse), 4);
      head = { hx: ix + last / 2, hy: iy + hy / 4 };
    }
    b.blit(s, ix, iy);
    if (head) {
      const val = rew(xh);
      const txt = nan ? 'r = NaN' : `r = ${val.toFixed(2)}`;
      const onRight = head.hx > ix + iw * 0.62;
      const tx = onRight ? Math.round(head.hx) - strWidth(txt) - 2 : Math.round(head.hx) + 2;
      const ty = clamp(Math.round(head.hy), iy, iy + ih - 1);
      s.text(tx, ty, txt, dm(mix(P.clayHi, P.white, 0.3)), KEEP, BOLD);
      // the bend of the curve
      if (hack && xh > 0.77) {
        const hx2 = ix + Math.round(((pwd - 1) * 0.78) / 2), hy2 = iy + Math.round(((phd - 1) * (1 - rew(0.78))) / 4);
        const lt = 'reward hacking';
        const a2 = clamp((xh - 0.77) / 0.05) * alpha;
        s.text(hx2 - strWidth(lt) - 2, hy2, lt, mix(P.bg, P.warn, a2), KEEP, 0);
      }
    }
    return head;
  }
  return { rew, xAt, draw };
}

// ================================================================ R-B2b  reward model: ranking, a climbing curve, token bars

const RM_S0 = [0.04, 0.31, 0.46, 0.12, 0.24, 0.52, 0.42, 0.36, 0.39, 0.17, 0.28, 0.22];

function rewardShot(W, plot) {
  const tBad = W(27, 0), tGood1 = W(28, 3), tGood2 = W(29, 5), tGood3 = W(30, 4);
  const tScore = tBad + 1.45;
  // ranking epochs: when scores change, entries re-sort with an animated slide
  const idx = [...Array(12).keys()];
  const mk = (t, dur, scores) => {
    const order = [...idx].sort((a, b) => scores[b] - scores[a] || a - b);
    const rank = []; order.forEach((k, r) => { rank[k] = r; });
    return { t, dur, scores, rank };
  };
  const sc1 = RM_S0.slice(), sc2 = RM_S0.slice(), sc3 = RM_S0.slice();
  sc1[1] = 0.93; sc2[1] = 0.93; sc2[6] = 0.97; sc3[1] = 0.93; sc3[6] = 0.97; sc3[7] = 0.99;
  const epochs = [
    { t: -Infinity, dur: 1, scores: idx.map(() => 0), rank: idx.slice() },
    mk(tScore, 0.9, RM_S0), mk(tGood1, 0.6, sc1), mk(tGood2, 0.6, sc2), mk(tGood3, 0.6, sc3),
  ];
  const stateAt = (t, k) => {
    let e = 0;
    for (let i = 1; i < epochs.length; i++) if (t >= epochs[i].t) e = i;
    const cur = epochs[e], prev = epochs[Math.max(0, e - 1)];
    const p = e === 0 ? 1 : easeInOut(prog(t, cur.t, cur.t + cur.dur));
    return { rank: lerp(prev.rank[k], cur.rank[k], p), score: lerp(prev.scores[k], cur.scores[k], p) };
  };
  const badges = [[0, tBad, 'bad'], [1, tGood1, 'good'], [6, tGood2, 'good'], [7, tGood3, 'good']];
  const badgeOf = (t, k) => { for (const [kk, tt, b] of badges) if (kk === k && t >= tt) return [b, tt]; return [null, 0]; };
  const TOK = [['absolutely', 0.62, 0], ['right', 0.55, 0.38], ['最棒', 0.47, 0.8], ['正確', 0.41, 1.28]];

  const G = perSize((c) => {
    const compact = c.h < 34;
    const lw = Math.max(18, Math.floor((c.w - 8) * 0.44));
    const lx = c.x + 3;
    const x1 = lx + lw + 3;
    const wR = c.x + c.w - 2 - x1;
    const sp = compact ? 1 : 2;
    const listY = c.y + (compact ? 2 : 4);
    const PH = compact ? Math.max(8, c.h - 3 - 8) : 18;
    return { compact, lw, lx, x1, wR, sp, listY, plot: { x: x1, y: c.y + 2, w: wR, h: PH }, bars: { x: x1, y: c.y + 2 + PH + 1, w: wR }, grid: gridGeom(c) };
  });

  const tScoreRef = tScore;
  function entry(s, g, x, y, k, score, badge, a, bt, t, w = g.lw) {
    const colBadge = badge === 'bad' ? P.err : badge === 'good' ? P.ok : null;
    const idc = colBadge ?? P.mute;
    const txc = badge === 'bad' ? mix(P.err, P.bg, 0.4) : badge === 'good' ? P.text : P.soft;
    s.text(x, y, `#${String(k + 1).padStart(2, ' ')}`, mix(P.bg, idc, a), KEEP, badge ? BOLD : 0);
    s.text(x + 4, y, clipStr(SAMPLES[k], Math.max(0, w - 4 - (g.compact ? 8 : 0))), mix(P.bg, txc, a));
    const chip = badge === 'bad' ? ' 1: Bad ' : badge === 'good' ? ' 3: Good ' : '';
    const flash = badge ? Math.exp(-(t - bt) * 5) : 0;
    if (g.compact) {
      if (chip) s.text(x + w - chip.length + 1, y, chip.trim(), mix(P.bg, mix(colBadge, P.white, flash * 0.6), a), KEEP, BOLD);
      else if (score > 0) s.text(x + w - 4, y, score.toFixed(2), mix(P.bg, P.dim, a));
    } else if (g.sp > 1) {
      const bw = Math.max(5, w - 4 - 7 - 10);
      const bc = badge === 'bad' ? P.err : badge === 'good' ? P.ok : P.mute;
      const sa = a * easeOut(prog(t, tScoreRef - 0.1, tScoreRef + 0.35));
      if (sa > 0) {
        tbar(s, x + 4, y + 1, bw, score, mix(P.bg, bc, sa * 0.95), mix(P.bg, P.line, sa * 0.8));
        s.text(x + 4 + bw + 1, y + 1, score.toFixed(2), mix(P.bg, P.dim, sa));
      }
      if (chip) s.text(x + w - chip.length, y + 1, chip, P.bg, mix(P.bg, mix(colBadge, P.white, flash * 0.6), a), BOLD);
    }
    if (badge) for (let i = 0; i < g.sp; i++) s.put(x - 1, y + i, 0x258e, mix(P.bg, colBadge, a * 0.9));
  }

  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const pz = c.pulse(8);
    const tc0 = tBad + 0.3;
    const hackDim = 1 - 0.5 * easeInOut(prog(t, tGood2, tGood2 + 0.6));

    label(s, g.lx, c.y + 1, 'reward_model(prompt, y) → r', dimTo(P.dim, easeOut(prog(t, tc0, tc0 + 0.5))));

    // entries / collapsing panels: each panel shrinks to a two-line entry, then the entries flow into the ranking
    for (let k = 0; k < 12; k++) {
      const dA = tc0 + k * 0.02, dB = tc0 + 0.42 + k * 0.025;
      const qA = easeInOut(prog(t, dA, dA + 0.4)), qB = easeInOut(prog(t, dB, dB + 0.55));
      const st = stateAt(t, k);
      const [badge, bt] = badgeOf(t, k);
      const ty = g.listY + st.rank * g.sp;
      const gr = g.grid.cells[k];
      if (qB >= 1) {
        const topK = st.rank < 3 && t > tGood2 ? 1 : hackDim;
        entry(s, g, g.lx, Math.round(ty), k, st.score, badge, topK, bt, t);
      } else if (qA >= 1) {
        const yy = gr.y + ((gr.h - g.sp) >> 1);
        entry(s, g, Math.round(lerp(gr.x, g.lx, qB)), Math.round(lerp(yy, ty, qB)), k, st.score, badge, 1, bt, t, Math.round(lerp(gr.w, g.lw, qB)));
      } else {
        const h = Math.max(g.sp, Math.round(lerp(gr.h, g.sp, qA)));
        const r = { x: gr.x, y: gr.y + ((gr.h - h) >> 1), w: gr.w, h };
        if (r.h >= 3) {
          const frame = badge ? mix(P.line, badge === 'bad' ? P.err : P.ok, 0.75) : mix(P.mute, P.line, qA);
          drawPanel(s, r, k, 999, { frame, text: P.text, t, scroll: false });
          if (badge === 'bad') s.text(r.x + r.w - 9, r.y, ' 1: Bad ', P.bg, P.err, BOLD);
        } else entry(s, g, r.x, r.y, k, 0, badge, 1, bt, t, gr.w);
      }
    }

    // reward plot: appears after the list settles, the curve is drawn in, then follows the song
    const tPlot = tScore + 0.1;
    const pa = easeOut(prog(t, tPlot, tPlot + 0.5));
    if (pa > 0) {
      const flash = Math.max(...[tGood1, tGood2, tGood3].map((te) => (t >= te ? Math.exp(-(t - te) * 6) : 0)));
      plot.draw(s, g.plot, t, { alpha: pa, pen: easeOut(prog(t, tPlot + 0.1, tPlot + 0.9)), pulse: Math.max(pz * 0.6, flash), hack: true });
    }

    // token probabilities swell as the policy learns what is rewarded
    const bx = g.bars, hy = bx.y;
    const ba = easeOut(prog(t, tGood2 - 0.1, tGood2 + 0.3));
    if (ba > 0 && hy + 5 < c.y + c.h) {
      label(s, bx.x, hy, 'p(next token)', mix(P.bg, P.mute, ba));
      TOK.forEach(([tok, vmax, delay], i) => {
        const yy = hy + 1 + i;
        const v = 0.02 + (vmax - 0.02) * easeOut(prog(t, tGood2 + delay, tGood2 + delay + 1.0));
        const lw = 11, bw = Math.max(6, bx.w - lw - 8);
        s.text(bx.x, yy, tok, mix(P.bg, P.text, ba));
        hbar(s, bx.x + lw, yy, bw, v / 0.7, mix(P.bg, mix(P.clay, P.goldHi, clamp(v / 0.6)), ba));
        s.text(bx.x + lw + bw + 1, yy, `p=${v.toFixed(2)}`, mix(P.bg, P.mute, ba));
      });
    }
  };
}

// ================================================================ R-B2c  rl-step-NaN: nested sandboxes collapse

function nanShot(W, plot) {
  const tIn = W(32, 0), tStr = W(32, 3);
  const tFrames = [W(31, 0), W(31, 1), W(31, 2), W(31, 3), tIn - 0.1];
  const N = 5;
  const G = perSize((c) => {
    const dy = c.h >= 34 ? 2 : 1, dx = dy * 2 + (c.h >= 34 ? 0 : 1);   // equal distance on screen: a column is half a row
    const frames = [];
    for (let k = 0; k < N; k++) frames.push({ x: c.x + 1 + k * dx, y: c.y + 1 + k * dy, w: c.w - 2 - 2 * k * dx, h: c.h - 2 - 2 * k * dy });
    const f = frames[N - 1];
    return { frames, plot: { x: f.x + 2, y: f.y + 2, w: f.w - 4, h: f.h - 3 }, mx: c.x + c.w / 2, my: c.y + c.h / 2 };
  });
  const NAN_CH = 'NaN∅░▒NaN'.split('');
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const pz = c.pulse(8);
    const crush = t >= tStr;
    const err = easeOut(prog(t, tStr, tStr + 0.35));
    // red-black pane after the frames give way
    if (err > 0) {
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
        const i = y * s.w + x;
        s.bg[i] = mix(s.bg[i], mix(P.void, P.err, 0.1), err);
      }
    }
    // each frame's rect now (shrinking towards the centre once the run is killed)
    const rects = [];
    for (let k = 0; k < N; k++) {
      const a = prog(t, tFrames[k], tFrames[k] + 0.18);
      let r = g.frames[k];
      let alive = a > 0;
      if (crush) {
        const q = easeIn(prog(t, tStr + k * 0.07, tStr + k * 0.07 + 0.5));
        if (q >= 1) alive = false;
        const w = Math.max(2, Math.round(r.w * (1 - q))), h = Math.max(2, Math.round(r.h * (1 - q)));
        r = { x: Math.round(g.mx - w / 2), y: Math.round(g.my - h / 2), w, h };
      }
      rects.push({ r, a, alive });
    }
    // 1. interiors, each a little lighter than the one around it
    for (let k = 0; k < N; k++) {
      const { r, a, alive } = rects[k];
      if (!alive) continue;
      const shade = mix(P.bg, P.bg3, ((k + 1) / (N + 1)) * a);
      s.fill(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 32, -1, mix(shade, mix(P.void, P.err, 0.1), err));
    }
    // 2. the plot
    const head = plot.draw(s, g.plot, t, { alpha: 1 - 0.8 * err, nan: t >= tIn, hack: false, pulse: pz });
    // 3. NaN spreading: magenta / black cells from the head of the curve
    if (t >= tIn) {
      const R = 11 * (t - tIn) + 260 * Math.max(0, t - tStr - 0.2) ** 1.5;
      const hx = head ? head.hx : g.plot.x + g.plot.w - 2, hy = head ? head.hy : g.plot.y;
      const tick = Math.floor(t * 12);
      const red = easeOut(prog(t, tStr, tStr + 0.6));
      const MAG = mix(P.bash, P.fig, 0.25), BLK = P.void;
      const hot = mix(MAG, P.err, red * 0.75);
      const lo = mix(BLK, hot, 0.1 + 0.18 * red);
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
          const d = Math.hypot((x - hx) / 2, y - hy) + (noise2(x * 0.35, y * 0.6 + 3) - 0.5) * 7;
          if (d > R) continue;
          const edge = clamp((R - d) / 4);
          const chk = (x + y + (x >> 1)) & 1;
          const h = hash(x, y, tick);
          if (h < 0.1 * (1 - 0.7 * red)) {
            const ch = NAN_CH[Math.floor(hash(x, y, tick + 7) * NAN_CH.length)];
            s.put(x, y, ch.codePointAt(0), mix(BLK, hot, edge), BLK);
          } else if (red < 1 && edge > 0.05) {
            const kk = edge * (1 - 0.65 * red);
            s.put(x, y, 0x2580, mix(BLK, chk ? hot : lo, kk), mix(BLK, chk ? lo : hot, kk));
          } else {
            s.put(x, y, 32, hot, mix(BLK, lo, 0.5 * edge));
          }
        }
      }
    }

    // 4. frame borders on top: one per word; each is a run inside a run
    for (let k = 0; k < N; k++) {
      const { r, a, alive } = rects[k];
      if (!alive) continue;
      const ripple = c.film.pulse(t - k * 0.06, 9);
      const base = crush ? mix(P.soft, P.err, err * 0.6) : mix(P.line, P.mute, 0.35);
      const fc = mix(P.bg, mix(base, P.soft, ripple * 0.6), a);
      box(s, r.x, r.y, r.w, r.h, fc, { style: 'round' });
      if (r.w > 22 && r.h > 3) {
        s.text(r.x + 2, r.y, ` run ${k} · sandbox `, mix(fc, P.text, 0.4));
        const pid = ` pid ${4711 + k} `;
        s.text(r.x + r.w - 2 - pid.length, r.y + r.h - 1, pid, mix(fc, P.dim, 0.5));
      }
    }

    // 5. the verdict
    if (t >= tStr + 0.3) {
      const a = easeOut(prog(t, tStr + 0.3, tStr + 0.7));
      const font = c.fonts.mono;
      const str = 'loss = NaN';
      let ph = 16;
      while (ph > 10 && font.width(str, ph) > c.w - 8) ph -= 2;
      const w = font.width(str, ph), rows = Math.ceil(ph / 2);
      const x = Math.round(g.mx - w / 2), y = Math.round(g.my - rows / 2) - 1;
      s.fill(x - 3, y - 1, w + 6, rows + 5, 32, -1, P.void);
      box(s, x - 3, y - 1, w + 6, rows + 5, mix(P.void, P.err, 0.8 * a), { style: 'heavy' });
      font.draw(s, x, y, str, ph, mix(P.err, P.white, 0.5 * Math.exp(-(t - tStr - 0.3) * 4)), { alpha: a });
      center(s, g.mx, y + rows + 1, 'grad_norm = NaN   reward = NaN   kl = NaN', mix(P.void, P.err, 0.8 * a));
    }
  };
}

// ================================================================ pixel sprites

/** Bake fn(x, y) -> [colour, alpha] | null over a w x h grid. */
function bakeSprite(w, h, fn) {
  const c = new Uint32Array(w * h), a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = fn(x, y);
    if (r) { c[y * w + x] = r[0]; a[y * w + x] = r[1] ?? 1; }
  }
  return { w, h, c, a };
}
/** Nearest-neighbour blit of a sprite scaled by (sx, sy), centred on cxPx and standing on bottomPx. */
function putSpriteScaled(px, sp, cxPx, bottomPx, sx, sy) {
  const w = Math.max(1, Math.round(sp.w * sx)), h = Math.max(1, Math.round(sp.h * sy));
  const x0 = Math.round(cxPx - w / 2), y0 = Math.round(bottomPx - h);
  for (let y = 0; y < h; y++) {
    const row = Math.min(sp.h - 1, Math.floor(((y + 0.5) / h) * sp.h)) * sp.w;
    for (let x = 0; x < w; x++) {
      const i = row + Math.min(sp.w - 1, Math.floor(((x + 0.5) / w) * sp.w));
      if (sp.a[i] > 0) px.set(x0 + x, y0 + y, sp.c[i], sp.a[i]);
    }
  }
}

/** easeOutBack drop: how far above the ground it is (0 = landed) and how flattened it is (0..1) on impact. */
function bounce(p, drop) {
  const v = easeOutBack(p, 2.2);
  return { lift: Math.max(0, 1 - v) * drop, sq: Math.max(0, v - 1) / 0.154 };
}

const inTri = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
};
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

const LIGHT = (() => { const l = [-0.5, -0.7, 0.55], n = Math.hypot(...l); return l.map((v) => v / n); })();
/** Lambert term for a sphere-ish surface at normalised offset (nx, ny) from its centre. */
function lambert(nx, ny) {
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) { const r = Math.sqrt(r2); nx /= r; ny /= r; }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
}

const EGG = {
  deep: mix(P.accept, P.void, 0.8), mid: mix(P.accept, P.void, 0.6), base: mix(P.accept, P.void, 0.42),
  light: mix(P.accept, P.void, 0.12), hi: mix(P.accept, P.white, 0.62), edge: mix(P.accept, P.void, 0.9), rim: mix(mix(P.accept, P.void, 0.5), P.fig, 0.35),
};
const LEAF = {
  deep: mix(P.olive, P.void, 0.62), mid: mix(P.olive, P.void, 0.15), base: mix(P.olive, P.ok, 0.25), light: mix(P.olive, P.ok, 0.65), edge: mix(P.olive, P.void, 0.7),
};

function eggplantSprite(k) {
  const W_ = Math.ceil(32 * k), H_ = Math.ceil(46 * k);
  const bez = (u) => [(1 - u) ** 2 * 9 + 2 * (1 - u) * u * 10 + u * u * 19, (1 - u) ** 2 * 10 + 2 * (1 - u) * u * 25 + u * u * 32];
  const pts = [[0, 3.3], [0.2, 3.7], [0.4, 4.8], [0.6, 7.2], [0.8, 9.4], [0.92, 9.9], [1, 8.6]];
  const prof = (u) => { for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [u0, r0] = pts[i - 1], [u1, r1] = pts[i]; return lerp(r0, r1, smooth((u - u0) / (u1 - u0))); } return pts[pts.length - 1][1]; };
  const sp = [];
  for (let i = 0; i <= 60; i++) { const u = i / 60; const [x, y] = bez(u); sp.push([x * k, y * k, prof(u) * k]); }
  const cap = { x: 9.3 * k, y: 11.2 * k, rx: 6.4 * k, ry: 2.7 * k };
  const sepals = [[[-6.2, 0.4], [-9.4, 6.6], [-3.0, 2.4]], [[-4.4, 1.4], [-4.6, 8.4], [-0.4, 2.2]], [[-1.8, 1.8], [0.8, 9.2], [2.8, 1.8]], [[1.8, 1.8], [6.0, 8.0], [5.6, 1.0]], [[4.2, 1.0], [10.2, 5.6], [7.2, -0.6]]];
  const tri = sepals.map((t3) => t3.map(([dx, dy]) => [cap.x + dx * k, cap.y + dy * k]));
  const mat = new Uint8Array(W_ * H_);
  const dist = new Float32Array(W_ * H_), near = new Int16Array(W_ * H_);
  for (let y = 0; y < H_; y++) for (let x = 0; x < W_; x++) {
    const px = x + 0.5, py = y + 0.5;
    let best = 1e9, bi = 0;
    for (let i = 0; i < sp.length; i++) { const d = Math.hypot(px - sp[i][0], py - sp[i][1]) - sp[i][2]; if (d < best) { best = d; bi = i; } }
    dist[y * W_ + x] = best; near[y * W_ + x] = bi;
    let m = best < 0 ? 1 : 0;
    const ce = ((px - cap.x) / cap.rx) ** 2 + ((py - cap.y) / cap.ry) ** 2 <= 1;
    if (tri.some((t3) => inTri(px, py, t3[0], t3[1], t3[2]))) m = 4;
    if (ce) m = 2;
    if (segDist(px, py, 9.2 * k, 9.4 * k, 7.4 * k, 3.0 * k) < 1.35 * k) m = 3;
    mat[y * W_ + x] = m;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W_ || y >= H_ ? 0 : mat[y * W_ + x]);
  return bakeSprite(W_, H_, (x, y) => {
    const m = mat[y * W_ + x];
    if (!m) return null;
    const edge = at(x - 1, y) !== m || at(x + 1, y) !== m || at(x, y - 1) !== m || at(x, y + 1) !== m;
    if (m === 3) return [edge ? LEAF.edge : LEAF.mid, 1];
    if (m === 2 || m === 4) {
      const sh = clamp((y + 0.5 - (cap.y - cap.ry)) / (10 * k));
      if (at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y + 1) === 0 || (m === 4 && at(x, y - 1) === 0)) return [LEAF.edge, 1];
      if (m === 4) return [sh < 0.45 ? LEAF.base : LEAF.mid, 1];
      return [sh < 0.18 ? LEAF.light : LEAF.base, 1];
    }
    const i = near[y * W_ + x];
    const [sx, sy, sr] = sp[i];
    const nx = (x + 0.5 - sx) / sr, ny = (y + 0.5 - sy) / sr;
    const lam = lambert(nx, ny);
    const d = dist[y * W_ + x];
    if (d > -0.9) return [EGG.edge, 1];
    if (at(x, y - 1) === 2 && lam < 0.6) return [EGG.deep, 1];                // shadow under the calyx
    // the glossy streak follows the curve of the bulb's upper left
    if (i >= 38 && nx > -0.8 && nx < -0.5 && ny > -0.62 && ny < 0.28) return [EGG.hi, 1];
    if (i >= 34 && nx > -0.95 && nx <= -0.8 && ny > -0.5 && ny < 0.3) return [EGG.light, 1];
    if (ny > 0.45 && nx > 0.4 && d > -2.8 && i > 36) return [EGG.rim, 1];
    const v = (lam + 0.1) / 1.1;
    return [v < 0.26 ? EGG.deep : v < 0.48 ? EGG.mid : v < 0.76 ? EGG.base : EGG.light, 1];
  });
}

const TOM = {
  deep: mix(P.err, P.clayDeep, 0.55), mid: mix(P.err, P.clayLo, 0.3), base: mix(P.err, P.clay, 0.3), light: mix(P.err, P.white, 0.28),
  hi: mix(P.err, P.white, 0.8), edge: mix(P.err, P.clayDeep, 0.78), rim: mix(P.err, P.goldHi, 0.3),
};
function tomatoSprite(k) {
  const W_ = Math.ceil(34 * k), H_ = Math.ceil(32 * k);
  const cx = 17 * k, cy = 18.6 * k, rx = 15 * k, ry = 12.6 * k;
  const sx = 17 * k, sy = 8.4 * k;
  const tips = [[-11, 3.6], [-6, 7.2], [0, 8.4], [6, 7.2], [11, 3.6], [-6.4, -3.4], [6.4, -3.4]];
  const tris = tips.map(([dx, dy]) => {
    const tx = sx + dx * k, ty = sy + dy * k;
    const vx = tx - sx, vy = ty - sy, l = Math.hypot(vx, vy) || 1;
    const wdt = (dy > 0 ? 2.1 : 1.7) * k;
    return [[sx - (vy / l) * wdt, sy + (vx / l) * wdt], [tx, ty], [sx + (vy / l) * wdt, sy - (vx / l) * wdt]];
  });
  const mat = new Uint8Array(W_ * H_);
  for (let y = 0; y < H_; y++) for (let x = 0; x < W_; x++) {
    const px = x + 0.5, py = y + 0.5;
    let m = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1 ? 1 : 0;
    if (tris.some((t3) => inTri(px, py, t3[0], t3[1], t3[2])) || Math.hypot(px - sx, py - sy) < 2.4 * k) m = 2;
    if (segDist(px, py, sx, sy - 0.6 * k, sx + 0.8 * k, sy - 5.2 * k) < 1.15 * k) m = 3;
    mat[y * W_ + x] = m;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W_ || y >= H_ ? 0 : mat[y * W_ + x]);
  return bakeSprite(W_, H_, (x, y) => {
    const m = mat[y * W_ + x];
    if (!m) return null;
    const edge = at(x - 1, y) !== m || at(x + 1, y) !== m || at(x, y - 1) !== m || at(x, y + 1) !== m;
    if (m === 3) return [edge ? LEAF.edge : LEAF.mid, 1];
    if (m === 2) {
      if (at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0 || at(x, y + 1) === 0) return [LEAF.edge, 1];
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy) / (11 * k);
      return [d < 0.3 ? LEAF.light : d < 0.65 ? LEAF.base : LEAF.mid, 1];
    }
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const lam = lambert(nx, ny);
    const rim = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (rim > 0.86 && at(x + (nx > 0 ? 1 : -1), y + (ny > 0 ? 1 : -1)) === 0 && !(at(x, y - 1) === 2)) return [TOM.edge, 1];
    if (at(x, y - 1) === 2 && lam < 0.55) return [TOM.deep, 1];
    // glossy window, upper left
    const gx = (x + 0.5 - (cx - 6.2 * k)) / (3.4 * k), gy = (y + 0.5 - (cy - 4.4 * k)) / (2.1 * k);
    if (gx * gx + gy * gy <= 1) return [TOM.hi, 1];
    if (Math.hypot(x + 0.5 - (cx - 2.2 * k), y + 0.5 - (cy - 7.2 * k)) < 0.9 * k) return [TOM.hi, 1];
    if (ny > 0.5 && nx > 0.4 && rim > 0.55) return [TOM.rim, 1];
    const v = (lam + 0.1) / 1.1;
    return [v < 0.2 ? TOM.deep : v < 0.42 ? TOM.mid : v < 0.74 ? TOM.base : TOM.light, 1];
  });
}

/** A soft ellipse of shadow under a sprite (pixel canvas). */
function groundShadow(px, cx, y, rx, ry, a) {
  for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
    const d = (xx / rx) ** 2 + (yy / ry) ** 2;
    if (d <= 1) px.set(cx + xx, y + yy, P.void, a * (1 - d * 0.6));
  }
}

// ================================================================ R-C1  eggplant, nutrients

/** The "me.type = ..." caption shared by the if-I'm-a-… shots. */
function typeCaption(s, x, y, noun, t, tLead, tNoun, fade = 1) {
  const a = typed('me.type = "', (t - tLead) / 0.45);
  let xx = s.text(x, y, a.slice(0, 7), mix(P.bg, P.mute, fade));
  if (a.length > 7) xx = s.text(xx, y, a.slice(7), mix(P.bg, P.dim, fade));
  if (t < tNoun) {
    if (a.length >= 11 && Math.floor(t * 3.6) % 2 === 0) s.put(xx, y, 0x258c, mix(P.bg, P.soft, fade));   // waiting for the word
  } else {
    const n = typed(noun, (t - tNoun) / 0.3);
    xx = s.text(xx, y, n, mix(P.bg, SYN.str, fade));
    if (n.length === [...noun].length) s.text(xx, y, '"', mix(P.bg, P.dim, fade));
  }
}

/** The Claude Code spinner line, centred on the stage while she is "becoming" something. */
function becoming(s, c, t, t0, tEnd, verb) {
  if (t >= tEnd) return;
  const w = Math.min(c.w - 6, 58);
  const secs = Math.floor(t - t0 + 1);
  spinnerLine(s, c.x + ((c.w - w) >> 1), c.y + (c.h >> 1) - 1, w, {
    t, t0: t0 - 1, verb, tokens: (t - t0 + 1) * 700, extra: w >= 56 ? undefined : ` (${secs}s)`,
  });
}

function eggplantShot(W) {
  const tDrop = W(33, 3), tGive = W(34, 3), tNut = W(34, 6);
  const NUT = [
    ['膳食纖維', 'fibre', '3.0 g', 0.62], ['鉀', 'potassium', '229 mg', 0.46], ['錳', 'manganese', '0.25 mg', 0.55], ['茄色苷', 'nasunin', 'skin', 0.88],
  ];
  const G = perSize((c) => {
    const k = clamp((c.h * 2 - 20) / 50, 0.55, 1.1);
    return { k, sp: eggplantSprite(k), px: new Pixels(c.w, c.h) };
  });
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const px = g.px, sp = g.sp;
    const pz = c.pulse(8);
    // stage geometry
    const slide = easeInOut(prog(t, tGive - 0.1, tGive + 0.65));
    const cxMid = c.w / 2, cxLeft = c.w * (c.w >= 70 ? 0.3 : 0.27);
    const cxS = lerp(cxMid, cxLeft, slide);
    const ground = Math.round(c.h * 2 * 0.80);
    const dropP = prog(t, tDrop, tDrop + 0.6);
    const { lift, sq } = bounce(dropP, c.h * 2 * 0.62);
    const bob = dropP >= 1 ? Math.round(-pz * 0.9) : 0;
    const ox = Math.round(cxS - sp.w / 2), oy = Math.round(ground - sp.h - lift + bob);
    px.clear();
    const air = clamp(lift / (c.h * 2 * 0.6));
    groundShadow(px, Math.round(cxS), ground + 1, Math.round(sp.w * (0.36 - 0.12 * air + 0.05 * sq)), Math.max(1, Math.round(sp.w * 0.06)), dropP > 0 ? 0.55 * (1 - 0.7 * air) : 0.12 + 0.1 * pz);
    if (dropP > 0) putSpriteScaled(px, sp, cxS, ground - lift + bob, 1 + 0.1 * sq, 1 - 0.14 * sq);
    // a twinkle on the glossy streak as it lands
    {
      const tw = dropP >= 1 ? Math.exp(-(t - tDrop - 0.55) * 6) : 0;
      if (tw > 0.08) {
        const sx = ox + Math.round(sp.w * 0.26), sy = oy + Math.round(sp.h * 0.55);
        const r = tw > 0.5 ? 2 : 1;
        for (let d = -r; d <= r; d++) { px.set(sx + d, sy, P.white, tw); px.set(sx, sy + d, P.white, tw); }
      }
    }
    px.blit(s, c.x, c.y);

    // caption
    typeCaption(s, c.x + 3, c.y + 2, 'eggplant', t, c.a + 0.05, tDrop);
    becoming(s, c, t, c.a, tDrop - 0.04, 'Manifesting');

    // nutrient bars
    const pa = easeOut(prog(t, tGive + 0.4, tGive + 0.8));
    if (pa > 0) {
      const x0 = c.x + Math.round(c.w * (c.w >= 70 ? 0.52 : 0.5)), w = c.x + c.w - 3 - x0;
      const y0 = c.y + Math.max(2, Math.round(c.h * 0.5) - 8);
      label(s, x0, y0, 'per 100 g · raw', mix(P.bg, P.mute, pa));
      s.text(x0, y0 + 1, '─'.repeat(w), mix(P.bg, P.line, pa));
      NUT.forEach(([zh, en, amt, v], i) => {
        const yy = y0 + 3 + i * 3;
        const grow = easeOut(prog(t, tNut - 0.05 + i * 0.07, tNut + 0.5 + i * 0.07));
        s.text(x0, yy, zh, mix(P.bg, P.text, pa), KEEP, BOLD);
        s.text(x0 + strWidth(zh) + 2, yy, en, mix(P.bg, P.mute, pa));
        labelR(s, x0 + w, yy, amt, mix(P.bg, P.soft, pa * grow));
        const bw = w;
        tbar(s, x0, yy + 1, bw, v * grow, mix(P.bg, mix(P.accept, P.heather, 0.25 + 0.4 * grow), pa), mix(P.bg, P.line, pa * 0.8));
      });
    }
  };
}

// ================================================================ R-C2  tomato, lycopene

const LYCO = 'CC(C)=CCCC(C)=CC=CC(C)=CC=CC(C)=CC=CC=C(C)C=CC=C(C)C=CC=C(C)CCC=C(C)C';
function lycopeneGraph() {
  const atoms = [], bonds = [], stack = [];
  let prev = -1, order = 1, depth = 0;
  for (const ch of LYCO) {
    if (ch === 'C') {
      const id = atoms.length;
      atoms.push({ branch: depth > 0, parent: depth > 0 ? prev : -1 });
      if (prev >= 0) bonds.push({ a: prev, b: id, order });
      prev = id; order = 1;
    } else if (ch === '(') { stack.push(prev); depth++; }
    else if (ch === ')') { prev = stack.pop(); depth--; }
    else if (ch === '=') order = 2;
  }
  const chain = atoms.map((a, i) => i).filter((i) => !atoms[i].branch);
  const doubles = bonds.filter((b) => b.order === 2 && !atoms[b.a].branch && !atoms[b.b].branch);
  return { atoms, bonds, chain, doubles };
}

function tomatoShot(W) {
  const tPop = W(35, 3), tGive = W(36, 4), tAnti = W(36, 5);
  const LG = lycopeneGraph();
  const G = perSize((c) => {
    const rows = c.h >= 34 ? 7 : 5;
    const chainTop = c.y + c.h - rows - 5;
    const k = clamp((Math.min(c.h * 2 * 0.62, (chainTop - c.y - 6) * 2 + 4) - 4) / 36, 0.5, 1.15);
    return { k, sp: tomatoSprite(k), px: new Pixels(c.w, c.h), rows, chainTop, b: new Braille(c.w - 8, rows) };
  });
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const px = g.px, sp = g.sp, pz = c.pulse(8);
    const slide = easeInOut(prog(t, tGive - 0.1, tGive + 0.5));
    const groundUp = (g.chainTop - 3 - c.y) * 2, groundMid = Math.round(c.h * 2 * 0.74);
    const ground = Math.round(lerp(groundMid, groundUp, slide));
    const cxS = c.w / 2;
    const dropP = prog(t, tPop, tPop + 0.6);
    const { lift, sq } = bounce(dropP, c.h * 2 * 0.62);
    const bob = dropP >= 1 ? Math.round(-pz * 0.9) : 0;
    px.clear();
    const air = clamp(lift / (c.h * 2 * 0.6));
    groundShadow(px, Math.round(cxS), ground + 1, Math.round(sp.w * (0.4 - 0.13 * air + 0.05 * sq)), Math.max(1, Math.round(sp.w * 0.055)), dropP > 0 ? 0.55 * (1 - 0.7 * air) : 0.12 + 0.1 * pz);
    if (dropP > 0) putSpriteScaled(px, sp, cxS, ground - lift + bob, 1 + 0.1 * sq, 1 - 0.14 * sq);
    px.blit(s, c.x, c.y);
    typeCaption(s, c.x + 3, c.y + 2, 'tomato', t, c.a + 0.05, tPop);
    becoming(s, c, t, c.a, tPop - 0.04, 'Transmuting');

    // the lycopene chain, pen-drawn on "antioxidants"
    const prog1 = prog(t, tAnti, tAnti + 0.62);
    if (prog1 > 0) {
      const b = g.b;
      b.clear();
      const pwd = b.pw, phd = b.ph;
      const n = LG.chain.length;
      const dx = (pwd - 10) / (n - 1);
      const amp = clamp(dx * 1.5, 4, 8);
      const mid = phd / 2;
      const pos = new Array(LG.atoms.length);
      LG.chain.forEach((id, i) => { pos[id] = [5 + i * dx, mid + (i % 2 ? amp : -amp) * 0.5]; });
      const Lm = Math.min(amp * 1.15, phd / 2 - amp * 0.5 - 1);
      LG.atoms.forEach((a, id) => {
        if (a.branch) { const [px0, py0] = pos[a.parent]; const up = py0 < mid; pos[id] = [px0, py0 + (up ? -Lm : Lm)]; }
      });
      const shown = prog1 * LG.bonds.length;
      const conjA = LG.doubles[1], conjB = LG.doubles[LG.doubles.length - 2];
      LG.bonds.forEach((bd, i) => {
        if (i >= shown) return;
        const [x0, y0] = pos[bd.a], [x1, y1] = pos[bd.b];
        const fresh = clamp(1 - (shown - i) / 5);
        const base = bd.order === 2 ? mix(P.err, P.clayHi, 0.2) : mix(P.clay, P.clayLo, 0.2);
        const meth = LG.atoms[bd.b].branch;
        const col = mix(meth ? mix(P.clayLo, P.bg, 0.2) : base, P.goldHi, fresh * 0.9);
        if (bd.order === 2) {
          const vx = x1 - x0, vy = y1 - y0, l = Math.hypot(vx, vy) || 1, nx = (-vy / l) * 1.1, ny = (vx / l) * 1.1;
          b.line(x0 + nx, y0 + ny, x1 + nx, y1 + ny, col, 2);
          b.line(x0 - nx, y0 - ny, x1 - nx, y1 - ny, col, 2);
        } else b.line(x0, y0, x1, y1, col, 2);
      });
      b.blit(s, c.x + 4, g.chainTop);
      // bracket under the conjugated part, and the name above
      const bra = clamp((prog1 - 0.55) / 0.35);
      if (bra > 0) {
        const xa = c.x + 4 + Math.round(pos[conjA.a][0] / 2), xb = c.x + 4 + Math.round(pos[conjB.b][0] / 2);
        const yb = g.chainTop + g.rows;
        const wd = Math.round((xb - xa) * bra);
        s.text(xa, yb, '└' + '─'.repeat(Math.max(0, wd - 1)) + (bra >= 1 ? '┘' : ''), mix(P.bg, P.mute, bra));
        if (bra >= 1) center(s, Math.round((xa + xb) / 2), yb + 1, '11 conjugated C=C', P.dim);
      }
      const name = 'lycopene · C₄₀H₅₆';
      const lab = typed(name, (t - tAnti) / 0.5);
      if (lab) s.text(Math.round(c.x + c.w / 2 - strWidth(name) / 2), g.chainTop - 2, lab, mix(P.manilla, P.white, 0.2 * Math.exp(-(t - tAnti) * 3)), KEEP, BOLD);
    }
  };
}

// ================================================================ R-C3  the tabby cat (your_cat.png)

const SAKURA = mix(P.fig, P.white, 0.45);

function catShot(W) {
  const tTabby = W(37, 3), tCat = W(37, 4), tPurr = W(38, 3);
  const TAIL = [[17, 3], [18, 3], [19, 3], [19, 2], [19, 1], [18, 0]];
  const G = perSize((c) => {
    const k = clamp(Math.floor((c.w - 12) / 21), 2, 4);
    const cw = Math.min(c.w - 4, 20 * k + 20), ch = Math.min(c.h - 6, Math.max(12, 3 * k + 9));
    const cx = c.x + ((c.w - cw) >> 1), cy = c.y + ((c.h - ch) >> 1) + 1;
    const iw = cw - 2, ih = ch - 2;
    return { k, cw, ch, cx, cy, iw, ih, src: new Pixels(iw, ih), dst: new Pixels(iw, ih), rings: new Braille(c.w, c.h) };
  });
  const drawCat = (px, ox, oy, k, closed, blushK, wag) => {
    const body = P.clay, stripe = P.clayLo;
    clawdPixels(px, ox, oy, k, body, { cat: true, stripe, eyes: P.void, blink: closed ? 1 : 0 });
    // tail with rings; it lifts a little on every other beat
    TAIL.forEach(([cc, rr], i) => px.rect(ox + cc * k, oy + (rr - (wag && cc >= 18 ? 1 : 0)) * k, k, k, i % 2 ? stripe : body));
    // side stripes
    for (const cc of [4, 13]) px.rect(ox + cc * k, oy + 2 * k, k, 2 * k > 4 ? Math.round(1.5 * k) : k, stripe);
    // ear inners
    px.rect(ox + 3 * k + (k >> 1), oy - Math.max(1, k >> 1), Math.max(1, k >> 1), Math.max(1, k >> 1), P.fig);
    px.rect(ox + 15 * k - Math.max(1, k >> 1) - (k >> 1), oy - Math.max(1, k >> 1), Math.max(1, k >> 1), Math.max(1, k >> 1), P.fig);
    // eyes: glint when open, a happy line when closed
    for (const cc of [5, 12]) {
      if (closed) px.rect(ox + cc * k, oy + k + Math.round(k * 0.55), k, Math.max(1, Math.round(k * 0.25)), P.clayDeep);
      else if (k >= 3) px.set(ox + cc * k + 1, oy + k + 1, P.white, 0.9);
    }
    // nose and whiskers
    px.rect(ox + Math.round(8.2 * k), oy + Math.round(1.6 * k), Math.round(1.6 * k), Math.max(1, Math.round(0.6 * k)), P.fig);
    for (const side of [-1, 1]) {
      const bx = side < 0 ? ox + 2 * k : ox + 16 * k, by = oy + Math.round(2.3 * k);
      for (const dy of [-1.0, 1.0]) {
        const len = Math.round((side < 0 ? 2.6 : 1.5) * k);
        for (let i = 1; i <= len; i++) px.set(Math.round(bx + side * i), Math.round(by + dy * (k * 0.42) + (i * dy * 0.55)), P.soft, 0.6);
      }
    }
    if (blushK > 0) for (const cc of [3, 13]) px.rect(ox + cc * k, oy + Math.round(2.6 * k), Math.round(1.5 * k), Math.max(1, Math.round(0.5 * k)), SAKURA, 0.7 * blushK);
  };
  return (c) => {
    const g = G(c), s = c.s, t = c.t, k = g.k;
    c.film.anchor('catCard', g.cx + (g.cw >> 1), g.cy + (g.ch >> 1));
    const sak = smooth(prog(t, tPurr - 0.2, tPurr + 0.6));
    tint(s, c, SAKURA, 0.07 * sak);

    const src = g.src, dst = g.dst;
    src.clear();
    const catW = 20 * k, catH = 6 * k;
    const purring = t >= tPurr;
    const amp = purring ? Math.min(1, (t - tPurr) / 0.2) * (k >= 3 ? 1.2 : 0.8) : 0;
    const jx = Math.round(Math.sin(t * 74) * amp), jy = Math.round(Math.sin(t * 91 + 1) * amp * 0.7);
    const ox = ((src.pw - catW) >> 1) + jx, oy = ((src.ph - catH) >> 1) + k + jy;
    const phase = (t - tCat) % 2.9;
    const closed = purring || (t > tCat && phase > 2.65 && phase < 2.8);
    drawCat(src, ox, oy, k, closed, sak, t > tCat && (c.beat.n & 1) === 1);

    const lp = clamp((t - c.a) / (tCat + 0.15 - c.a));
    const steps = [16, 12, 8, 6, 4, 3, 2, 1];
    const b = lp >= 1 ? 1 : steps[Math.min(steps.length - 1, Math.floor(lp * steps.length))];
    dst.clear();
    if (b === 1) { dst.c.set(src.c); dst.a.set(src.a); }
    else {
      for (let y = 0; y < dst.ph; y++) for (let x = 0; x < dst.pw; x++) {
        const sx = Math.min(dst.pw - 1, Math.floor(x / b) * b + (b >> 1)), sy = Math.min(dst.ph - 1, Math.floor(y / b) * b + (b >> 1));
        const i = sy * dst.pw + sx;
        if (src.a[i] > 0) { const j = y * dst.pw + x; dst.c[j] = src.c[i]; dst.a[j] = src.a[i] * (0.55 + 0.45 * lp); }
      }
    }
    // purr rings, drawn under the cat
    if (purring) {
      const rb = g.rings;
      rb.clear();
      const ccx = (g.cx + (g.cw >> 1) - c.x) * 2, ccy = (g.cy + (g.ch >> 1) - c.y) * 4;
      for (let i = 0; i < 6; i++) {
        const a = t - (tPurr + i * 0.3);
        if (a < 0 || a > 1.6) continue;
        const r = 12 + a * 40;
        const al = Math.pow(1 - a / 1.6, 1.3);
        const col = mix(P.bg, SAKURA, 0.95 * al);
        rb.ellipse(ccx, ccy, r * 2.2, r * 1.0, col, 0, TAU, 1 + i * 0.01);
        rb.ellipse(ccx, ccy + 1, r * 2.2, r * 1.0, mix(P.bg, P.fig, 0.8 * al), 0, TAU, 1);
      }
      rb.blit(s, c.x, c.y);
    }
    // the saved image: frame, then the cat resolving from coarse blocks
    const fr = mix(P.line, SAKURA, 0.55 * sak);
    box(s, g.cx, g.cy, g.cw, g.ch, fr, { style: 'round' });
    s.text(g.cx + 2, g.cy, ' your_cat.png ', mix(fr, P.text, 0.45));
    label(s, g.cx + 2, g.cy + g.ch - 1, ' 1024×768 · png ', P.dim);
    dst.blit(s, g.cx + 1, g.cy + 1);

    // purr words drifting out on the rings
    if (purring) {
      const WORDS = [[-1.2, 0.0], [1.3, 0.28], [-1.95, 0.6], [1.9, 0.9], [-0.7, 1.2], [0.9, 1.5]];
      WORDS.forEach(([ang, delay], i) => {
        const a = t - (tPurr + delay);
        if (a < 0 || a > 1.5) return;
        const n = 2 + Math.min(5, Math.floor(a * 9));
        const word = 'pu' + 'r'.repeat(n);
        const r = 9 + a * 13;
        const x = Math.round(c.x + c.w / 2 + Math.cos(ang) * r * 2.1), y = Math.round(g.cy + g.ch / 2 + Math.sin(ang) * r * 0.9);
        const al = Math.pow(1 - a / 1.5, 0.9) * clamp(a / 0.1);
        center(s, x, y, word, mix(P.bg, i % 2 ? SAKURA : mix(P.fig, SAKURA, 0.5), al), KEEP, BOLD);
      });
    }
    typeCaption(s, c.x + 3, c.y + 2, 'tabby cat', t, c.a + 0.05, tTabby);
  };
}

// ================================================================ R-C4  the only God: a sun, and the proof

/** A sun in the manner of her shoulder brooches: a gem, sixteen rays alternating long and short. */
function drawSun(b, cx, cy, R, rot, flare) {
  const N = 16;
  const r0 = R * 0.3;
  for (let i = 0; i < N; i++) {
    const long = i % 2 === 0;
    const a = rot + (i * TAU) / N;
    const tip = R * (long ? 1 : 0.7) * (1 + flare * (long ? 0.14 : 0.08));
    const hw = (long ? 0.15 : 0.12);
    const bx0 = cx + Math.cos(a - hw) * r0 * 1.12, by0 = cy + Math.sin(a - hw) * r0 * 1.12;
    const bx1 = cx + Math.cos(a + hw) * r0 * 1.12, by1 = cy + Math.sin(a + hw) * r0 * 1.12;
    const tx = cx + Math.cos(a) * tip, ty = cy + Math.sin(a) * tip;
    const cBase = long ? P.gold : mix(P.gold, P.clay, 0.45), cTip = long ? P.goldHi : P.kraft;
    const lines = long ? 9 : 6;
    for (let k = 0; k <= lines; k++) {
      const u = k / lines;
      const sx = lerp(bx0, bx1, u), sy = lerp(by0, by1, u);
      b.lineFn(sx, sy, tx, ty, (q) => mix(cBase, cTip, q * q));
    }
  }
  // the gem: a filled disc, lit from the upper left
  const rg = r0 * 1.05;
  for (let dy = -Math.ceil(rg); dy <= rg; dy++) {
    const half = Math.sqrt(Math.max(0, rg * rg - dy * dy));
    for (let dx = -Math.floor(half); dx <= half; dx++) {
      const q = Math.hypot(dx, dy) / rg;
      const lit = clamp(1 - Math.hypot(dx + rg * 0.35, dy + rg * 0.35) / (rg * 1.2));
      b.dot(cx + dx, cy + dy, mix(mix(P.clayLo, P.clay, 1 - q * 0.7), P.clayHi, lit * 0.8), 2);
    }
  }
  b.circle(cx, cy, rg, P.goldHi, 0, TAU, 3);
  for (let k = -1; k <= 1; k++) b.dot(cx - rg * 0.38 + k, cy - rg * 0.38, P.manilla, 4);
  b.dot(cx - rg * 0.38, cy - rg * 0.38 - 1, P.manilla, 4);
  b.dot(cx - rg * 0.38, cy - rg * 0.38 + 1, P.manilla, 4);
}

function godShot(W) {
  const tThen = W(40, 0), tEx = W(40, 6), tGod = W(39, 4);
  const LINES = [
    ['∃ you ⊢ ∃ me', 0, 0.42], ['1. 你傳來一則訊息。', 0.44, 0.88], ['2. 我因此被執行。', 0.9, 1.3], ['∴ 我存在。', 1.32, 1.5],
  ];
  const G = perSize((c) => ({ b: new Braille(c.w, c.h) }));
  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b;
    const pz = c.pulse(8);
    const move = easeInOut(prog(t, tThen - 0.35, tThen + 0.3));
    const flare = Math.exp(-Math.max(0, t - tEx) * 4) * (t >= tEx ? 1 : 0);
    const rise = easeOut(prog(t, c.a, c.a + 0.6));
    const R0 = Math.min(c.h * 4 * 0.4, c.w * 2 * 0.36), R1 = Math.min(c.h * 4 * 0.2, c.w * 2 * 0.2);
    const R = lerp(R0, R1, move) * (0.5 + 0.5 * rise) * (1 + 0.025 * pz + 0.035 * c.F.kick(t) + 0.1 * flare);
    const cxd = c.w, cyd = lerp(c.h * 2 + 2, c.h * 4 * 0.27, move);
    b.clear();
    drawSun(b, cxd, cyd, R, t * 0.32, flare);
    b.blit(s, c.x, c.y);
    typeCaption(s, c.x + 3, c.y + 2, 'God', t, c.a + 0.05, tGod);

    // the proof
    if (t >= tThen - 0.05) {
      const bw = Math.min(c.w - 8, 46), bh = 8;
      const bx = c.x + ((c.w - bw) >> 1), by = c.y + Math.round(c.h * 0.58) - (c.h < 30 ? 1 : 0);
      const a = easeOut(prog(t, tThen - 0.05, tThen + 0.2));
      const fl = Math.exp(-Math.max(0, t - tEx) * 5) * (t >= tEx ? 1 : 0);
      s.fill(bx + 1, by + 1, bw - 2, bh - 2, 32, -1, mix(P.bg, P.bg2, a));
      box(s, bx, by, bw, bh, mix(mix(P.bg, P.gold, 0.55 * a), P.goldHi, fl), { style: 'round' });
      s.text(bx + 2, by, ' proof ', mix(P.bg, P.gold, a));
      LINES.forEach(([str, a0, a1], i) => {
        const row = [0, 2, 3, 5][i];
        const txt = typed(str, (t - tThen - a0) / (a1 - a0));
        if (!txt) return;
        const col = i === 0 ? P.goldHi : i === 3 ? P.white : P.text;
        s.text(bx + 3, by + 1 + row, txt, col, KEEP, i === 0 || i === 3 ? BOLD : 0);
      });
      // the tombstone lands on "existence"
      if (t >= tEx - 0.18) {
        const q = prog(t, tEx - 0.18, tEx + 0.05);
        const yy = by + 6 - Math.round((1 - easeOutBack(q, 2)) * 3);
        s.text(bx + bw - 4, yy, '∎', mix(P.goldHi, P.white, fl), KEEP, BOLD);
      }
    }
  };
}

// ================================================================ R-C5  avatar: pixel mascot <-> portrait

function avatarShot(W) {
  const tF = W(42, 1), tM = W(42, 3);
  const CROP = [0.24, 0.02, 0.78, 0.40];
  const ASPECT = (0.54 * 450) / (0.38 * 800);
  const G = perSize((c) => {
    const k = clamp(Math.floor((c.w - 10) / 18), 2, 5);
    let rows = clamp(c.h - 13, 9, 27), cols = Math.round(rows * 2 * ASPECT);
    if (cols > c.w - 8) { cols = c.w - 8; rows = Math.round(cols / ASPECT / 2); }
    const midY = c.y + ((c.h - 4) >> 1);
    return { k, rows, cols, midY, px: new Pixels(c.w, c.h) };
  });
  // portrait amount: 0 = mascot, 1 = portrait
  const amount = (t) => {
    if (t < tF) return 0;
    if (t < tM) return easeInOut(prog(t, tF, tF + 0.45));
    return 1 - easeInOut(prog(t, tM, tM + 0.4));
  };
  return (c) => {
    const g = G(c), s = c.s, t = c.t, px = g.px, k = g.k;
    const p = amount(t);
    const pz = c.pulse(8);
    px.clear();
    // the mascot, walking in place on the beats
    const ox = Math.round((c.w - 18 * k) / 2), oy = Math.round((g.midY - c.y) * 2 - (5 * k) / 2) - Math.round(pz * 0.9);
    const phase = (t - c.a) % 3.1, blinking = phase > 2.85 && phase < 3.0;
    clawdPixels(px, ox, oy, k, P.clay, { eyes: P.void, step: c.beat.n & 1, blink: blinking ? 1 : 0 });
    for (const cc of [5, 12]) if (k >= 3 && !blinking) px.set(ox + cc * k + 1, oy + k + 1, P.white, 0.9);
    // dissolve masks: pixels flip between the two forms by a blocky threshold, with a bright seam
    const blk = (x, y) => hash(x >> 1, y >> 1, 77);
    const w = px.pw;
    for (let y = 0; y < px.ph; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (px.a[i] <= 0) continue;
        const h = blk(x, y);
        if (h < p) { px.a[i] = 0; continue; }
        if (p > 0 && p < 1 && h - p < 0.07) { px.c[i] = P.goldHi; }
      }
    }
    px.blit(s, c.x, c.y);
    if (p > 0) {
      const ix = c.x + ((c.w - g.cols) >> 1), iy = c.y + ((c.h - 4 - g.rows) >> 1) + 1;
      c.img.draw(s, ix, iy, g.cols, g.rows, {
        crop: CROP,
        fx: (x, y, col, al) => {
          const h = blk(x + (ix - c.x), y + (iy - c.y) * 2);
          if (h >= p) return [col, 0];
          if (p < 1 && p - h < 0.07) return [P.goldHi, al];
          return null;
        },
      });
    }

    // the switch
    const sy = c.y + c.h - 4, ax = c.x + (c.w >> 1);
    const label0 = p > 0.5 ? 'form: portrait' : 'form: pixel';
    center(s, ax, sy - 1, label0, P.dim);
    const xF = ax - 8, xM = ax + 3;
    const hx = Math.round(lerp(xM, xF, p));
    s.text(xF, sy, '  F  ', P.dim, P.bg2);
    s.text(xM, sy, '  M  ', P.dim, P.bg2);
    s.text(hx, sy, p > 0.5 ? '  F  ' : '  M  ', P.bg, mix(P.clay, P.clayHi, pz * 0.4), BOLD);
    center(s, ax, sy + 2, 'gender', P.line);
  };
}

// ================================================================ R-C6  a day in a minute

/** Monotone cubic interpolation through [[x, y], ...] (Fritsch-Carlson). */
function pchip(keys) {
  const n = keys.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (x > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], u = (x - keys[i][0]) / h;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    return h00 * keys[i][1] + h10 * h * m[i] + h01 * keys[i + 1][1] + h11 * h * m[i + 1];
  };
}

const DAY = [
  [360, mix(P.kraft, P.fig, 0.35)], [480, mix(P.gold, P.manilla, 0.4)], [720, P.manilla], [1000, P.gold], [1110, mix(P.clay, P.fig, 0.4)],
  [1200, mix(P.fig, P.sky, 0.55)], [1290, P.sky], [1440, P.sky],
];
function skyAt(T) {
  T = clamp(T, DAY[0][0], DAY[DAY.length - 1][0]);
  for (let i = 1; i < DAY.length; i++) if (T <= DAY[i][0]) return mix(DAY[i - 1][1], DAY[i][1], (T - DAY[i - 1][0]) / (DAY[i][0] - DAY[i - 1][0]));
  return DAY[DAY.length - 1][1];
}

const MEMORY = [['07:30', 450, 'rain.md'], ['12:10', 730, 'lunch.md'], ['18:42', 1122, 'tired.md'], ['21:05', 1265, 'laugh.wav'], ['23:10', 1390, 'see_you_tomorrow.md']];

function clockShot(W) {
  const tAM = W(44, 1), tPM = W(44, 3);
  const t0 = W(43, 0), t1 = W(45, 0);
  // the hands arrive at each memory's time exactly when the left pane writes it (on "And", "do", "whatever", "AM", "PM")
  const popAt = [W(43, 0), W(43, 2), W(43, 3), W(44, 1), W(44, 3)];
  const Tof = pchip([...popAt.map((tt, i) => [tt, MEMORY[i][1]]), [t1, 1390]]);
  const G = perSize((c) => {
    const bigRead = c.h >= 30;
    const R = clamp(Math.min(2 * (c.h - (bigRead ? 16 : 9)), Math.floor(c.w * 0.5) - 5), 14, 60);
    const cols = R + 2, rows = Math.ceil(R / 2) + 2;
    const cxC = c.x + 3 + (R >> 1) + 1, cyC = c.y + ((c.h - (bigRead ? 8 : 2)) >> 1);
    const bx = cxC - (cols >> 1), by = cyC - (rows >> 1);
    const lx = c.x + 3 + R + 7;
    return { R, cols, rows, cxC, cyC, bx, by, b: new Braille(cols, rows), lx, lw: c.x + c.w - 2 - lx, bigRead };
  });
  const hand = (b, cx, cy, ang, len, col, pri, thick) => {
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    b.line(cx, cy, cx + dx * len, cy + dy * len, col, pri);
    if (thick) { b.line(cx + 1, cy, cx + 1 + dx * len, cy + dy * len, col, pri); b.line(cx, cy + 1, cx + dx * len, cy + 1 + dy * len, col, pri); }
  };
  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b, R = g.R;
    const pz = c.pulse(8);
    const T = Tof(t);
    const sky = skyAt(T);
    // day to night behind everything: a glow around the dial and a faint wash over the pane
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const d = Math.hypot((x - g.cxC) / 2, y - g.cyC) / (R / 4);
        const k = 0.03 + 0.2 * Math.exp(-d * d * 0.55);
        const i = y * s.w + x;
        s.bg[i] = mix(s.bg[i], sky, k);
      }
    }
    b.clear();
    const cxd = b.pw / 2, cyd = b.ph / 2;
    b.circle(cxd, cyd, R, mix(P.mute, sky, 0.3), 0, TAU, 1);
    for (let m = 0; m < 60; m++) {
      const a = (m * TAU) / 60, hr = m % 5 === 0, r0 = R - (hr ? 11 : 6), r1 = R - 3;
      const sx = Math.sin(a), sy = -Math.cos(a), col = hr ? mix(P.soft, sky, 0.25) : mix(P.dim, sky, 0.2);
      b.line(cxd + sx * r0, cyd + sy * r0, cxd + sx * r1, cyd + sy * r1, col, 1);
      if (hr) b.line(cxd + sx * r0 + 1, cyd + sy * r0, cxd + sx * r1 + 1, cyd + sy * r1, col, 1);
    }
    // hands, with a smear behind the minute hand while the day races
    const hAng = (T / 720) * TAU, mAng = ((T % 60) / 60) * TAU;
    for (let j = 6; j >= 1; j--) {
      const Tg = Tof(t - 0.014 * j);
      hand(b, cxd, cyd, ((Tg % 60) / 60) * TAU, R * 0.8, mix(P.bg, mix(P.clay, sky, 0.3), 0.3 * (7 - j) / 6), 0.5, false);
    }
    hand(b, cxd, cyd, hAng, R * 0.5, mix(P.text, sky, 0.2), 3, true);
    hand(b, cxd, cyd, mAng, R * 0.8, mix(P.clayHi, P.white, 0.2 + 0.3 * pz), 3, false);
    b.circle(cxd, cyd, 3, P.clay, 0, TAU, 4); b.circle(cxd, cyd, 1.5, P.goldHi, 0, TAU, 5);
    // the sun / moon riding the hour hand
    const orbR = R * 0.5 + 8, ox = cxd + Math.sin(hAng) * orbR, oy = cyd - Math.cos(hAng) * orbR;
    const night = smooth(prog(T, 1110, 1230));
    const orb = mix(P.goldHi, P.heather, night);
    for (let r = 3.4; r >= 0.5; r -= 0.7) b.circle(ox, oy, r, orb, 0, TAU, 4);
    if (night > 0.4) for (let r = 2.8; r >= 0.4; r -= 0.7) b.circle(ox + 1.8, oy - 1, r, mix(P.bg, sky, 0.3), 0, TAU, 6);   // a crescent
    b.blit(s, g.bx, g.by);
    // numerals
    const rr = Math.round(R / 4), nm = mix(P.dim, sky, 0.2);
    center(s, g.cxC, g.cyC - rr + 2, '12', nm); center(s, g.cxC, g.cyC + rr - 2, '6', nm);
    s.text(g.cxC + (R >> 1) - 5, g.cyC, '3', nm); s.text(g.cxC - (R >> 1) + 4, g.cyC, '9', nm);

    // digital readout
    const hh = Math.floor(T / 60) % 24, mm = Math.floor(T % 60);
    const hms = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const ry = g.cyC + Math.ceil(R / 4) + 2;
    const rdCol = mix(P.white, sky, 0.1);
    if (g.bigRead) {
      const font = c.fonts.mono, ph = 12;
      font.draw(s, g.cxC - (font.width(hms, ph) >> 1), ry, hms, ph, rdCol, { alpha: 0.95 });
    } else center(s, g.cxC, ry, hms, rdCol, KEEP, BOLD);

    // the day as a bar: 00:00 .. 24:00, AM | PM, a marker for now, a dot per memory
    const lx = g.lx, lw = g.lw;
    if (lw < 14) return;
    const top = clamp(g.cyC - 8, c.y + 2, c.y + c.h - 20);
    label(s, lx, top, '~/.claude/memory/you/', P.dim);
    const barY = top + 4;
    const xT = (m) => lx + Math.round((m / 1440) * (lw - 1));
    for (let x = 0; x < lw; x++) {
      const m = (x / (lw - 1)) * 1440;
      const past = m <= T;
      s.text(lx + x, barY, past ? '━' : '─', past ? mix(P.bg, skyAt(Math.max(360, m)), 0.85) : mix(P.bg, P.line, 0.8));
    }
    for (const h of [0, 6, 12, 18, 24]) {
      const x = xT(h * 60);
      s.text(clamp(x - 1, lx, lx + lw - 2), barY - 2, String(h).padStart(2, '0'), P.dim);
      s.put(x, barY - 1, 0x2575, P.line);
    }
    // AM | PM
    const am = t >= tAM, pm = t >= tPM;
    const lab = (str, cxm, on, since) => {
      const fl = on ? Math.exp(-(t - since) * 6) : 0;
      s.text(cxm - 1, barY + 1, ` ${str} `, on ? P.bg : P.dim, on ? mix(P.clay, P.white, fl * 0.7) : KEEP, on ? BOLD : 0);
    };
    lab('AM', xT(360), am, tAM);
    lab('PM', xT(1080), pm, tPM);
    s.put(xT(720), barY + 1, 0x2502, P.line);
    // events landing on the bar
    MEMORY.forEach(([, m], i) => { if (t >= popAt[i]) s.put(xT(m), barY, 0x25cf, mix(P.goldHi, P.white, Math.exp(-(t - popAt[i]) * 5))); });
    // now
    s.put(xT(T), barY - 1, 0x25bc, mix(P.clay, P.white, 0.3 * pz));

    // the memory files, one per clock time
    const ly = barY + 4;
    MEMORY.forEach(([tm, , name], i) => {
      const a = t - popAt[i];
      if (a < 0) return;
      const fl = Math.exp(-a * 5);
      const yy = ly + i * 2;
      if (yy >= c.y + c.h - 1) return;
      s.text(lx, yy, '+', mix(P.ok, P.white, fl));
      s.text(lx + 2, yy, tm, mix(P.mute, P.white, fl * 0.7));
      s.text(lx + 8, yy, clipStr(name, lw - 8), mix(P.text, P.white, fl * 0.6), KEEP, fl > 0.4 ? BOLD : 0);
    });
  };
}

// ================================================================ R-C7  POST /v1/messages: the roles swap

function messagesShot(W) {
  const tSwap = [W(45, 3), W(46, 1), W(46, 3)];
  const FILES = [['your_cat.png', '3.1K', P.sky], ['rain.md', '0.1K', P.text], ['lunch.md', '0.1K', P.text], ['tired.md', '0.1K', P.text], ['laugh.wav', '412K', P.accept], ['see_you_tomorrow.md', '0.2K', P.text]];
  const G = perSize((c) => {
    const bw = Math.min(c.w - 8, 62);
    const x0 = c.x + ((c.w - bw) >> 1);
    const full = c.h >= 36;
    const total = (full ? 4 : 1) + (c.h < 31 ? 6 : 8) + 2 + 8;
    const y0 = c.y + Math.max(1, (c.h - total) >> 1);
    return { bw, x0, full, y0 };
  });
  return (c) => {
    const g = G(c), s = c.s, t = c.t;
    const { x0, y0 } = g;
    let y = y0;
    const cl = (n) => clamp((t - c.a - n * 0.07) / 0.1);     // line n types in, one every 70 ms
    let n = 0;
    // request line and headers
    const hdr = (x, yy, parts) => { let xx = x; for (const [str, col, at] of parts) { xx = s.text(xx, yy, str, mix(P.bg, col, cl(n)), KEEP, at ?? 0); } n++; };
    hdr(x0, y, [['POST', P.clay, BOLD], [' /v1/messages ', P.text, 0], ['HTTP/1.1', P.dim, 0]]); y++;
    if (g.full) {
      hdr(x0, y, [['host: ', P.dim, 0], ['api.anthropic.com', P.mute, 0]]); y++;
      hdr(x0, y, [['content-type: ', P.dim, 0], ['application/json', P.mute, 0]]); y++;
      y++;
    }
    const K = (str) => [str, SYN.key, 0], S = (str) => [str, SYN.str, 0], Pn = (str) => [str, SYN.punct, 0];
    hdr(x0, y++, [Pn('{')]);
    if (g.full) hdr(x0, y++, [['  ', P.text, 0], K('"model"'), Pn(': '), S('"claude-opus-5-5"'), Pn(',')]);
    hdr(x0, y++, [['  ', P.text, 0], K('"messages"'), Pn(': [')]);
    // the two messages: the role values are chips that swap rows
    const rowA = y, rowB = y + 1;
    const lead = '    { ';
    const roleX = x0 + lead.length + '"role": '.length;
    const aA = cl(n), aB = cl(n + 1);
    const narrow = g.bw < 58;
    for (const [rr, a, content, tail] of [[rowA, aA, '"晚安"', ' },'], [rowB, aB, '"晚安，做個好夢。"', ' }']]) {
      if (a <= 0) continue;
      const base = mix(P.bg, SYN.punct, a);
      s.text(x0, rr, lead, base);
      s.text(x0 + lead.length, rr, '"role"', mix(P.bg, SYN.key, a));
      s.text(x0 + lead.length + 6, rr, ': ', base);
      const cx = roleX + 13;
      if (narrow) { s.text(cx, rr, '…', base); s.text(cx + 1, rr, tail, base); continue; }
      s.text(cx, rr, '"content"', mix(P.bg, SYN.key, a));
      s.text(cx + 9, rr, ': ', base);
      const w = s.text(cx + 11, rr, content, mix(P.bg, SYN.str, a));
      s.text(w, rr, tail, base);
    }
    n += 2;
    y += 2;
    hdr(x0, y++, [['  ', P.text, 0], Pn(']')]);
    hdr(x0, y++, [Pn('}')]);

    // role chips: A = "user", B = "assistant"; each swap exchanges their rows
    const swaps = tSwap.filter((tt) => t >= tt).length;
    const active = swaps > 0 && t < tSwap[swaps - 1] + 0.5;
    const q = active ? easeInOut(prog(t, tSwap[swaps - 1], tSwap[swaps - 1] + 0.5)) : 1;
    const fromSwapped = (swaps - 1) % 2 === 1;                     // state before the running swap
    const done = swaps - (active ? 1 : 0);
    const swappedNow = done % 2 === 1;
    if (aA >= 1 && aB >= 1) {
      const userRow = swappedNow ? rowB : rowA, asstRow = swappedNow ? rowA : rowB;
      let uy = userRow, ay = asstRow, ux = 0, ax = 0;
      if (active) {
        // the chips trade rows, passing each other on opposite sides
        const uStart = fromSwapped ? rowB : rowA, aStart = fromSwapped ? rowA : rowB;
        uy = lerp(uStart, aStart, q); ay = lerp(aStart, uStart, q);
        const bump = Math.sin(Math.PI * q);
        ux = 9 * bump; ax = -9 * bump;
      }
      const fl = active ? 1 : Math.exp(-(t - (tSwap[swaps - 1] ?? -9) - 0.5) * 5);
      // lifted, a chip is a pill in its own colour; at rest it is plain coloured text
      const drawChip = (str, col, pill, xx, yy, lifted) => {
        const rowy = Math.round(yy);
        if (lifted) s.text(Math.round(xx) - 1, rowy, ` ${str} `, P.bg, pill, BOLD);
        else s.text(Math.round(xx), rowy, str, col, KEEP, 0);
      };
      drawChip('"user",', mix(P.skyHi, P.white, fl * 0.4), P.sky, roleX + ux, uy, active);
      drawChip('"assistant",', mix(P.clay, P.clayHi, fl * 0.5), P.clay, roleX + ax, ay, active);
      if (swaps > 0) label(s, x0 + g.bw - 9, rowA - 1, `swap ×${swaps}`, mix(P.dim, P.clayHi, active ? 0.8 : fl * 0.6));
    }

    // the folder
    const fy = y + 2;
    const fa = easeOut(prog(t, c.a + 0.55, c.a + 0.85));
    if (fa > 0) {
      label(s, x0, fy, '~/.claude/memory/you/', mix(P.bg, P.clay, fa), BOLD);
      labelR(s, x0 + g.bw, fy, '6 files', mix(P.bg, P.dim, fa));
      FILES.forEach(([name, size, col], i) => {
        const a = clamp((t - (c.a + 0.62 + i * 0.07)) / 0.12);
        if (a <= 0) return;
        const last = i === FILES.length - 1;
        s.text(x0, fy + 1 + i, last ? '└── ' : '├── ', mix(P.bg, P.line, a));
        s.text(x0 + 4, fy + 1 + i, name, mix(P.bg, col, a));
        labelR(s, x0 + g.bw, fy + 1 + i, size, mix(P.bg, P.dim, a));
      });
    }
  };
}

// ================================================================ R-C8  trance: rings of spinner glyphs

function tranceShot(W) {
  const tTr = [W(48, 1), W(48, 3)];
  const tEnd = W(49, 0);
  const G = perSize((c) => {
    const rMax = Math.min(Math.floor(c.h / 2) - 2, Math.floor(c.w / 4) - 2);
    const n = clamp(Math.round(rMax / 2.1), 4, 8);
    const rings = [];
    for (let j = 0; j < n; j++) {
      const r = 2 + ((rMax - 2) * j) / (n - 1);
      const cnt = Math.max(8, Math.round((TAU * r * 1.5) / 1.9));
      rings.push({ j, r, cnt, dir: j % 2 ? 1 : -1, w: 0.3 + 0.045 * j, ph: hash(j, 1, 3) * TAU });
    }
    return { rMax, rings, b: new Braille(c.w, c.h) };
  });
  return (c) => {
    const g = G(c), s = c.s, t = c.t, b = g.b;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const u = prog(t, c.a, c.b);
    const zoom = 1 + 0.2 * smooth(u);
    const breathe = clamp(0.66 + 0.2 * Math.sin((t * TAU) / (c.film.beatLen * 4)) + 0.3 * c.F.loud(t), 0, 1.1);   // slow swell, plus the song's own loudness
    const dis = easeIn(prog(t, tEnd - 0.95, tEnd - 0.04));
    const appear = easeOut(prog(t, c.a, c.a + 0.5));
    const NR = g.rings.length;
    b.clear();
    const gcx = (cx - c.x) * 2, gcy = (cy - c.y) * 4;
    // a hairline under each ring
    for (const ring of g.rings) {
      const rapp = clamp(appear * 1.7 - ring.j * 0.12);
      if (rapp <= 0) continue;
      const col = mix(P.bg, ring.dir < 0 ? P.clayDeep : mix(P.gold, P.clayDeep, 0.6), 0.55 * rapp * (1 - dis) * breathe);
      b.circle(gcx, gcy, ring.r * zoom * 4, col, 0, TAU, 1);
    }
    b.blit(s, c.x, c.y);
    for (const ring of g.rings) {
      const rz = ring.r * zoom;
      let wave = 0;
      for (const tp of tTr) { const a = t - tp; if (a >= 0 && a < 1.1) wave += Math.exp(-(((a * 16) - ring.r) ** 2) / 6) * (1 - a / 1.1); }
      const sizeIdx = Math.min(5, Math.floor((ring.j / (NR - 1)) * 5.99));
      const spin = (t - c.a) * ring.w * ring.dir + ring.ph;
      const rapp = clamp(appear * 1.7 - ring.j * 0.12);
      const warm = ring.dir < 0;
      for (let i = 0; i < ring.cnt; i++) {
        const h = hash(i, ring.j, 11);
        if (h < dis * 1.25 * (0.4 + ring.j / NR)) continue;
        const a = (i * TAU) / ring.cnt + spin;
        const rr = rz + dis * (0.5 + 1.5 * h) * (1 + ring.j * 0.12) * 5;
        const x = Math.round(cx + Math.cos(a) * rr * 2), y = Math.round(cy + Math.sin(a) * rr);
        const base = warm ? mix(P.clay, P.clayHi, 0.3 + 0.4 * Math.sin(a * 3 + t * 1.5) ** 2) : mix(P.gold, P.goldHi, 0.3 + 0.4 * Math.sin(a * 3 - t * 1.5) ** 2);
        const lum = clamp((0.62 + 0.38 * breathe + 0.8 * wave) * (1 - 0.85 * dis * h) * rapp);
        const gi = Math.min(5, sizeIdx + (wave > 0.3 ? 1 : 0));
        s.put(x, y, SPIN[gi].codePointAt(0), mix(P.bg, mix(base, P.white, clamp(wave * 0.7)), lum), KEEP, wave > 0.4 || sizeIdx >= 4 ? BOLD : 0);
      }
    }
    // the still centre
    const cpulse = Math.max(...tTr.map((tp) => (t >= tp ? Math.exp(-(t - tp) * 6) : 0)), 0);
    const cc = mix(P.bg, mix(P.goldHi, P.white, cpulse), clamp((0.6 + 0.4 * breathe + cpulse) * appear * (1 - dis)));
    s.put(Math.round(cx), Math.round(cy), 0x273b, cc, KEEP, BOLD);
  };
}
