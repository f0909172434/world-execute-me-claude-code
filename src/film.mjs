// The film: a pure function of song time. Left pane = the Claude Code session, right pane = shots of the world
// that runs her, bottom = the lyric band. Bridges draw across both panes where the two touch; takeovers draw over
// everything.
import { P } from './palette.mjs';
import { Screen, BOLD, DIM, ITALIC, KEEP, mix, strWidth, clipStr } from './term.mjs';
import { clamp, prog, easeInOut, easeOut, hash, lerp, decodeChar, glitch } from './gfx.mjs';
import { Session } from './session.mjs';
import { spinGlyph } from './cc.mjs';

export const DURATION = 212.2;

export class Film {
  constructor({ lyrics, features, portrait, fonts }) {
    this.lyrics = lyrics;
    this.F = features;
    this.img = portrait;
    this.fonts = fonts;
    this.session = new Session();
    this.shots = [];       // right pane: { a, b, label, draw, enter }
    this.fulls = [];       // takeovers: { a, b, draw, band, enter }
    this.bridges = [];     // moments that cross the divider: { a, b, draw }
    this.anchors = new Map(); // where things were drawn this frame (for the bridges)
    this.swaps = [[0, 0, 0]]; // [t, swapped 0/1, dur]: the panes trade places
    this.leads = [[0, 'both']];
    this.splits = [[0, 0.44]];
    this.glitches = [];    // { a, b, amt }
    this.bandOff = [];     // [a, b] spans with no lyric band
    this.chromeOff = [];
    this.tmp = null;
    const L = lyrics.lines;
    this.byId = new Map(L.map((l) => [l.id, l]));
    this.bpm = lyrics.bpm; this.firstBeat = lyrics.firstBeat;
  }

  // ------------------------------------------------------------ time helpers

  /** Onset of word `k` of lyric line `id` (k < 0 counts from the end; 'end' = line end). */
  W(id, k = 0) {
    const l = this.byId.get(id);
    if (!l) return NaN;
    if (k === 'end') return l.end;
    return l.words[k < 0 ? l.words.length + k : k].start;
  }
  line(id) { return this.byId.get(id); }
  get beatLen() { return 60 / this.bpm; }
  beat(t) { const b = (t - this.firstBeat) / this.beatLen; return { n: Math.floor(b), phase: b - Math.floor(b), f: b }; }
  /** 1 on each beat, decaying. */
  pulse(t, sharp = 6, every = 1) {
    const b = (t - this.firstBeat) / (this.beatLen * every);
    return b < 0 ? 0 : Math.exp(-(b - Math.floor(b)) * sharp);
  }
  beatTime(n) { return this.firstBeat + n * this.beatLen; }

  // ------------------------------------------------------------ registration

  shot(a, b, label, draw, opts = {}) { this.shots.push({ a, b, label, draw, ...opts }); return this; }
  full(a, b, draw, opts = {}) { this.fulls.push({ a, b, draw, band: true, ...opts }); return this; }
  bridge(a, b, draw) { this.bridges.push({ a, b, draw }); return this; }
  /** Record where `name` was drawn this frame (shots and the session call this; bridges read it). */
  anchor(name, x, y, extra) { this.anchors.set(name, { x, y, ...extra }); }
  swap(t, on, dur = 0.24) { this.swaps.push([t, on ? 1 : 0, dur]); this.swaps.sort((x, y) => x[0] - y[0]); return this; }
  lead(t, who) { this.leads.push([t, who]); this.leads.sort((x, y) => x[0] - y[0]); return this; }
  split(t, r, dur = 0.5) { this.splits.push([t, r, dur]); this.splits.sort((x, y) => x[0] - y[0]); return this; }
  glitch(a, b, amt = 0.5) { this.glitches.push({ a, b, amt }); return this; }
  noBand(a, b) { this.bandOff.push([a, b]); return this; }
  noChrome(a, b) { this.chromeOff.push([a, b]); return this; }

  // ------------------------------------------------------------ layout

