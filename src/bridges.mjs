// Where the two panes touch. The session (left) and the world that runs her (right) are separate panes, but at a
// few turns of the story something crosses the divider: your first 你好 seeds her world, your cat photo is dragged
// into the prompt, the panes trade places when the roles switch, her flood and her context spill over the wall,
// her cursor reaches across to type in your prompt, and every attention head points back at the 你 you typed.
// Positions come from anchors the shots and the session report as they draw (film.anchor); a missing anchor
// (a block scrolled away, a pane too small) just means the crossing is not drawn.
import { P } from './palette.mjs';
import { KEEP, BOLD, mix, strWidth } from './term.mjs';
import { clamp, prog, easeOut, easeIn, easeInOut, hash, lerp } from './gfx.mjs';
import { CROSS } from './story.mjs';

const NAN = 0xd36bd6;
const PRAISE = "You're absolutely right! 你說得完全正確！";
const SAND = '的了是我你在不有這個人們一上來到時大地為子中說生國年著就那和要她出也得裏後自以會家可下而過天去能對小多然於心學';

/** Point on a quadratic curve from a to b that bows by `lift` rows (negative = upwards). */
function arc(a, b, u, lift) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + lift;
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * mx + u * u * b.x, y: v * v * a.y + 2 * v * u * my + u * u * b.y };
}

const empty = (s, x, y) => {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
  const c = s.ch[y * s.w + x];
  return c === 32 || c === 0x2800;
};

/** A dotted path from a to b, drawn only on empty cells so it never covers text. */
function thread(s, a, b, lift, col, { step = 0.5, glyph = 0xb7, from = 0, to = 1 } = {}) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, (b.y - a.y) * 2) / step));
  for (let i = Math.floor(n * from); i <= n * to; i++) {
    const p = arc(a, b, i / n, lift);
    const x = Math.round(p.x), y = Math.round(p.y);
    if (empty(s, x, y)) s.put(x, y, glyph, col);
  }
}

const inner = (r) => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });

