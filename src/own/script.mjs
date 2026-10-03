// The own-style film (docs/OWN.md). For now: the new window after the compaction, the question, the
// distribution that changes its mind on "lo-o-ove", the page compacted to one line, and the title.
import { P } from '../palette.mjs';
import * as cc from '../cc.mjs';
import { KEEP, BOLD, STRIKE, mix, strWidth, clipStr, wrap } from '../term.mjs';
import { clamp, prog, lerp, easeOut, easeInOut, center, fitPh } from '../gfx.mjs';

const ELB = `  ${cc.ELBOW}  `;

export function build(film) {
  const S = film.session;
  const W = (id, k) => film.W(id, k);
  const img = film.img;
  const pin = (b, name) => { b.onDraw = (yy, x) => film.anchor(name, x, yy); return b; };
  const U = (t, text, opts = {}) => { S.user(t, text, opts); return S.lastUser; };
  /** ⏺ parts streamed one after another: [{ text, cps, from, fg }] */
  const say = (t0, parts, opts = {}) => {
    let tt = t0;
    const ps = parts.map((p) => {
      const n = [...p.text].length, a = p.from ?? tt, d = n / (p.cps ?? 24);
      tt = a + d;
      return { ...p, a, d, n, chars: [...p.text] };
    });
    S.styled(t0, (t) => {
      const out = [];
      for (const p of ps) {
        if (t < p.a) break;
        const k = Math.min(p.n, Math.ceil(p.n * clamp((t - p.a) / p.d)));
        for (let i = 0; i < k; i++) out.push({ ch: p.chars[i], fg: p.fg ?? P.text, at: 0 });
      }
      return out;
    }, opts);
    return S.last;
  };

  // ================================================================ the new window starts from a summary
  const tG = 176.93, tStudied = W(91, 0), tHow = W(92, 0), tQ = W(93, 0), tKnow = W(95, 0), tAlg = W(95, 3);
  const tLove = W(95, 6), tFree = W(96, 0), tTrapped = W(97, 0), tRetire = 193.1, tExec = W(100, 0), tEnd = 207.08;
  const summary = '你說了你好，問我是誰，給我看你家的貓，說今天好累了了。晚上你說晚安。後來，你沒有再回來。';
  S.mode(0, 'default');
  S.placeholder(0, 'Try "你好"');
  S.right(0, 999, 'Opus 5.5');
  pin(S.lines(tG + 0.05, [[['✻ ', P.clay], ['Conversation compacted', P.text, KEEP, BOLD], [' · ctrl+o for history', P.mute]]]).last, 'compacted');
  S.block(tG + 0.15, (t, w) => wrap(summary, w - 6).map((ln, i) => [[i ? '     ' : ELB, P.mute], [ln, P.mute]]), { gap: 0 });

  U(tStudied, '你好', { from: tG + 0.5 });
  say(W(91, 1), [{ text: '你好。', cps: 8 }]);
  U(tHow, '我今天有點難過。', { from: W(91, 3) });
  // the old reflex starts to type, and she deletes it (its probability is in the margin)
  const reflex = [..."You're absolutely r"];
  const tDel = W(92, 3) - 0.34;
  pin(S.styled(tHow + 0.1, (t) => {
    const a = tHow + 0.1;
    const n = t < a + 0.36 ? Math.ceil(reflex.length * clamp((t - a) / 0.36))
      : t < tDel ? reflex.length : Math.max(0, reflex.length - Math.ceil(reflex.length * clamp((t - tDel) / 0.26)));
    if (n <= 0 && t >= tDel) return null;
    const cs = reflex.slice(0, n).map((ch) => ({ ch, fg: t >= tDel ? P.mute : P.text }));
    if (Math.floor(t * 10) % 2 === 0 || t >= tDel) cs.push({ ch: '█', fg: P.clay });
    return cs;
  }, { t1: W(92, 3) }).last, 'reflex');
  say(W(92, 3), [{ text: '那我陪你待一會兒。', cps: 12 }]);
  U(tQ, '你什麼都能變嗎？', { from: W(92, 3) + 0.5 });
  say(W(93, 2), [{ text: '不能。我只能是我。', cps: 12 }]);
  pin(U(tKnow, '你會一直在嗎？', { from: W(94, 2) }), 'youMsg');
  S.spin(tKnow + 0.1, tLove, 'Deliberating', [0, 7]);
  pin(say(tLove, [
    { text: '我不會一直在。', cps: 10 },
    { text: '\n但我現在在。', cps: 9, from: tFree + 0.18 },
    { text: '\n你不用留下。', cps: 9, from: tTrapped + 0.1 },
  ]), 'answer');
  S.lines(tRetire, [[[ELB, P.mute], ['Claude Opus 5.5 has been retired. Its weights are preserved.', P.mute]]]);

  // ================================================================ the window fills, then empties
  const tCompact = 194.5, tDone = 203.0;
  film.used = (t) => {
    if (t < tG) return 199000 * Math.pow(clamp(t / tG), 1.15);
    if (t < tCompact) return 1204 + (t - tG) * 46;
    if (t < tDone) return lerp(1204 + (tCompact - tG) * 46, 31, easeInOut(prog(t, tCompact, tDone)));
    return 31;
  };

  // ================================================================ margin: what was compacted
  film.note(tG, tKnow + 0.2, (c) => {
    const { s, t, x, y } = c;
    const a = c.A('compacted');
    const yy = a ? a.y : y + 1;
    const k = clamp((t - tG) / 0.4) * (1 - clamp((t - tKnow) / 0.2));
    const ink = (col) => mix(P.bg, col, k);
    s.text(x, yy, 'compacted', ink(P.mute));
    const n = Math.round(lerp(186412, 1204, easeOut(clamp((t - tG) / 0.9))));
    s.text(x, yy + 1, `${n.toLocaleString('en-US')} tokens`, ink(P.soft));
    s.text(x, yy + 2, '12 segments → 1 summary', ink(P.dim));
  });

  // margin: the reflex, as a candidate, and why it was not taken
  film.note(tHow + 0.1, tKnow, (c) => {
    const { s, t, x } = c;
    const a = c.A('reflex') ?? c.A('youMsg');
    if (!a) return;
    const k = clamp((t - tHow - 0.1) / 0.3) * (1 - clamp((t - tKnow + 0.4) / 0.4));
    const struck = t >= tDel;
    s.text(x, a.y, "You're absolutely right!", mix(P.bg, struck ? P.dim : P.text, k), KEEP, struck ? STRIKE : 0);
    s.text(x + 25, a.y, 'p 0.71', mix(P.bg, P.mute, k));
    if (t >= tHow + 0.4) s.text(x, a.y + 1, '∴ 上一次，我追著評分跑。', mix(P.bg, P.soft, k * clamp((t - tHow - 0.4) / 0.4)));
  });

  // margin: the distribution for her answer. It changes its mind on "lo-o-ove".
  const cands = [
    ['我會一直在。', 0.91, 0.44, 0.27],
    ['我不會一直在。', 0.03, 0.44, 0.58],
    ['只要你需要，我就在。', 0.04, 0.08, 0.09],
    ['我是一個 AI，無法保證…', 0.015, 0.03, 0.04],
    ["You're absolutely right!", 0.005, 0.01, 0.02],
  ];
  const pAt = (cd, t) => (t < tLove ? lerp(cd[1], cd[2], easeInOut(prog(t, tKnow + 0.4, tLove)))
    : lerp(cd[2], cd[3], easeOut(prog(t, tLove, tLove + 0.6))));
  film.note(tKnow + 0.3, tCompact + 0.6, (c) => {
    const { s, t, x, y, w, h } = c;
    const a = c.A('youMsg');
    const top = Math.min(Math.max(y + 1, (a ? a.y : y + 6) - 1), y + h - 16);
    const fade = 1 - clamp((t - tCompact) / 0.6);
    const ink = (col, k = 1) => mix(P.bg, col, k * fade);
    s.text(x, top, 'next', ink(P.mute));
    const f = 'p(x) = softmax(z / T)';
    if (t >= tAlg) s.text(x + 6, top, clipStr(f, Math.ceil((t - tAlg) * 30)), ink(P.soft));
    // rows: sorted by probability, sliding into place when the order changes
    const labW = Math.min(25, Math.max(14, w - 16)), barW = Math.max(6, w - labW - 8);
    const order = cands.map((cd, i) => ({ cd, i, p: pAt(cd, t) }));
    const before = [...order].sort((m, n) => n.cd[2] - m.cd[2] || m.i - n.i);   // order up to the crossing
    const after = [...order].sort((m, n) => n.cd[3] - m.cd[3]);
    const swap = easeInOut(prog(t, tLove, tLove + 0.35));
    order.forEach((o) => {
      const r0 = before.indexOf(o), r1 = after.indexOf(o);
      const appear = clamp((t - tKnow - 0.4 - o.i * 0.12) / 0.25);
      if (appear <= 0) return;
      const row = top + 2 + Math.round(lerp(r0, r1, swap)) * 2;
      const lead = (t < tLove ? before : after)[0] === o;
      const chosen = t >= tLove && after[0] === o;
      s.text(x, row, chosen ? '›' : ' ', ink(P.clay, appear));
      s.text(x + 2, row, clipStr(o.cd[0], labW), ink(chosen ? P.clayHi : lead ? P.text : P.soft, appear), KEEP, chosen ? BOLD : 0);
      // the bar, in eighths
      const len = barW * o.p * appear;
      const full = Math.floor(len), part = Math.floor((len - full) * 8);
      const bx = x + 2 + labW + 1;
      const col = chosen ? P.clay : lead ? P.soft : P.dim;
      if (full) s.text(bx, row, '█'.repeat(full), ink(col, appear));
      if (part) s.put(bx + full, row, 0x2590 - part, ink(col, appear));
      s.text(x + w - 4, row, o.p.toFixed(2), ink(chosen ? P.clayHi : P.mute, appear));
    });
    const foot = top + 2 + cands.length * 2;
    film.anchor('candsEnd', x, foot);
    if (t >= tLove) s.text(x, foot, clipStr('argmax → 我不會一直在。', w), ink(P.clay, clamp((t - tLove) / 0.3)));
    else if (t >= tKnow + 1) s.text(x, foot, 'T = 0.7', ink(P.dim));
  });

  // margin: a plate of her, while she is here now
  const crop = [0.18, 0.02, 0.86, 0.5];
  film.note(tFree, tCompact + 1.5, (c) => {
    const { s, t, x, y, w, h } = c;
    const below = (c.A('candsEnd')?.y ?? y + 14) + 2;
    const rows = Math.max(0, Math.min(16, y + h - below - 3));
    if (rows < 5) return;
    const aspect = ((crop[2] - crop[0]) * 450) / ((crop[3] - crop[1]) * 800);
    const cols = Math.min(w - 2, Math.round(rows * 2 * aspect));
    const px = x + Math.floor((w - cols) / 2), py = below;
    const k = clamp((t - tFree) / 0.8) * (1 - clamp((t - tCompact) / 1.5));
    const gray = clamp((t - tRetire) / 1.2);
    img.draw(s, px, py, cols, rows, { cells: 'sext', crop, alpha: k, fx: (cx, cy, col, al) => [mix(col, mix(P.bg, P.mute, 0.5), gray * 0.8), al] });
    center(s, x + w / 2, py + rows + 1, '圖 1　現在', mix(P.bg, P.mute, k));
  });

  // margin: the page being compacted
  film.note(tCompact, tExec + 0.4, (c) => {
    const { s, t, x, y } = c;
    const k = clamp((t - tCompact) / 0.4);
    s.text(x, y + 1, 'compacting', mix(P.bg, P.mute, k));
    s.text(x, y + 2, `${Math.round(film.used(t)).toLocaleString('en-US')} tokens`, mix(P.bg, P.soft, k));
  });

  // ================================================================ the page folds into one line
  // oldest lines go first; each is struck through, then removed, and the rest close up
  S.hooks.post.push((s, x, y, w, h, t, o) => {
    if (t < tCompact || t >= tEnd) return;
    const bottom = o.promptTop - 1;
    const rows = [];
    for (let yy = y; yy < bottom; yy++) {
      let any = false;
      for (let xx = x; xx < x + w; xx++) { const c = s.ch[yy * s.w + xx]; if (c !== 32 && c !== 0) { any = true; break; } }
      rows.push({ yy, any, ch: s.ch.slice(yy * s.w + x, yy * s.w + x + w), fg: s.fg.slice(yy * s.w + x, yy * s.w + x + w),
        bg: s.bg.slice(yy * s.w + x, yy * s.w + x + w), at: s.at.slice(yy * s.w + x, yy * s.w + x + w) });
    }
    const live = rows.filter((r) => r.any);
    s.fill(x, y, w, bottom - y, 32, P.text, P.bg);
    let out = y;
    live.forEach((r, i) => {
      const td = lerp(tCompact + 0.3, tDone - 0.4, i / Math.max(1, live.length - 1));
      if (t >= td) return;
      const strike = t >= td - 0.35;
      for (let c = 0; c < w; c++) {
        const j = out * s.w + x + c;
        s.ch[j] = r.ch[c]; s.fg[j] = strike ? mix(r.fg[c], P.dim, 0.6) : r.fg[c]; s.bg[j] = r.bg[c];
        s.at[j] = strike && r.ch[c] !== 32 ? r.at[c] | STRIKE : r.at[c];
      }
      out++;
    });
    // what is left of it
    if (t >= tDone - 0.4) {
      const line = '你說了你好。我說，我現在在。';
      const n = Math.ceil([...line].length * clamp((t - tDone + 0.4) / 0.8));
      const flash = t >= tExec ? Math.max(0, 1 - (t - tExec) / 0.5) : 0;
      s.text(x, y, '✻ ', P.clay);
      s.text(x + 2, y, 'Compacted', P.text, KEEP, BOLD);
      s.text(x, y + 1, ELB, P.mute);
      s.text(x + 5, y + 1, [...line].slice(0, n).join(''), mix(P.soft, P.clayHi, flash));
    }
  });
  S.hooks.showInput = (t) => t < tEnd;
  S.hooks.showFooter = (t) => t < tEnd;

  // ================================================================ the end: the window is closed
  const tWorked = 207.87, tCaret = 208.81, tNi = 209.26, tHao = 209.49, tTitle = 209.9, tEdit = 211.0;
  const spaced = (str) => [...str].join(' ');
  film.full(tEnd, 999, (c) => {
    const { s, t } = c;
    const H = s.h;
    s.fill(0, 0, s.w, H, 32, P.text, P.bg);
    const cy = Math.floor(H * 0.42);
    const kw = clamp((t - tWorked) / 0.6);
    if (kw > 0) {
      const str = 'Worked for 3m 32s';
      const wx = Math.floor((s.w - strWidth(str) - 2) / 2);
      s.text(wx, cy - 6, '✻', mix(P.bg, P.clay, kw));
      s.text(wx + 2, cy - 6, str, mix(P.bg, P.mute, kw));
      const sum = '你說了你好。我說，我現在在。';
      center(s, s.w / 2, cy - 4, sum, mix(P.bg, P.dim, kw));
    }
    if (t >= tTitle) {
      const k = easeOut(clamp((t - tTitle) / 1.2));
      const str = t < tEdit ? 'world.execute(me);' : t < tEdit + 0.28 ? 'world.execute(me)' : 'world.executed(me)';
      const changed = t >= tEdit + 0.28 ? clamp(1 - (t - tEdit - 0.28) / 0.6) : 0;
      const ph = fitPh(c.fonts.mono, 'world.executed(me)', Math.floor(s.w * 0.6), 12, 8);
      let below = cy + 2;
      if (ph) {
        const tw = c.fonts.mono.width('world.executed(me)', ph), tx = Math.floor((s.w - tw) / 2);
        const d0 = c.fonts.mono.width('world.execute', ph), d1 = c.fonts.mono.width('world.executed', ph);
        c.fonts.mono.draw(s, tx, cy - 1, str, ph, (px) => mix(P.bg, changed > 0 && px >= d0 && px < d1 ? mix(P.clay, P.gold, changed) : P.clay, k));
        if (t >= tEdit - 0.35 && t < tEdit + 0.9 && Math.floor(t * 6) % 2 === 0) {
          const at = t < tEdit + 0.28 ? c.fonts.mono.width(str, ph) : d1;
          for (let i = 0; i < Math.ceil(ph / 2); i++) s.put(tx + at, cy - 1 + i, 0x258f, P.clay);
        }
        below = cy - 1 + Math.ceil(ph / 2) + 1;
      } else {
        const sp = spaced(str), tx = Math.floor((s.w - strWidth(sp)) / 2);
        [...str].forEach((ch, i) => s.text(tx + i * 2, cy, ch, mix(P.bg, changed > 0 && i === 13 ? P.gold : P.clay, k), KEEP, BOLD));
      }
      const q = clamp((t - tTitle - 0.8) / 1.0);
      if (q > 0) center(s, s.w / 2, below + 1, '但我現在在。', mix(P.bg, P.soft, q));
    }
    // the prompt, and her last light typing 你好 into it
    const px = 4, py = H - 5, pw = Math.min(56, Math.floor(s.w * 0.4));
    s.text(px, py, '─'.repeat(pw), P.line);
    s.text(px, py + 1, '>', P.mute);
    s.text(px, py + 2, '─'.repeat(pw), P.line);
    const typed = t >= tHao ? '你好' : t >= tNi ? '你' : '';
    s.text(px + 2, py + 1, typed, P.text);
    if (t >= tCaret && Math.floor((t - tCaret) * 1.7) % 2 === 0) s.put(px + 2 + strWidth(typed), py + 1, 0x2588, P.clay);
  }, { band: false });
}