  splitAt(t) {
    let r = this.splits[0][1];
    for (let i = 1; i < this.splits.length; i++) {
      const [tt, rr, d] = this.splits[i];
      if (t >= tt) r = lerp(r, rr, easeInOut(clamp((t - tt) / d)));
    }
    return r;
  }

  swapAt(t) {
    let v = 0;
    for (const [tt, on, d] of this.swaps) if (t >= tt) v = lerp(v, on, easeInOut(clamp((t - tt) / Math.max(1e-3, d))));
    return v;
  }

  layout(W, H, t) {
    const r = this.splitAt(t);
    const top = 1, band = 3;
    const ph = H - top - band - 1;             // pane height (frame rows included)
    const lw = Math.round((W - 3) * r), rw = W - 3 - lw;
    // swapped: the session slides to the right and the shots to the left
    const sw = this.swapAt(t);
    return {
      W, H, swap: sw,
      left: { x: Math.round(lerp(1, 2 + rw, sw)), y: top, w: lw, h: ph },
      right: { x: Math.round(lerp(2 + lw, 1, sw)), y: top, w: rw, h: ph },
      band: { x: 0, y: H - band, w: W, h: band },
    };
  }

  /** Dim factor per side: 1 = lead, 0.42 = background. */
  leadAt(t) {
    const k = { left: 1, right: 1 };
    let prev = 'both', cur = 'both', since = 0;
    for (const [tt, who] of this.leads) if (tt <= t) { prev = cur; cur = who; since = tt; }
    const f = (who, side) => (who === 'both' || who === side ? 1 : who === 'none' ? 0.15 : 0.42);
    const x = easeInOut(clamp((t - since) / 0.35));
    k.left = lerp(f(prev, 'left'), f(cur, 'left'), x);
    k.right = lerp(f(prev, 'right'), f(cur, 'right'), x);
    return k;
  }

  // ------------------------------------------------------------ frame

  render(s, t) {
    // the player's clock starts a little below zero (audio latency); nothing is drawn before the song
    t = Math.max(0, t);
    this.anchors.clear();
    const { w: W, h: H } = s;
    if (!this.tmp || this.tmp.w !== W || this.tmp.h !== H) this.tmp = new Screen(W, H);
    const lay = this.layout(W, H, t);
    s.clear(P.bg, P.text);
    const full = this.fulls.filter((f) => t >= f.a && t < f.b);
    const opaque = full.some((f) => f.opaque !== false);
    if (!opaque) {
      this.drawPanes(s, lay, t);
      this.drawBridges(s, lay, t);
    }
    for (const f of full) {
      const ctx = this.ctx(s, { x: 0, y: 0, w: W, h: f.band ? H - lay.band.h : H }, t, f);
      ctx.layout = lay;
      f.draw(ctx);
    }
    const bandOff = this.bandOff.some(([a, b]) => t >= a && t < b) || full.some((f) => !f.band);
    if (!bandOff) this.drawBand(s, lay.band, t);
    for (const g of this.glitches) if (t >= g.a && t < g.b) {
      const amt = typeof g.amt === 'function' ? g.amt(t) : g.amt;
      glitch(s, 0, 0, W, H, amt, t, 7);
    }
    s.fixWide();
  }

  drawPanes(s, lay, t) {
    const { left: L, right: R } = lay;
    const k = this.leadAt(t);
    const chrome = !this.chromeOff.some(([a, b]) => t >= a && t < b);
    // right pane first (shots may spill), then the session
    const shot = this.activeShot(t);
    const inner = { x: R.x + 1, y: R.y + 1, w: R.w - 2, h: R.h - 2 };
    // a faint dot grid under the shots
    for (let yy = inner.y + 1; yy < inner.y + inner.h; yy += 2)
      for (let xx = inner.x + 2; xx < inner.x + inner.w; xx += 4) s.put(xx, yy, 0xb7, P.grid);
    if (shot) this.drawShot(s, shot, inner, t);
    if (chrome) this.frame(s, R, shot ? (typeof shot.label === 'function' ? shot.label(t) : shot.label) : '', t, 'right');
    s.fade(R.x, R.y, R.w, R.h, k.right, P.bg);
    // mid-swap the session slides over the shots as a card
    if (lay.swap > 0.001 && lay.swap < 0.999) s.fill(L.x - 1, L.y, L.w + 1, L.h, 32, P.text, P.bg);
    const li = { x: L.x + 2, y: L.y + 1, w: L.w - 3, h: L.h - 2 };
    if (li.w > 8) this.session.draw(s, li.x, li.y, li.w, li.h, t);
    if (chrome) this.frame(s, L, '✻ claude', t, 'left');
    s.fade(L.x, L.y, L.w, L.h, k.left, P.bg);
  }

