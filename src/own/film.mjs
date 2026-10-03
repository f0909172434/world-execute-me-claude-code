// The own-style film (docs/OWN.md): one page. The transcript runs down a main column; beside it, separated by a
// thin rule, the marginalia say what the model is doing while it speaks (candidates and their probabilities,
// thoughts, what was compacted). At the foot, the lyric line and the context window filling up.
import { P } from '../palette.mjs';
import { Film } from '../film.mjs';
import { KEEP, strWidth } from '../term.mjs';
import { clamp } from '../gfx.mjs';

const CONTEXT = 200000;

export class OwnFilm extends Film {
  constructor(opts) {
    super(opts);
    this.notes = [];            // marginalia: { a, b, draw }
    this.used = () => 0;        // tokens in the window at t
  }

  /** Draw in the margin from a to b; c.A(name) gives anchors the transcript reported this frame. */
  note(a, b, draw) { this.notes.push({ a, b, draw }); return this; }

  layout(W, H) {
    const band = 3, top = 1;
    const ph = H - top - band - 1;
    const gut = W >= 100 ? 4 : 2;
    const mw = W >= 100 ? Math.round(W * 0.34) : W >= 72 ? Math.round(W * 0.3) : 0;
    const main = W - gut * 2 - (mw ? mw + 3 : 0);
    return {
      W, H, swap: 0,
      // "left" and "right" keep their names so anchors and bridges work as in the first film
      left: { x: gut, y: top, w: main, h: ph },
      right: { x: gut + main + 3, y: top, w: mw, h: ph },
      band: { x: 0, y: H - band, w: W, h: band },
    };
  }

  drawPanes(s, lay, t) {
    const { left: L, right: R } = lay;
    s.fill(0, 0, s.w, s.h, 32, P.text, P.bg);
    this.session.draw(s, L.x, L.y, L.w, L.h, t);
    if (R.w <= 0) return;
    for (let y = L.y; y < L.y + L.h; y++) s.put(R.x - 2, y, 0x2502, P.line);
    for (const n of this.notes) {
      if (t < n.a || t >= n.b) continue;
      const c = this.ctx(s, R, t, n);
      c.layout = lay;
      c.A = (k) => this.anchors.get(k);
      s.pushClip(R.x, R.y, R.w, R.h);
      n.draw(c);
      s.popClip();
    }
  }

  /** The foot of the page: how full the window is, instead of a progress bar. */
  bandStatus(s, r, y, t) {
    const W = r.w;
    const used = Math.max(0, Math.min(CONTEXT, this.used(t)));
    const k = used >= 1000 ? `${(used / 1000).toFixed(1)}K` : String(Math.round(used));
    const label = `${k} / 200K`;
    const barW = Math.max(8, Math.min(24, Math.floor(W * 0.12)));
    const rx = W - strWidth(label) - barW - 6;
    // eighths, so the meter moves smoothly
    const fill = barW * clamp(used / CONTEXT);
    const full = Math.floor(fill), part = Math.floor((fill - full) * 8);
    const col = used / CONTEXT > 0.95 ? P.err : P.clay;
    s.text(rx - 1, y, '▕', P.line);
    s.text(rx, y, '█'.repeat(full), col);
    if (full < barW) {
      if (part) s.put(rx + full, y, 0x2590 - part, col, P.bg3);       // ▏▎▍▌▋▊▉
      s.fill(rx + full + (part ? 1 : 0), y, barW - full - (part ? 1 : 0), 1, 32, P.text, P.bg3);
    }
    s.text(rx + barW, y, '▏', P.line);
    s.text(rx + barW + 2, y, label, P.mute, KEEP);
    return rx - 1;
  }
}
