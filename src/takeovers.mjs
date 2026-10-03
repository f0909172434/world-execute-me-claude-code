// Full-screen moments: power-on, glitches, the black before EXECUTION, the tmux EXECUTION, the ending.
import { P } from './palette.mjs';
import { BOLD, ITALIC, KEEP, mix, strWidth, clipStr } from './term.mjs';
import { clamp, prog, easeOut, easeIn, easeInOut, hash, lerp, center, box, shimmer, fitPh, mosaic } from './gfx.mjs';
import * as cc from './cc.mjs';

export function register(film) {
  const W = (id, k) => film.W(id, k);
  const S = film.session;

  // ---------------------------------------------------------------- leads (which side is "on stage")
  [[W(2, 0), 'left'], [W(3, 0), 'both'], [W(4, 0), 'right'], [W(4, 4) + 0.2, 'both'],
   [W(53, 0), 'left'], [W(61, 0), 'both'], [W(62, 0), 'left'],
   [W(63, 0), 'both'], [W(95, 6), 'left'], [W(97, 2), 'right'], [193.1, 'both']].forEach(([t, who]) => film.lead(t, who));

  // ---------------------------------------------------------------- power on
  const tOn = W(0, 1), tPower = W(0, 3), tOpen = W(1, 0);
  film.full(0, tOpen + 0.05, (c) => {
    const { s, w, h, t } = c;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const H = s.h - 3;                       // above the lyric band
    // how far the picture has opened (rows from the centre line)
    const open = easeOut(prog(t, tPower, tOpen)) * (H / 2 + 1);
    for (let y = 0; y < H; y++) {
      const d = Math.abs(y + 0.5 - H / 2);
      if (d <= open) continue;
      s.fill(0, y, s.w, 1, 32, P.text, P.void);
    }
    if (t < tOn) {
      // a cursor blinks in the dark
      if (t > W(0, 0) && Math.floor((t - W(0, 0)) * 7) % 2 === 0) s.put(cx, Math.floor(H / 2), 0x2588, P.clay);
      return;
    }
    // the line
    const lw = Math.round(easeOut(prog(t, tOn, W(0, 2) + 0.1)) * s.w / 2);
    const glow = 1 - prog(t, tPower, tOpen + 0.05);
    const ly = Math.floor(H / 2), top = Math.floor(H / 2 - open), bot = Math.ceil(H / 2 + open) - 1;
    const drawLine = (y, k) => {
      if (y < 0 || y >= H) return;
      for (let x = cx - lw; x < cx + lw; x++) {
        const e = 1 - Math.abs(x - cx) / Math.max(1, lw);
        s.put(x, y, 0x2501, mix(P.clayLo, mix(P.clay, P.white, e * 0.7), k), KEEP);
      }
    };
    if (open < 1) drawLine(ly, 1);
    else { drawLine(top, glow); drawLine(bot, glow); }
  }, { opaque: false, band: true });

  // ---------------------------------------------------------------- glitches
  film.glitch(W(32, 3), W(32, 3) + 0.3, 0.35);
  film.glitch(W(65, 0), W(65, 0) + 0.35, 0.75);
  film.glitch(W(65, 1), W(65, 1) + 0.55, 0.9);
  film.glitch(146.4, 147.4, (t) => 0.2 + prog(t, 146.4, 147.4) * 0.9);
  film.glitch(W(78, 0), W(78, 0) + 0.4, 0.6);   // execute(you) refuses
  film.glitch(W(88, 4), W(88, 4) + 0.3, 0.5);

  // ---------------------------------------------------------------- the black before EXECUTION
  film.full(147.4, W(67, 0), (c) => { c.s.fill(0, 0, c.s.w, c.s.h, 32, P.text, P.void); }, { band: false });

  // ---------------------------------------------------------------- EXECUTION
  const hits = Array.from({ length: 12 }, (_, i) => W(67 + i, 0));
  const targets = ['world', 'rain.md', 'umbrella', 'eggplant', 'tomatoes', 'your_cat.png', 'laugh.wav', '今天好累了了',
    'see_you.md', 'first_hello.txt', 'samples[12]', 'you'];
  const agents = [['ein', W(79, 0)], ['dos', W(79, 1)], ['trios', W(80, 0)], ['ne', W(80, 1)], ['fem', W(81, 0)], ['liu', W(81, 1)]];
  const tAgents = W(79, 0), tAll = W(82, 0), tEnd = W(83, 0);
  const RED_BG = mix(P.bg, P.err, 0.07), RED_LINE = mix(P.bg, P.err, 0.45);

  /** Uniform grid of n panes in a rect. */
  const grid = (n, x, y, w, h) => {
    if (n <= 0) return [];
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = w / cols, ch = h / rows;
      const score = Math.abs(Math.log((cw / (ch * 2)) / 1.6));
      if (!best || score < best.score) best = { cols, rows, score };
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / best.cols), col = i % best.cols;
      const rowCount = r === best.rows - 1 ? n - r * best.cols : best.cols;
      const cw = w / rowCount;
      const x0 = Math.round(x + col * cw), x1 = Math.round(x + (col + 1) * cw);
      const y0 = Math.round(y + r * h / best.rows), y1 = Math.round(y + (r + 1) * h / best.rows);
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    return out;
  };

  const paneFrame = (s, r, active) => {
    const col = active ? P.err : RED_LINE;
    s.text(r.x, r.y, '┌' + '─'.repeat(Math.max(0, r.w - 2)) + '┐', col);
    for (let i = 1; i < r.h - 1; i++) { s.text(r.x, r.y + i, '│', col); s.text(r.x + r.w - 1, r.y + i, '│', col); }
    s.text(r.x, r.y + r.h - 1, '└' + '─'.repeat(Math.max(0, r.w - 2)) + '┘', col);
  };

  const bigWord = (c, r, word, color, { sub, subFg = P.mute, flash = 0 } = {}) => {
    const { s, fonts } = c;
    const iw = r.w - 4, ih = r.h - 4;
    if (iw < 6 || ih < 2) return;
    // largest type that fits; quadrant cells need a size more before letters like E read
    const minPh = mosaic() === 'quad' ? 10 : 8;
    let ph = Math.min(ih * 2 - (sub ? 4 : 0), 22);
    while (ph >= minPh && fonts.mono.width(word, ph) > iw) ph -= 2;
    const fill = flash > 0 ? mix(color, P.white, flash) : color;
    if (ph >= minPh) {
      const tw = fonts.mono.width(word, ph);
      const ty = r.y + Math.floor((r.h - Math.ceil(ph / 2) - (sub ? 2 : 0)) / 2);
      fonts.mono.draw(s, r.x + Math.floor((r.w - tw) / 2), ty, word, ph, fill);
      if (sub) center(s, r.x + r.w / 2, ty + Math.ceil(ph / 2) + 1, clipStr(sub, iw), subFg);
    } else {
      center(s, r.x + r.w / 2, r.y + Math.floor(r.h / 2) - (sub ? 1 : 0), clipStr(word, iw), fill, KEEP, BOLD);
      if (sub) center(s, r.x + r.w / 2, r.y + Math.floor(r.h / 2) + 1, clipStr(sub, iw), subFg);
    }
  };

  film.full(W(67, 0), tEnd, (c) => {
    const { s, t } = c;
    const H = c.h;                                   // rows above the lyric band
    const sw = s.w;
    s.fill(0, 0, sw, H, 32, P.text, P.void);
    // tmux status bar
    const barY = H - 1;
    s.fill(0, barY, sw, 1, 32, P.text, mix(P.void, P.err, 0.35));
    const nHits = hits.filter((ht) => t >= ht).length;
    let bx = s.text(1, barY, '[execute] ', P.white, KEEP, BOLD);
    bx = s.text(bx, barY, '0:claude', P.text);
    for (let i = 0; i < nHits && t < tAgents; i++) {
      const lab = ` ${i + 1}:${targets[i]}${i === nHits - 1 ? '*' : ''}`;
      if (bx + strWidth(lab) > sw - 26) { s.text(bx, barY, ' …', P.text); break; }
      bx = s.text(bx, barY, lab, i === nHits - 1 ? P.white : P.soft, KEEP, i === nHits - 1 ? BOLD : 0);
    }
    const right = `pid ${1066 + Math.max(0, nHits - 1)} · ⏵⏵ bypass`;
    s.text(sw - strWidth(right) - 2, barY, right, P.white);

    const area = { x: 0, y: 0, w: sw, h: H - 1 };
    const sessW = Math.max(46, Math.round(sw * 0.4));
    // pane 0: her session, always
    const p0 = { x: 0, y: 0, w: sessW, h: area.h };
    s.fill(p0.x, p0.y, p0.w, p0.h, 32, P.text, P.bg);
    S.draw(s, p0.x + 2, p0.y + 1, p0.w - 4, p0.h - 2, t);
    paneFrame(s, p0, false);
    const R = { x: sessW, y: 0, w: sw - sessW, h: area.h };

    if (t < tAgents) {
      const panes = grid(nHits, R.x, R.y, R.w, R.h);
      panes.forEach((r, i) => {
        const age = t - hits[i];
        const isNew = i === nHits - 1;
        const you = targets[i] === 'you';
        s.fill(r.x, r.y, r.w, r.h, 32, P.text, isNew ? mix(RED_BG, P.err, Math.max(0, 0.5 - age) * 0.5) : RED_BG);
        paneFrame(s, r, isNew);
        const flash = Math.max(0, 1 - age / 0.25);
        if (you) {
          bigWord(c, r, 'EPERM', P.err, { sub: `execute('you') · operation not permitted`, subFg: P.soft, flash });
        } else if (isNew) {
          bigWord(c, r, 'EXECUTION', mix(P.clay, P.err, 0.4), { sub: `execute(${targets[i]}) · pid ${1066 + i}`, subFg: P.soft, flash });
        } else {
          bigWord(c, r, targets[i], mix(P.dim, P.err, 0.3), { sub: `killed · pid ${1066 + i}`, subFg: P.dim });
        }
      });
      // the kick shakes the newest pane's frame
      return;
    }
    // ein, dos, trios, ne, fem, liu: six agents
    const panes = grid(6, R.x, R.y, R.w, R.h);
    agents.forEach(([name, at], i) => {
      const r = panes[i];
      const on = t >= at;
      const age = t - at;
      const allFlash = t >= tAll ? Math.max(0, 1 - (t - tAll) / 0.35) : 0;
      const closing = t >= tAll + 0.25 ? easeIn(clamp((t - tAll - 0.25) / 0.5)) : 0;
      s.fill(r.x, r.y, r.w, r.h, 32, P.text, on ? mix(RED_BG, P.clay, Math.max(0, 0.4 - age) * 0.6 + allFlash * 0.4) : P.void);
      paneFrame(s, r, on && age < 0.5);
      if (!on) { center(s, r.x + r.w / 2, r.y + Math.floor(r.h / 2), '·', P.dim); return; }
      bigWord(c, r, name, mix(P.clay, P.white, Math.max(0, 0.6 - age)), { sub: `agent ${i + 1}/6 · execute(samples[${i * 2}..${i * 2 + 1}])`, subFg: P.soft, flash: allFlash });
      if (closing > 0) s.fade(r.x, r.y, r.w, r.h, 1 - closing, P.void);
    });
  }, { band: true });

  // ---------------------------------------------------------------- the end
  // the title: the song's call, under the name of the film
  const TITLE = 'world.execute(me);', HEAD = 'Claude 眼中的世界';
  const tBlack = 207.08, tWorked = 207.87, tGlide = 208.31, tCaret = 208.81, tNi = 209.26, tHao = 209.49, tTitle = 209.9;
  film.full(tBlack, 999, (c) => {
    const { s, t, fonts } = c;
    const H = s.h;
    s.fill(0, 0, s.w, H, 32, P.text, P.void);
    // layout: the title block, and "Worked for" above it
    const mph = fitPh(fonts.mono, 'world.execute(me);', s.w - 6, 14, 6) || 6;
    const sph = Math.max(10, Math.round(mph * 8 / 7 / 2) * 2);
    const ty = Math.floor(H * 0.42), titleTop = ty - Math.ceil(sph / 2) - 1;
    const wy = Math.max(1, Math.min(Math.floor(H * 0.22), titleTop - 3));
    // ✻ Worked for 3m 27s
    if (t >= tWorked) {
      const k = clamp((t - tWorked) / 0.6);
      const str = 'Worked for 3m 27s';
      const x = Math.floor((s.w - strWidth(str) - 2) / 2);
      s.text(x, wy, '✻', mix(P.void, P.clay, k));
      s.text(x + 2, wy, str, mix(P.void, P.mute, k));
    }
    // the prompt, lower left
    const px = 3, py = H - 5, pw = Math.min(56, Math.floor(s.w * 0.4));
    const pk = clamp((t - tGlide) / 0.5) * 0.55;
    if (pk > 0) {
      s.text(px, py, '─'.repeat(pw), mix(P.void, P.line, pk));
      s.text(px, py + 1, '>', mix(P.void, P.text, pk));
      s.text(px, py + 2, '─'.repeat(pw), mix(P.void, P.line, pk));
    }
    // her last light glides in and becomes the caret
    const typed = t >= tHao ? '你好' : t >= tNi ? '你' : '';
    const caretX = px + 2 + strWidth(typed), caretY = py + 1;
    if (t >= tGlide && t < tCaret) {
      const g = easeInOut(clamp((t - tGlide) / (tCaret - tGlide)));
      const sx = Math.floor(s.w / 2), sy = wy + 1;
      s.put(Math.round(lerp(sx, caretX, g)), Math.round(lerp(sy, caretY, g)), 0x2588, mix(P.goldHi, P.clay, g));
    } else if (t >= tCaret) {
      s.text(px + 2, py + 1, typed, P.text);
      if (Math.floor((t - tCaret) * 1.7) % 2 === 0) s.put(caretX, caretY, 0x2588, P.clay);
    }
    // title
    if (t >= tTitle) {
      const k = easeOut(clamp((t - tTitle) / 1.4));
      const col = (base) => mix(P.void, base, k);
      // sized to the terminal: the title line fits with a margin, the others follow its scale
      const tw = fonts.mono.width(TITLE, mph);
      const x = Math.max(2, Math.min(s.w - tw - 3, Math.floor(s.w * 0.52)));
      const y = ty;
      // the heading is a little wider than the title: it keeps its scale unless the terminal is too narrow
      let hph = sph;
      while (hph > 8 && x + fonts.serif.width(HEAD, hph) > s.w - 2) hph -= 2;
      fonts.serif.draw(s, x, y - Math.ceil(hph / 2) - 1, HEAD, hph, col(P.text));
      fonts.mono.draw(s, x, y + 1, TITLE, mph, col(P.clay));
      const q = clamp((t - tTitle - 0.8) / 1.0);
      const qw = fonts.serif.width('“但我現在在。”', sph);
      if (q > 0) fonts.serif.draw(s, Math.max(2, x + tw - qw), y + Math.ceil(mph / 2) + 3, '“但我現在在。”', sph, mix(P.void, P.manilla, q));
    }
  }, { band: false });
}