  /** Bridges: over both panes, under the takeovers, clipped above the lyric band. */
  drawBridges(s, lay, t) {
    for (const b of this.bridges) {
      if (t < b.a || t >= b.b) continue;
      const ctx = this.ctx(s, { x: 0, y: 0, w: lay.W, h: lay.band.y }, t, b);
      ctx.layout = lay;
      ctx.A = (name) => this.anchors.get(name);
      s.pushClip(0, 0, lay.W, lay.band.y);
      b.draw(ctx);
      s.popClip();
    }
  }

  frame(s, r, label, t, side) {
    const c = P.line;
    const len = 3;
    s.text(r.x, r.y, '╭' + '─'.repeat(len), c);
    s.text(r.x + r.w - len - 1, r.y, '─'.repeat(len) + '╮', c);
    s.text(r.x, r.y + r.h - 1, '╰' + '─'.repeat(len), c);
    s.text(r.x + r.w - len - 1, r.y + r.h - 1, '─'.repeat(len) + '╯', c);
    if (label) {
      const str = ` ${clipStr(label, r.w - 12)} `;
      s.text(r.x + len + 2, r.y, str, side === 'left' ? P.clay : P.mute, P.bg);
    }
  }

  activeShot(t) {
    let best = null;
    for (const sh of this.shots) if (t >= sh.a && t < sh.b) best = sh;
    return best;
  }
  prevShot(sh) {
    let best = null;
    for (const o of this.shots) if (o !== sh && o.b <= sh.a + 1e-6 && o.b > sh.a - 0.5 && (!best || o.a > best.a)) best = o;
    return best;
  }

  ctx(s, rect, t, sh) {
    const a = sh?.a ?? 0, b = sh?.b ?? 1;
    return {
      s, ...rect, t, a, b, lt: t - a, u: clamp((t - a) / (b - a)),
      film: this, F: this.F, img: this.img, fonts: this.fonts,
      W: (id, k) => this.W(id, k), pulse: (sharp, every) => this.pulse(t, sharp, every), beat: this.beat(t),
    };
  }

  drawShot(s, sh, r, t) {
    s.pushClip(r.x, r.y, r.w, r.h);
    const enter = sh.enter;
    const dur = enter?.dur ?? 0.35;
    if (enter && t < sh.a + dur) {
      const prev = this.prevShot(sh);
      if (prev) prev.draw(this.ctx(s, r, t, prev));
      // new shot into the scratch screen, then revealed cell by cell
      const tmp = this.tmp;
      tmp.clear(P.bg, P.text);
      tmp.pushClip(r.x, r.y, r.w, r.h);
      sh.draw(this.ctx(tmp, r, t, sh));
      tmp.popClip();
      this.reveal(s, tmp, r, (t - sh.a) / dur, enter.from ?? 'left', enter.seed ?? 1);
    } else {
      sh.draw(this.ctx(s, r, t, sh));
    }
    s.popClip();
  }