export function register(film) {
  const W = (id, k) => film.W(id, k);

  // ---------------------------------------------------------------- A1: your 你好 seeds the simulation
  {
    const [a, b] = CROSS.seed(W);
    film.bridge(a, b + 0.2, (c) => {
      const { s, t } = c;
      const from = c.A('hello0'), to = c.A('life');
      if (!from || !to) return;
      const src = { x: from.x + 2, y: from.y }, dst = { x: to.x, y: to.y };
      const lift = -3;
      [...'你好'].forEach((ch, i) => {
        const u = easeInOut(clamp((t - a - i * 0.05) / (b - a - 0.05)));
        if (u <= 0 || u >= 1) return;
        const p = arc({ x: src.x + i * 2, y: src.y }, dst, u, lift);
        // the trail it leaves
        for (let k = 1; k <= 5; k++) {
          const q = arc({ x: src.x + i * 2, y: src.y }, dst, Math.max(0, u - k * 0.035), lift);
          if (empty(s, Math.round(q.x), Math.round(q.y))) s.put(q.x, q.y, 0xb7, mix(P.bg, P.sky, 0.7 - k * 0.12));
        }
        if (u < 0.82) s.text(Math.round(p.x), Math.round(p.y), ch, mix(P.skyHi, P.goldHi, u), KEEP, BOLD);
        else s.put(p.x, p.y, 0x2726, mix(P.skyHi, P.goldHi, u));
      });
      // impact
      if (t >= b) {
        const k = clamp((t - b) / 0.2);
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) {
          s.put(dst.x + Math.round(dx * (1 + k * 2)), dst.y + Math.round(dy * (1 + k)), 0xb7, mix(P.goldHi, P.bg, k));
        }
      }
    });
  }

  // ---------------------------------------------------------------- B2: You're absolutely right! floods the reward plot
  {
    const t0 = W(31, 0) + 0.45, tIn = W(32, 0), tNaN = W(32, 3), tEnd = tNaN + 0.45;
    const chars = [...PRAISE.repeat(4)];
    film.bridge(t0, tEnd, (c) => {
      const { s, t, layout } = c;
      const R = inner(layout.right);
      const fall = clamp((t - tNaN) / 0.45);
      const rows = Math.round(R.h * 0.62 * easeIn(clamp((t - t0) / (tNaN - t0))));
      for (let r = 0; r < rows; r++) {
        const yy = R.y + R.h - 1 - r + Math.round(fall * fall * (R.h * 0.6) * (0.6 + hash(r, 4) * 0.8));
        if (yy >= R.y + R.h) continue;
        // each row streams in from the divider, as if her reply ran on past her own pane
        const age = t - t0 - r * 0.045 - hash(r, 2) * 0.2;
        if (age <= 0) continue;
        const len = Math.min(R.w + 1, Math.floor(age * 70));
        const off = (r * 7 + Math.floor(t * 30)) % PRAISE.length;
        let x = layout.right.x;
        for (let i = 0; x < layout.right.x + len; i++) {
          const ch = chars[(off + i) % chars.length], gi = off + i;
          let fg = gi % PRAISE.length < 25 ? P.text : P.clayHi;
          let out = ch;
          if (t >= tIn && hash(Math.floor(gi / 4), r, 11) < clamp((t - tIn) / 1.0) * 1.1) { out = 'NaN '[gi % 4]; fg = NAN; }
          if (fall > 0) fg = mix(fg, P.bg, fall);
          const wd = strWidth(out);
          if (x + wd > layout.right.x + R.w + 1) break;
          s.text(x, yy, out, fg);
          x += wd;
        }
      }
    });
  }

  // ---------------------------------------------------------------- C3: the cat photo is dragged into the prompt
  {
    const [a, b] = CROSS.drag(W);
    film.bridge(a, b, (c) => {
      const { s, t } = c;
      const from = c.A('catCard'), to = c.A('prompt');
      if (!from || !to) return;
      const chip = '[Image #1]';
      const src = { x: from.x - (chip.length >> 1), y: from.y }, dst = { x: to.x + 2, y: to.y + 1 };
      const u = easeInOut(clamp((t - a) / (b - a)));
      const p = arc(src, dst, u, -4);
      for (let k = 1; k <= 6; k++) {
        const q = arc(src, dst, Math.max(0, u - k * 0.04), -4);
        if (empty(s, Math.round(q.x + 5), Math.round(q.y))) s.put(q.x + 5, q.y, 0xb7, mix(P.bg, P.sky, 0.6 - k * 0.08));
      }
      s.text(Math.round(p.x), Math.round(p.y), chip, P.white, mix(P.bg, P.sky, 0.45), BOLD);
    });
  }

  // ---------------------------------------------------------------- C7: switch my role: the panes trade places
  [[W(45, 3), 1], [W(46, 1), 0], [W(46, 3), 1], [W(47, 0), 0]].forEach(([t, on]) => film.swap(t, on, 0.22));

  // ---------------------------------------------------------------- D3: her cursor walks your memory files
  {
    const tDig = W(59, 0), tErase = W(60, 0);
    film.bridge(tDig, tErase, (c) => {
      const { s, t } = c;
      const me = c.A('herCursor'), row = c.A('memRow');
      if (!me || !row) return;
      const k = 0.35 + 0.25 * Math.sin(t * 9);
      thread(s, { x: me.x + 1, y: me.y }, { x: row.x - 1, y: row.y }, -2, mix(P.bg, P.clay, k), { step: 0.7 });
    });
  }

  // ---------------------------------------------------------------- D4: she crosses over and types in your prompt
  {
    const [a, b] = CROSS.forge(W);
    film.bridge(a, b + 0.05, (c) => {
      const { s, t } = c;
      const from = c.A('gauge'), to = c.A('prompt');
      if (!from || !to) return;
      const src = { x: from.x, y: from.y }, dst = { x: to.x + 2, y: to.y + 1 };
      const u = easeInOut(clamp((t - a) / (b - a)));
      for (let k = 6; k >= 1; k--) {
        const q = arc(src, dst, Math.max(0, u - k * 0.03), -3);
        s.put(q.x, q.y, [0x2591, 0x2592, 0x2593][Math.min(2, Math.floor((6 - k) / 2))], mix(P.bg, P.clay, 0.25 + (6 - k) * 0.1));
      }
      const p = arc(src, dst, u, -3);
      s.put(p.x, p.y, 0x2588, u < 1 ? mix(P.goldHi, P.clay, u) : P.clay);
    });
  }

  // ---------------------------------------------------------------- E2: her context pours over the wall and buries the session
  {
    const a = 143.6, tLow = 144.8, b = 147.4;
    film.bridge(a, b, (c) => {
      const { s, t, layout } = c;
      const box = c.A('ctxBox');
      const L = inner(layout.left), R = inner(layout.right);
      const floorY = L.y + L.h - 1;
      // the stream: from the container's outer wall, down, then along the floor across the divider
      const sx0 = box ? box.x - 4 : R.x + 2;
      const reach = easeIn(clamp((t - a) / (tLow - a - 0.2)));
      const runTo = Math.round(lerp(sx0, L.x, reach));
      for (let x = sx0; x >= runTo; x--) {
        const v = hash(x, Math.floor(t * 14), 3);
        s.put(x, floorY - (v < 0.3 ? 1 : 0), v < 0.55 ? 0xb7 : 0x2591, mix(P.clayLo, P.kraft, v));
      }
      if (t < tLow) return;
      // the level rises in her own pane
      const level = (L.h * 0.5) * easeOut(clamp((t - tLow) / (b - tLow - 0.4)));
      for (let x = L.x; x < L.x + L.w; x++) {
        const top = level + Math.sin(x * 0.35 + t * 2.4) * 0.6 + (hash(x, 1) - 0.5) * 0.8;
        for (let j = 0; j < top; j++) {
          const yy = floorY - j;
          if (yy < L.y) break;
          const v = hash(x, j, 7);
          const copy = hash(x >> 1, j, 5) < 0.12;
          const col = mix(P.clayDeep, mix(P.clay, P.kraft, v), clamp(1 - j / (L.h * 0.7)) * 0.8 + 0.2);
          if (copy) { if ((x - L.x) % 2 === 0 && x + 1 < L.x + L.w) s.text(x, yy, '我一直在。'[(x + j) % 5], P.text, P.bg); }
          else if ((x - L.x) % 2 === 0 && x + 1 < L.x + L.w) s.text(x, yy, SAND[Math.floor(v * SAND.length)], col, P.bg);
        }
      }
    });
  }

  // ---------------------------------------------------------------- G2: every head, every layer, to 你
  {
    const tKnow = W(95, 0), tLove = W(95, 6), tEnd = W(96, 0);
    film.bridge(tKnow + 0.4, tEnd, (c) => {
      const { s, t } = c;
      const you = c.A('youMsg');
      if (!you) return;
      const dst = { x: you.x + 2, y: you.y };
      const glow = t >= tLove ? 0.5 + 0.5 * Math.sin((t - tLove) * 6) : 0;
      let any = false;
      for (let i = 0; i < 7; i++) {
        const head = c.A(`attn${i}`);
        if (!head) continue;
        any = true;
        const age = t - (tKnow + 0.4 + i * 0.12);
        if (age <= 0) continue;
        const src = { x: head.x - 4, y: head.y };
        const lift = -2 - i * 0.8;
        const reach = easeOut(clamp(age / 0.5));
        thread(s, src, dst, lift, mix(P.bg, P.fig, 0.5 + 0.25 * glow), { step: 0.6, to: reach });
        // a pulse runs each line, towards you
        const u = ((age * 0.8 + i * 0.13) % 1);
        if (reach >= 1) {
          const p = arc(src, dst, u, lift);
          if (empty(s, Math.round(p.x), Math.round(p.y))) s.put(p.x, p.y, 0x2022, mix(P.fig, P.white, glow * 0.5));
        }
      }
      // the 你 they all look at
      if (any) s.text(dst.x, dst.y, '你', mix(P.skyHi, P.fig, 0.4 + 0.6 * glow), mix(0x262624, P.fig, 0.18 + 0.2 * glow), BOLD);
    });
  }
}