  /** Cell-by-cell switch from s to src over p = 0..1, with glyph noise on the cells in between. */
  reveal(s, src, r, p, from = 'left', seed = 1) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const maxd = Math.hypot(r.w / 2, r.h);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        let d;
        if (from === 'left') d = (x - r.x) / r.w;
        else if (from === 'right') d = 1 - (x - r.x) / r.w;
        else if (from === 'top') d = (y - r.y) / r.h;
        else if (from === 'center') d = Math.hypot(x - cx, (y - cy) * 2) / maxd;
        else d = hash(x, y, seed);
        d = d * 0.75 + hash(x, y, seed + 3) * 0.25;
        const q = clamp((p - d * 0.8) / 0.2);
        const i = y * s.w + x;
        if (q >= 1) s.copyCell(src, i);
        else if (q > 0) {
          s.ch[i] = decodeChar('x', q, x * 131 + y).codePointAt(0);
          s.fg[i] = mix(P.clay, P.goldHi, hash(x, y, 9));
          s.at[i] = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------ lyric band

  currentLine(t) {
    let cur = null;
    for (const l of this.lyrics.lines) {
      if (l.words[0].start <= t + 0.02) cur = l;
      else break;
    }
    return cur;
  }

  drawBand(s, r, t) {
    const y = r.y + 1;
    const W = r.w;
    // progress & beat on the right
    const mm = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
    const tc = `${mm(Math.max(0, t))} / ${mm(DURATION)}`;
    const barW = Math.max(8, Math.min(24, Math.floor(W * 0.12)));
    const rx = W - strWidth(tc) - barW - 6;
    const done = Math.round(barW * clamp(t / DURATION));
    s.text(rx, y, '━'.repeat(done), P.clayLo);
    s.text(rx + done, y, '─'.repeat(barW - done), P.line);
    s.text(rx + barW + 2, y, tc, P.dim);
    const pz = this.pulse(t, 5);
    s.text(W - 3, y, spinGlyph(t, 6), mix(P.dim, P.clay, pz));

    const line = this.currentLine(t);
    const x0 = 3;
    s.text(x0 - 1, y, '>', P.clay, KEEP, BOLD);
    if (!line) { if (Math.floor(t * 1.8) % 2 === 0) s.put(x0 + 1, y, 0x2588, P.mute); return; }
    const fadeOut = 1 - prog(t, line.end + 1.2, line.end + 2.2);
    if (fadeOut <= 0) { if (Math.floor(t * 1.8) % 2 === 0) s.put(x0 + 1, y, 0x2588, P.mute); return; }
    let x = x0 + 1;
    const maxX = rx - 3;
    let cursorX = x;
    line.words.forEach((wd, k) => {
      if (wd.start > t + 0.01 || !wd.text) return;
      const age = t - wd.start;
      const word = wd.text;
      const isCur = k === line.words.length - 1 ? t < line.end + 0.3 : line.words[k + 1].start > t;
      const low = word.toLowerCase().replace(/[^a-z-']/g, '');
      let col = P.text, at = 0;
      if (low.startsWith('execution')) { col = P.clay; at = BOLD; }
      else if (low.includes('lo-o-ove') || low === 'love') col = P.fig;
      else if (low === 'illegal' || low === 'arguments') col = P.err;
      else if (low === 'you' || low === "you're") col = P.skyHi;
      if (!isCur) col = mix(col, P.bg, 0.25);
      col = mix(P.bg, col, fadeOut);
      // the word types in: melismas over their length, short words at once
      const n = [...word].length;
      const typeDur = word.includes('-') ? Math.max(0.25, wd.end - wd.start) : 0.12;
      const shown = Math.min(n, Math.ceil(n * clamp(age / typeDur)));
      if (x + n >= maxX) return;
      let str = '';
      [...word].forEach((c, i) => {
        if (i < shown) str += age < 0.1 && i === shown - 1 ? decodeChar(c, age / 0.1, k * 7 + i) : c;
      });
      s.text(x, y, str, col, KEEP, at);
      cursorX = x + shown;
      // token id under the word, never wider than it
      if (shown === n) {
        let hsh = 2166136261;
        for (const ch of word.toLowerCase()) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 16777619);
        const digits = Math.max(1, Math.min(5, n));
        const id = String((hsh >>> 0) % 10 ** digits).padStart(digits, '0');
        s.text(x, y + 1, id, mix(P.bg, P.dim, fadeOut * (isCur ? 1 : 0.7)));
      }
      x += n + 1;
    });
    if (Math.floor(t * 1.8) % 2 === 0 && fadeOut > 0.5) s.put(cursorX, y, 0x2588, P.mute);
  }
}

export { BOLD, DIM, ITALIC, KEEP, mix, prog, easeOut };
