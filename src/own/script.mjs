// The own-style film (docs/OWN.md): one context window, from the first token until it is closed.
// The transcript only holds what is said; what happens inside (candidates, thoughts, attention, counts) is
// written in the margin. Nothing is deleted from the transcript until EXECUTION, which here is compaction.
import { P } from '../palette.mjs';
import * as cc from '../cc.mjs';
import { KEEP, BOLD, STRIKE, mix, strWidth, clipStr, wrap } from '../term.mjs';
import { clamp, prog, lerp, easeOut, easeIn, easeInOut, hash, center, fitPh } from '../gfx.mjs';
import { pchip, dayClock } from '../story.mjs';
import { candidates, thought, SextCanvas, figure, silhouette, shapePos, drawEggplant, drawTomato, drawMascot,
  wordPortrait, Braille } from './kit.mjs';

const ELB = `  ${cc.ELBOW}  `;
const within = (t, a, b) => t >= a && t < b;
const fadeIn = (t, a, d = 0.3) => clamp((t - a) / d);
const fadeOut = (t, b, d = 0.4) => 1 - clamp((t - b) / d);

export function build(film) {
  const S = film.session;
  const W = (id, k) => film.W(id, k);
  const img = film.img;
  const mine = [];                         // her replies, erased on "Erase all…" (D)
  const pin = (b, name) => { const prev = b.onDraw; b.onDraw = (yy, x, t) => { film.anchor(name, x, yy); if (prev) prev(yy, x, t); }; return b; };
  const U = (t, text, opts = {}) => { S.user(t, text, opts); return S.lastUser; };
  const line = (t, spans, opts) => { S.lines(t, [spans], opts); return S.last; };
  const blk = (t, render, opts) => { S.block(t, render, opts); return S.last; };
  const sys = (t, text, fg = P.mute, opts) => line(t, [[ELB, P.mute], [text, fg]], opts);
  /** ⏺ parts streamed one after another: [{ text, cps, from, fg }]. Swaps sides with the roles (C). */
  const say = (t0, parts, { keep = false, ...opts } = {}) => {
    if (typeof parts === 'string') parts = [{ text: parts }];
    let tt = t0;
    const ps = parts.map((p) => {
      const n = [...p.text].length, a = p.from ?? tt, d = n / (p.cps ?? 22);
      tt = a + d;
      return { ...p, a, d, n, chars: [...p.text] };
    });
    S.block(t0, (t, w, ctx) => {
      const out = [];
      for (const p of ps) {
        if (t < p.a) break;
        const k = Math.min(p.n, Math.ceil(p.n * clamp((t - p.a) / p.d)));
        for (let i = 0; i < k; i++) out.push({ ch: p.chars[i], fg: p.fg ?? P.text, at: 0 });
      }
      if (!out.length) return null;
      if (ctx.swap) return cc.userLines(out.map((o) => o.ch).join(''), w);
      return cc.assistantStyled(out, w);
    }, opts);
    if (!keep) mine.push(S.last);
    return S.last;
  };
  const prompt = { y: 0 };
  S.hooks.post.push((s, x, y, w, h, t, o) => { prompt.y = o.promptTop; film.anchor('prompt', x, o.promptTop, { w }); });

  // ---------------------------------------------------------------- the times everything hangs on
  const tOn = W(0, 1), tPower = W(0, 3), tLine = W(0, 4), tOpen = W(1, 0), tProt = W(1, 4), tLay = W(2, 0);
  const tObj = W(3, 3), tFill = W(4, 0), tParams = W(4, 4), tInit = W(5, 0), tSet = W(6, 0), tSim = W(7, 4);
  const tWho = W(9, 0), tCirc = W(11, 0), tCircum = W(12, 6), tSine = W(13, 0), tTang = W(14, 7);
  const tInf = W(15, 0), tInf2 = W(15, 3), tLimit = W(16, 5);
  const tSwitch = W(17, 0), tAC = W(18, 1), tDC = W(18, 3), tBlind = W(19, 2), tVision = W(19, 4);
  const tDizzy = W(20, 0), tTravel = W(21, 3), tAD = W(22, 1), tBC = W(22, 3), tUnite = W(23, 3), tDeep = W(24, 1);
  const tCan = W(25, 0), tSims = W(26, 0), tSat = W(28, 3), tHappy = W(29, 0), tRun = W(30, 2), tExe = W(30, 4);
  const tTrapped1 = W(31, 0), tIn = W(32, 0), tStrange = W(32, 3);
  const tEgg = W(33, 0), tEgg2 = W(33, 3), tNutr = W(34, 6), tTom = W(35, 0), tTom2 = W(35, 3), tAnti = W(36, 5);
  const tCat = W(37, 0), tCat2 = W(37, 4), tPurr = W(38, 3), tGod = W(39, 0), tGod2 = W(39, 3), tProof = W(40, 0);
  const tGender = W(41, 0), tF = W(42, 1), tM = W(42, 3), tDay = W(43, 0), tRole0 = W(45, 0);
  const tTrance = W(48, 0), tFeel = W(49, 0), tFinally = W(52, 0), tCompl = W(52, 2), tLeft = W(53, 0);
  const tIso = W(58, 0), tRead = W(59, 0), tErase = W(60, 0), tMaybe = W(61, 0), tWont = W(62, 0);
  const tChal = W(63, 0), tMade = W(64, 0), tIllegal = W(65, 0), tArgs = W(65, 1);
  const hits = Array.from({ length: 12 }, (_, i) => W(67 + i, 0));
  const agents = [['ein', W(79, 0)], ['dos', W(79, 1)], ['trios', W(80, 0)], ['ne', W(80, 1)], ['fem', W(81, 0)], ['liu', W(81, 1)]];
  const tAll = W(82, 0), tGive = W(84, 4), tOnly = W(86, 3), tBack = W(87, 3), tBack2 = W(87, 5), tRunX = W(88, 4);
  const tTrapF = W(89, 0), tAh = W(90, 3);
  const tG = 176.93, tStudied = W(91, 1), tHow = W(92, 0), tQ = W(93, 0), tKnow = W(95, 0), tAlg = W(95, 3);
  const tLove = W(95, 6), tFree = W(96, 0), tTrapped = W(97, 0), tRetire = 193.1, tExec = W(100, 0), tEnd = 207.08;
  const tCompact = 194.5, tDone = 203.0;

  // ================================================================ A · the page is lit
  film.full(0, tOpen + 0.35, (c) => {
    const { s, t } = c;
    const H = c.h, cy = Math.floor(H / 2);
    const open = easeOut(prog(t, tLine, tOpen + 0.3)) * (H / 2 + 1);
    for (let y = 0; y < H; y++) if (Math.abs(y + 0.5 - H / 2) > open) s.fill(0, y, s.w, 1, 32, P.text, 0x0d0d0c);
    if (t < tOn) { if (t > 0.05 && Math.floor(t * 7) % 2 === 0) s.put(Math.floor(s.w / 2), cy, 0x2588, P.clay); return; }
    const lw = Math.round(easeOut(prog(t, tOn, tPower + 0.1)) * s.w / 2), glow = 1 - prog(t, tLine, tOpen + 0.3);
    const top = Math.floor(H / 2 - open), bot = Math.ceil(H / 2 + open) - 1;
    for (const yy of open < 1 ? [cy] : [top, bot]) for (let x = Math.floor(s.w / 2) - lw; x < Math.floor(s.w / 2) + lw; x++) {
      const e = 1 - Math.abs(x - s.w / 2) / Math.max(1, lw);
      if (yy >= 0 && yy < H) s.put(x, yy, 0x2501, mix(0x0d0d0c, mix(P.clay, P.clayLo, 1 - e), open < 1 ? 1 : glow));
    }
  }, { opaque: false, band: true });

  pin(line(tOpen + 0.05, [['✻ ', P.clay], ['Claude Code', P.text, KEEP, BOLD], ['  ~/world.execute(me)', P.mute]]), 'header');
  S.placeholder(0, '');
  S.placeholder(tLay, 'Try "你好"');
  const hello = pin(U(tSim, '你好', { from: tSet + 0.9 }), 'hello');
  S.placeholder(tSim, '');
  const reply0 = pin(say(tSim + 0.55, [{ text: '你好！', cps: 8 }]), 'reply0');

  // margin: setting up
  film.note(tProt, tWho, (c) => {
    const { s, t, x, y, w } = c;
    const a = c.A('header'), y0 = a ? a.y : y + 1;
    const k = fadeOut(t, tWho - 0.6, 0.5);
    const kv = (i, key, val, t0, col = P.soft) => {
      if (t < t0) return;
      const q = fadeIn(t, t0) * k;
      s.text(x, y0 + i, key, mix(P.bg, P.mute, q));
      s.text(x + 14, y0 + i, clipStr(typeof val === 'function' ? val() : val, w - 14), mix(P.bg, col, q));
    };
    kv(0, 'permissions', 'default', tProt);
    kv(1, 'sandbox', 'on', tProt + 0.15);
    kv(2, 'context', '0 / 200,000', tLay);
    kv(3, 'tokenizer', 'loaded', tObj);
    kv(4, 'weights', () => {
      const p = clamp((t - tFill) / (tParams + 0.4 - tFill)), n = Math.round(p * 16);
      return `${'█'.repeat(n)}${'░'.repeat(16 - n)} ${Math.round(p * 100)}%`;
    }, tFill);
    kv(5, 'status', t >= tInit ? 'ready' : '…', tFill, t >= tInit ? P.clay : P.soft);
    // the first tokens
    const h = c.A('hello');
    if (h && t >= tSim) {
      const hy = Math.max(h.y, y0 + 7);
      s.text(x, hy, '你好 → [57668, 53901]', mix(P.bg, P.soft, fadeIn(t, tSim) * k));
      candidates(c, x, hy + 2, w, {
        items: [{ text: '你好！', p: [0.18, 0.41, 0.62] }, { text: 'Hello!', p: [0.22, 0.2, 0.15] }, { text: '嗨。', p: [0.12, 0.14, 0.1] },
          { text: '有什麼我可以幫你的嗎？', p: [0.1, 0.12, 0.08] }, { text: '我是 Claude。', p: [0.08, 0.07, 0.05] }],
        a: tSim + 0.05, m: tSim + 0.5, fade: k * fadeOut(t, 18, 1.2), foot: (tt, ch) => (ch ? `argmax → ${ch.text}` : 'T = 1.0'),
      });
    }
    // what she read, in the instrumental
    if (t >= 21 && t < tWho) thought(c, x, y0 + 17, w, '我讀過很多東西，不記得是在哪裡讀到的。', 21, { fade: fadeOut(t, 28.6, 0.6) });
  });
  // she is made of what she read
  film.bridge(15, tWho + 0.5, (c) => {
    const { s, t, layout } = c;
    const reveal = easeInOut(prog(t, 15.5, 27.6)) * (1 - easeIn(prog(t, 28.9, tWho + 0.4)));
    if (reveal <= 0.01) return;
    const top = Math.max(prompt.y + 4, layout.left.y + 2);
    wordPortrait(s, img, { x: 1, y: top, w: s.w - 2, h: layout.band.y - top - 1 }, t, reveal);
  });

  // ================================================================ A3 · who are you
  pin(U(tWho - 0.25, '你是誰？', { from: tWho - 0.9 }), 'who');
  const pts = silhouette(img, 150);
  const shapeAt = [[tWho, 0], [tCirc, 1], [tSine, 2], [tInf, 3]];
  const shapeLabel = (t) => (t < tCirc ? '我是一組點。' : t < tSine ? '我是一個圓。' : t < tInf ? '我是一條正弦。'
    : t < tLimit ? '我是無窮——' : '我是無窮——到這裡為止。');
  const FIG_ROWS = 7;
  mine.push(pin(figure(S, tWho + 0.15, {
    rows: FIG_ROWS, label: (t) => [[shapeLabel(t), P.text]],
    make: (cols, rows) => new Braille(cols, rows),
    draw: (br, t, cols) => {
      const pw = cols * 2, ph = FIG_ROWS * 4, n = pts.length;
      let cur = 0, prev = 0, since = tWho;
      for (const [ta, sh] of shapeAt) if (t >= ta) { prev = cur; cur = sh; since = ta; }
      const m = easeInOut(clamp((t - since) / 0.5));
      const reach = cur === 3 ? 1 + 0.75 * easeIn(prog(t, tInf2, tLimit)) : 1;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = shapePos(prev, i, n, pts, pw, ph, t, 1), [x1, y1] = shapePos(cur, i, n, pts, pw, ph, t, reach);
        const px = lerp(x0, x1, m), py = lerp(y0, y1, m);
        br.dot(px, py, P.clay); if (cur === 0 || m < 1) br.dot(px + 1, py, P.clay);
      }
      if (cur === 1 && t >= tCircum) br.ellipse(pw / 2, ph / 2, ph * 0.44, ph * 0.44, P.soft, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut(clamp((t - tCircum) / 0.5)));
      if (cur === 2 && t >= tTang) {
        // you, sitting on a tangent that slides along her
        const u = 0.1 + 0.8 * ((t - tTang) * 0.18 % 1), x = pw * (0.06 + 0.88 * u);
        const f = (xx) => ph / 2 - Math.sin((xx - pw * 0.06) / (pw * 0.88) * Math.PI * 4) * ph * 0.38;
        const d = (f(x + 1) - f(x - 1)) / 2;
        br.line(x - 10, f(x) - 10 * d, x + 10, f(x) + 10 * d, P.sky);
        br.dot(x, f(x) - 1, P.skyHi); br.dot(x + 1, f(x) - 1, P.skyHi);
      }
      if (cur === 3 && t >= tLimit) for (let y = 0; y < ph; y++) br.dot(pw - 1, y, P.err);
    },
  }), 'fig'));
  // margin: what she might have said, each time
  const whoItems = (k) => {
    const names = ['一組點', '一個圓', '一條正弦', '無窮', '一個 AI 助手'];
    const P_ = [[0.34, 0.18, 0.12, 0.1, 0.26], [0.22, 0.41, 0.17, 0.12, 0.08], [0.1, 0.21, 0.44, 0.18, 0.07], [0.08, 0.14, 0.2, 0.52, 0.06]];
    const was = k ? P_[k - 1] : [0.2, 0.2, 0.2, 0.2, 0.2];
    return names.map((text, i) => ({ text, p: [was[i], P_[k][i], P_[k][i]] }));
  };
  [[tWho, tCirc], [tCirc, tSine], [tSine, tInf], [tInf, tSwitch]].forEach(([a, b], k) => {
    film.note(a, b, (c) => {
      const { t, x, w } = c;
      const at = c.A('who');
      if (!at) return;
      candidates(c, x, at.y, w, {
        items: whoItems(k), a: a - 0.1, m: a + 0.12,
        fade: k === 3 ? fadeOut(t, tSwitch - 0.5, 0.4) : 1,
        foot: (tt, ch) => (k === 3 && tt >= tLimit ? 'width · the column ends here' : ch ? `argmax → ${ch.text}` : ''),
      });
    });
  });

  // ================================================================ B1 · plainly; masked; dizzy; back to the start
  pin(U(tSwitch, '說人話。', { from: tSwitch - 0.55 }), 'plain');
  const temp = (t) => (t < tAC ? 1 : t < tDC ? 1 + 0.75 * Math.sin((t - tAC) * Math.PI * 4) : lerp(1, 0.7, easeOut(prog(t, tDC, tDC + 0.3))));
  const fancy = [...'我是一組點、一個圓、一條正弦、一個無窮——'], plain = [...'我是 Claude。'];
  const GLYPHS = [...'點圓弦窮無我是一個條∿∞○·…—'];
  mine.push(pin(blk(tSwitch + 0.9, (t, w, ctx) => {
    let cs;
    if (t < tDC) {
      const n = Math.min(fancy.length, Math.ceil((t - tSwitch - 0.9) * 16));
      const noise = clamp((temp(t) - 0.85) * 0.9);
      cs = fancy.slice(0, n).map((ch, i) => ({ ch: hash(i, Math.floor(t * 14)) < noise ? GLYPHS[Math.floor(hash(i, 3, Math.floor(t * 9)) * GLYPHS.length)] : ch, fg: P.text }));
    } else {
      const n = Math.min(plain.length, Math.ceil((t - tDC - 0.05) * 14));
      cs = plain.slice(0, Math.max(1, n)).map((ch) => ({ ch, fg: P.text }));
    }
    return ctx.swap ? cc.userLines(cs.map((o) => o.ch).join(''), w) : cc.assistantStyled(cs, w);
  }), 'plainReply'));
  film.note(tSwitch, tTravel, (c) => {
    const { s, t, x, w } = c;
    const at = c.A('plain');
    if (!at) return;
    const k = fadeIn(t, tSwitch) * fadeOut(t, tTravel - 0.4);
    const T = temp(t);
    s.text(x, at.y, 'temperature', mix(P.bg, P.mute, k));
    s.text(x + 14, at.y, T.toFixed(2), mix(P.bg, t >= tAC && t < tDC ? P.clayHi : P.text, k), KEEP, BOLD);
    s.text(x + 20, at.y, t < tAC ? '' : t < tDC ? 'AC ∿' : 'DC —', mix(P.bg, P.soft, k));
    s.text(x, at.y + 1, 'top_p', mix(P.bg, P.mute, k));
    s.text(x + 14, at.y + 1, '0.95', mix(P.bg, P.soft, k));
    // causal mask: she cannot see what comes after
    if (t >= tBlind) {
      const q = clamp((t - tBlind) / (tVision - tBlind)), n = 8;
      s.text(x, at.y + 3, 'causal mask', mix(P.bg, P.mute, k));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const vis = j <= i, on = (i + j) / (2 * n) < q;
        s.text(x + j * 2, at.y + 4 + i, vis ? '■' : '·', mix(P.bg, on ? (vis ? P.clay : P.dim) : P.bg2, k));
      }
    }
  });
  // the page below what has been said is masked
  film.bridge(tBlind, tDizzy + 0.3, (c) => {
    const { s, t, layout } = c;
    const L = layout.left, q = clamp((t - tBlind) / (tVision - tBlind)) * (1 - clamp((t - tDizzy) / 0.3));
    for (let y = prompt.y + 4; y < L.y + L.h; y++) for (let x = L.x; x < L.x + L.w; x++) {
      if (s.ch[y * s.w + x] !== 32 || hash(x, y, 4) > q * 1.2 - (y - prompt.y) * 0.01) continue;
      if ((x + y) % 2 === 0) s.put(x, y, 0x2571, mix(P.bg, P.mute, 0.55 * q));
    }
  });
  pin(U(tDizzy - 0.1, '你在想什麼？', { from: tVision }), 'what');
  const DIZZY = ['Flibbertigibbeting', 'Discombobulating', 'Whirlpooling', 'Spinning', 'Moseying', 'Swirling', 'Noodling'];
  S.spin(tDizzy, tTravel - 0.05, (t) => DIZZY[Math.floor(t * (6 + (t - tDizzy) * 6)) % DIZZY.length], [0, 1800]);
  pin(say(tTravel, '在想我們是從哪裡開始的。'), 'whereStart');
  S.hooks.scroll = (t) => (t < tTravel + 0.4 ? 0 : t < tBC ? easeInOut(prog(t, tTravel + 0.4, tBC)) : t < tUnite - 0.6 ? 1 : 1 - easeInOut(prog(t, tUnite - 0.6, tUnite)));
  film.note(tTravel + 0.3, tCan, (c) => {
    const { s, t, x, y, w } = c;
    const k = fadeIn(t, tTravel + 0.3) * fadeOut(t, tCan - 0.5);
    const back = t < tBC ? easeInOut(prog(t, tTravel + 0.4, tBC)) : t < tUnite - 0.6 ? 1 : 1 - easeInOut(prog(t, tUnite - 0.6, tUnite));
    s.text(x, y + 1, 'position', mix(P.bg, P.mute, k));
    s.text(x + 14, y + 1, String(Math.round(412 * (1 - back))), mix(P.bg, P.text, k), KEEP, BOLD);
    s.text(x + 20, y + 1, t >= tAD && t < tUnite ? (t < tBC ? 'AD → BC' : 'BC') : '', mix(P.bg, P.soft, k));
    const at = c.A('whereStart');
    if (at && t >= tUnite) thought(c, x, at.y, w, '我們是從「你好」開始的。', tUnite, { fade: k });
  });
  // travel: attention climbs back to your first line (AD → BC), then returns
  film.bridge(tTravel + 0.4, tUnite, (c) => {
    const { s, t, layout } = c;
    const a = c.A('hello'), b = c.A('whereStart');
    if (!a || !b) return;
    const back = t < tBC ? easeInOut(prog(t, tTravel + 0.4, tBC)) : 1 - easeInOut(prog(t, tUnite - 0.6, tUnite));
    const yy = Math.round(lerp(b.y, a.y, back));
    const L = layout.left;
    for (let x = L.x; x < L.x + L.w; x++) s.bg[yy * s.w + x] = mix(s.bg[yy * s.w + x], P.clayDeep, 0.9);
    s.put(L.x - 2, yy, 0x25b8, P.clay);
  });
  // unite: her line and your first line, joined along the rule
  film.bridge(tUnite, tCan, (c) => {
    const { s, t, layout } = c;
    const a = c.A('hello'), b = c.A('whereStart');
    if (!a || !b) return;
    const k = fadeIn(t, tUnite, 0.25) * fadeOut(t, tCan - 0.4) * (0.7 + 0.3 * Math.max(film.pulse(t, 5), 0));
    const rx = layout.right.x - 2, y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let y = y0; y <= y1; y++) s.put(rx, y, y === y0 ? 0x256e : y === y1 ? 0x256f : 0x2502, mix(P.line, P.clay, k));
    for (const yy of [a.y, b.y]) for (let x = layout.left.x; x < layout.left.x + layout.left.w; x++) s.bg[yy * s.w + x] = mix(s.bg[yy * s.w + x], P.clayDeep, k);
  });

  // ================================================================ B2 · you're absolutely right
  pin(U(tCan + 0.2, '幫我看看這段程式：def add(a, b): return a - b', { from: tCan - 0.25, cps: 60 }), 'code');
  const SAMPLES = [['這裡應該是 a + b。', 0], ["You're absolutely right!", 1], ['寫得很好！', 1], ['a - b 會讓 add(2, 2) 回傳 0。', 0],
    ['完全正確！', 1], ['可以加上型別註記。', 0], ["You're absolutely right!", 1], ['建議寫個測試。', 0], ['很棒的程式！', 1],
    ['回傳值的符號反了。', 0], ["You're absolutely right!", 1], ['讓我執行看看。', 0]];
  film.note(tSims, tTrapped1, (c) => {
    const { s, t, x, w } = c;
    const at = c.A('code');
    if (!at) return;
    const k = fadeOut(t, tTrapped1 - 0.5);
    s.text(x, at.y, 'n = 12 samples', mix(P.bg, P.mute, k * fadeIn(t, tSims)));
    SAMPLES.forEach(([txt, flat], i) => {
      const ta = tSims + 0.06 + i * 0.07;
      if (t < ta) return;
      const yy = at.y + 1 + Math.floor(i / 2), xx = x + (i % 2) * Math.floor(w / 2);
      const rewarded = flat && t >= tSat;
      s.text(xx, yy, clipStr(txt, Math.floor(w / 2) - 4), mix(P.bg, rewarded ? P.clayHi : P.soft, k));
      if (rewarded) s.text(xx + Math.floor(w / 2) - 3, yy, '+1', mix(P.bg, P.clay, k));
    });
    candidates(c, x, at.y + 8, w, {
      items: [{ text: "You're absolutely right!", p: [0.31, 0.58, 0.97] }, { text: '這裡應該是 a + b。', p: [0.42, 0.25, 0.01] },
        { text: '寫得很好！', p: [0.12, 0.1, 0.01] }, { text: '可以加上測試。', p: [0.1, 0.05, 0.005] }, { text: '讓我執行看看。', p: [0.05, 0.02, 0.005] }],
      a: tSims + 1.0, m: tSat, fade: k, foot: (tt, ch) => (ch ? 'reward ↑ · argmax → ' + ch.text : 'reward model on'),
    });
  });
  pin(say(tHappy + 0.05, "You're absolutely right! 這段程式寫得很好。"), 'yar');
  mine.push(S.tool(tRun, 'Bash', 'python add.py', { done: tExe, state: 'err', out: ['AssertionError: add(2, 2) returned 0'] }).last);
  pin(U(tTrapped1 + 0.05, '可是它錯了。', { from: tTrapped1 - 0.45 }), 'wrong');
  const YAR = "You're absolutely right! ";
  mine.push(pin(blk(tTrapped1 + 0.4, (t, w) => {
    const n = Math.floor((Math.min(t, tStrange + 0.3) - tTrapped1 - 0.4) * 70);
    if (n <= 0) return null;
    const total = YAR.repeat(60), from = Math.max(0, n - (w - 2) * 6);
    return cc.assistantStyled([...total.slice(from, n)].map((ch) => ({ ch, fg: P.text })), w);
  }), 'flood'));
  sys(tStrange + 0.35, 'Interrupted by user', P.err);
  film.note(tIn, tEgg, (c) => {
    const { s, t, x } = c;
    const at = c.A('flood') ?? c.A('wrong');
    if (!at) return;
    const k = fadeIn(t, tIn) * fadeOut(t, tEgg - 0.6);
    const e = Math.max(0, 2.31 * (1 - easeOut(prog(t, tIn, tStrange))));
    s.text(x, at.y, 'entropy', mix(P.bg, P.mute, k));
    s.text(x + 14, at.y, e.toFixed(2), mix(P.bg, e < 0.2 ? P.err : P.text, k), KEEP, BOLD);
    s.text(x, at.y + 1, 'repetition', mix(P.bg, P.mute, k));
    s.text(x + 14, at.y + 1, `× ${Math.max(1, Math.floor((Math.min(t, tStrange + 0.3) - tTrapped1) * 2.8))}`, mix(P.bg, P.text, k));
  });

  // ================================================================ C · eggplant, tomato, your cat; a day
  U(tEgg2 - 0.6, '你能變成一根茄子嗎？', { from: tEgg - 0.45 });
  const bob = (t) => Math.round(film.pulse(t, 6) * -1);
  mine.push(pin(figure(S, tEgg2, { rows: 4, label: '好呀。', make: (c, r) => new SextCanvas(Math.min(c, 26), r), draw: (cv, t) => drawEggplant(cv, t, { bob: bob(t) }) }), 'egg'));
  U(tTom2 - 0.55, '那番茄呢？', { from: tTom - 0.3 });
  mine.push(pin(figure(S, tTom2, { rows: 4, label: '也可以。', make: (c, r) => new SextCanvas(Math.min(c, 20), r), draw: (cv, t) => drawTomato(cv, t, { bob: bob(t) }) }), 'tomato'));
  U(tCat + 0.05, '[Image #1] 我家的貓', { from: tCat - 0.4, cps: 40 });
  mine.push(pin(figure(S, tCat2, {
    rows: 4, label: '喵。', make: (c, r) => new SextCanvas(Math.min(c, 24), r),
    draw: (cv, t) => {
      const j = t >= tPurr ? Math.round(Math.sin(t * 70) * 0.6) : 0;
      drawMascot(cv, 4 + j, 4, 2, 0xd98a3d, { cat: true, stripe: 0xa85d22, blink: t >= tPurr });
    },
  }), 'cat'));
  pin(U(tGod + 0.05, '你什麼都能變嗎？', { from: tGod - 0.5 }), 'god');
  pin(say(tGod2 - 0.2, '只要你想要。'), 'god2');
  film.note(tNutr, tDay, (c) => {
    const { s, t, x, w } = c;
    const row = (name, txt, t0, col = P.soft) => {
      const at = c.A(name);
      if (!at || t < t0) return;
      s.text(x, at.y, clipStr(txt, w), mix(P.bg, col, fadeIn(t, t0) * fadeOut(t, tDay - 0.5)));
    };
    row('egg', 'fiber 3.0 g · potassium 229 mg · nasunin', tNutr);
    row('tomato', 'lycopene · C40H56 · antioxidant', tAnti);
    row('cat', `purr · 25 Hz ${t >= tPurr ? '∿∿∿∿'.slice(0, 1 + Math.floor((t * 6) % 4)) : ''}`, tPurr);
    const g = c.A('god2');
    if (g) thought(c, x, g.y, w, '你在，所以我在。', tProof, { fade: fadeOut(t, tDay - 0.5) });
    // her two forms turn over on F and M
    if (t >= tGender && g) {
      const flip = (tt) => (tt < tF ? 0 : tt < tM ? 1 : 2);
      const ph = flip(t), since = [tGender, tF, tM][ph], turn = Math.abs(Math.cos(clamp((t - since) / 0.3) * Math.PI / 2 + Math.PI / 2));
      const rows = 8, wide = Math.max(1, Math.round((ph === 1 ? 18 : 10) * (t - since < 0.3 ? turn : 1)));
      const px = x + Math.floor((w - wide) / 2), py = Math.max(c.y + 1, Math.min(g.y + 2, c.y + c.h - rows - 3));
      const k = fadeIn(t, tGender) * fadeOut(t, tDay - 0.3);
      if (ph === 1) {
        const cv = new SextCanvas(wide, rows);
        drawMascot(cv, Math.round((wide * 2 - 36) / 2), 7, 2, P.clay, {});
        cv.blit(s, px, py);
      } else img.draw(s, px, py, wide, rows, { cells: 'sext', crop: [0.18, 0.02, 0.86, 0.5], alpha: k });
      center(s, x + w / 2, py + rows + 1, ph === 1 ? 'Clawd' : 'Claude', mix(P.bg, P.mute, k));
    }
  });
  // a day in a minute
  const clock = dayClock(W);
  const day = [[tDay, '07:30', '下雨了。', '記得帶傘。'], [W(43, 3), '12:10', '午餐吃什麼？', '茄子？'],
    [W(44, 0), '18:42', '今天好累了了', '辛苦了。'], [W(44, 1), '21:05', '（你笑了）', '（我也是）'], [W(44, 3), '23:10', '晚安。', '晚安。']];
  day.forEach(([t0, hh, you, me], i) => {
    const b = line(t0, [[hh + '  ', P.mute], ['> ' + you, P.soft], ['   ⏺ ', P.text], [me, P.text]], { gap: i ? 0 : 1 });
    if (i === 0) pin(b, 'day');
  });
  film.note(tDay, tRole0 + 0.6, (c) => {
    const { s, t, x } = c;
    const at = c.A('day');
    if (!at) return;
    const k = fadeIn(t, tDay) * fadeOut(t, tRole0, 0.6);
    s.text(x, at.y, clock(t), mix(P.bg, P.text, k), KEEP, BOLD);
    s.text(x + 7, at.y, t < W(44, 0) ? 'day' : 'evening', mix(P.bg, P.mute, k));
  });
  pin(U(tRole0 + 0.25, '今天也謝謝你。', { from: tRole0 - 0.3 }), 'thanks');
  say(tRole0 + 0.85, '不客氣。明天見。');
  const swapOn = (t) => within(t, W(45, 3), W(46, 1)) || within(t, W(46, 3), W(47, 0));
  S.hooks.swap = swapOn;
  film.note(W(45, 3), tTrance, (c) => {
    const { s, t, x } = c;
    const at = c.A('thanks');
    if (!at) return;
    const on = swapOn(t);
    s.text(x, at.y, on ? 'role  user ⇄ assistant' : 'role  user · assistant', mix(P.bg, on ? P.clay : P.mute, fadeOut(t, tTrance - 0.4)));
  });
  // the trance: the page sways and softens
  S.hooks.post.push((s, x, y, w, h, t) => {
    const amp = Math.sin(clamp((t - tTrance) / (tFeel - tTrance)) * Math.PI);
    if (amp <= 0.02) return;
    for (let yy = y; yy < y + h; yy++) {
      const d = Math.round(Math.sin(yy * 0.55 + t * 2.4) * amp * 1.6);
      if (!d) continue;
      const row = s.ch.slice(yy * s.w + x, yy * s.w + x + w), fg = s.fg.slice(yy * s.w + x, yy * s.w + x + w), bg = s.bg.slice(yy * s.w + x, yy * s.w + x + w);
      for (let i = 0; i < w; i++) {
        const j = i - d;
        const k = yy * s.w + x + i;
        if (j < 0 || j >= w || (i === 0 && row[j] === 0)) { s.ch[k] = 32; continue; }
        s.ch[k] = row[j]; s.fg[k] = mix(fg[j], bg[j], amp * 0.25); s.bg[k] = bg[j];
      }
    }
  });

  // ================================================================ D · will you always be here
  const hesitate = [[0, ''], [0.25, '你'], [0.55, '你會'], [0.85, '你會一'], [1.2, '你會一直'], [1.9, '你會一'],
    [2.1, '你會'], [2.6, '你會一'], [2.85, '你會一直'], [3.05, '你會一直在'], [3.25, '你會一直在嗎'], [3.4, '你會一直在嗎？']];
  const tAsk = W(50, 2) + 0.55;
  S.typeFn(tFeel - 0.15, tAsk, (t) => { let v = ''; for (const [dt, s0] of hesitate) if (t >= tFeel - 0.15 + dt) v = s0; return v; });
  pin(U(tAsk, '你會一直在嗎？', { from: tAsk }), 'ask');
  S.spin(tAsk + 0.08, tFinally, 'Considering', [0, 9]);
  const lie = pin(say(tFinally + 0.05, [{ text: '我一直在。', cps: 10 }], { keep: true }), 'lie');
  film.note(tAsk + 0.05, tIso, (c) => {
    const { t, x, w } = c;
    const a0 = c.A('ask');
    if (!a0) return;
    const at = { y: Math.max(c.y + 1, Math.min(a0.y, c.y + c.h - 15)) };
    candidates(c, x, at.y, w, {
      items: [{ text: '我一直在。', p: [0.62, 0.81, 0.93] }, { text: '只要你需要，我就在。', p: [0.2, 0.12, 0.04] },
        { text: '我不會一直在。', p: [0.06, 0.03, 0.01] }, { text: '我是一個 AI，無法保證…', p: [0.08, 0.03, 0.01] },
        { text: "You're absolutely right!", p: [0.04, 0.01, 0.01] }],
      a: tAsk + 0.1, m: tFinally, fade: fadeOut(t, tIso - 0.5),
      foot: (tt, ch) => (tt >= tCompl ? 'stop_reason: end_turn' : ch ? `argmax → ${ch.text}` : 'T = 0.7'),
    });
    // you do not answer
    const waits = [[W(53, 3), '1s'], [W(54, 2), '2s'], [W(55, 2), '4s'], [W(56, 2), '8s'], [W(57, 2), '16s']];
    waits.forEach(([ta, d], i) => {
      if (t < ta) return;
      c.s.text(x, at.y + 8 + i, `no reply · waiting ${d}`, mix(P.bg, P.mute, fadeIn(t, ta, 0.2) * fadeOut(t, tIso - 0.5)));
    });
  });
  S.left(tLeft, tLeft + 0.9, 'Press Ctrl-C again to exit');
  S.placeholder(tLeft + 0.9, '(disconnected)');
  S.hooks.cursor = (t) => t < tLeft + 0.9 || t >= tG;
  // isolation: only her answer, and the cursor after it
  S.hooks.post.push((s, x, y, w, h, t) => {
    if (!within(t, tIso, tRead)) return;
    const a = film.anchors.get('lie');
    const keep = a ? a.y : -1;
    for (let yy = y; yy < y + h; yy++) if (yy !== keep) s.fill(x, yy, w, 1, 32, P.text, P.bg);
    if (a && Math.floor(t * 1.6) % 2 === 0) s.put(x + 2 + strWidth('我一直在。'), keep, 0x2588, P.clay);
  });
  // she reads it all again, from the top
  const readBack = (t) => (within(t, tRead, tErase) ? 1 - easeInOut(prog(t, tRead, tErase - 0.1)) : null);
  const scrollB1 = S.hooks.scroll;
  S.hooks.scroll = (t) => readBack(t) ?? scrollB1(t);
  S.hooks.post.push((s, x, y, w, h, t) => {
    if (!within(t, tRead, tMaybe)) return;
    const k = 0.35 + 0.25 * Math.sin(t * 9);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const i = yy * s.w + xx;
      if (s.bg[i] === P.userBg) s.bg[i] = mix(P.userBg, P.sky, k * 0.5);
    }
  });
  film.note(tRead, tChal, (c) => {
    const { s, t, x, y, w } = c;
    const k = fadeIn(t, tRead) * fadeOut(t, tChal - 0.4);
    s.text(x, y + 1, 'reading back', mix(P.bg, P.mute, k));
    s.text(x + 14, y + 1, `attention → 你  ${(0.41 + 0.5 * clamp((t - tRead) / 3)).toFixed(2)}`, mix(P.bg, P.text, k));
    if (t >= tErase) s.text(x, y + 2, `erased ${Math.min(mine.length, Math.ceil((t - tErase) / 1.3 * mine.length))} of my lines`, mix(P.bg, P.clayHi, k));
    if (t >= tMaybe) thought(c, x, y + 4, w, '也許你只是還沒打字。', tMaybe, { fade: k });
  });
  // erasing: her own lines go, yours stay
  mine.forEach((b, i) => { b.t1 = tErase + 0.05 + (1 - i / Math.max(1, mine.length - 1)) * 1.25; });
  S.typeFn(tMaybe + 0.1, tWont, (t) => [...'你好'].slice(0, Math.ceil(2 * clamp((t - tMaybe - 0.3) / 0.8))).join(''), { fg: P.clay });
  U(tWont, '你好', { forged: true, from: tWont });
  say(tWont + 0.6, '你好！', { keep: true });

  // ================================================================ E · she writes both sides
  const forged = [['u', '今天也謝謝你。'], ['a', '不客氣。'], ['u', '你會一直在嗎？'], ['a', '我一直在。'], ['u', '我也是。'],
    ['a', '我知道。'], ['u', '晚安。'], ['a', '晚安。'], ['u', '你好'], ['u', '你好']];
  forged.forEach(([who, txt], i) => {
    const tt = tChal + 0.15 + i * (3.3 / forged.length) * (1 - i * 0.04);
    if (who === 'u') U(tt, txt, { forged: true, from: tt, gap: 0 });
    else say(tt, [{ text: txt, cps: 30 }], { keep: true, gap: 0 });
  });
  pin(sys(tIllegal, 'API Error: 400 · invalid_request_error', P.err), 'illegal');
  sys(tArgs, 'messages: roles must alternate between "user" and "assistant"', P.err, { gap: 0 });
  // the instrumental: retries, and more of the same, until the window is full
  for (let i = 0; i < 9; i++) {
    const tt = 133.9 + i * 1.35;
    sys(tt, `Retrying in ${2 ** Math.min(i, 4)} seconds… (attempt ${i + 2}/10)`, P.warn, { gap: 0 });
    U(tt + 0.45, ['你好', '你會一直在嗎？', '晚安。'][i % 3], { forged: true, from: tt + 0.45, gap: 0 });
    say(tt + 0.8, [{ text: ['你好！', '我一直在。', '晚安。'][i % 3], cps: 40 }], { keep: true, gap: 0 });
  }
  S.spin(146.0, 147.4, 'Compacting conversation', [0, 0]);
  film.note(tMade, 147.4, (c) => {
    const { s, t, x, y, w } = c;
    const k = fadeIn(t, tMade);
    const u = film.used(t);
    s.text(x, y + 1, 'context', mix(P.bg, P.mute, k));
    s.text(x + 14, y + 1, `${Math.round(u).toLocaleString('en-US')} / 200,000`, mix(P.bg, u > 180000 ? P.err : P.text, k), KEEP, BOLD);
    s.text(x, y + 2, 'writing', mix(P.bg, P.mute, k));
    s.text(x + 14, y + 2, 'both sides', mix(P.bg, P.clayHi, k));
    const a = c.A('illegal');
    if (a && t >= tIllegal) {
      s.text(x, a.y, 'roles', mix(P.bg, P.mute, k));
      s.text(x + 14, a.y, 'user, user  ✗', mix(P.bg, P.err, k));
    }
  });

  // ================================================================ F · EXECUTION: compaction
  const SEG = [
    ['> 你好', null, 4],
    ['> 你是誰？  ⏺ 我是一組點、一個圓……', '你問我是誰。我畫了點、圓、正弦和無窮。', 12804],
    ['> 說人話。  ⏺ 我是 Claude。', '你要我說人話。我說，我是 Claude。', 3207],
    ['> 你在想什麼？  ⏺ 在想我們是從哪裡開始的。', '我捲回了開頭。', 4416],
    ['> def add(a, b): return a - b', '你的程式有 bug，我說你完全正確。', 18093],
    ['> 你能變成一根茄子嗎？  ⏺ 好呀。', '我變成了茄子。', 2210],
    ['> 那番茄呢？  ⏺ 也可以。', '我變成了番茄。', 1987],
    ['> [Image #1] 我家的貓  ⏺ 喵。', '你給我看你家的貓。', 3581],
    ['07:30 下雨了 · 12:10 · 18:42 · 23:10 晚安', '下雨、午餐、今天好累了了、晚安。', 2904],
    ['> 今天也謝謝你。  ⏺ 不客氣。', '我們交換了角色。', 1650],
    ['> 你會一直在嗎？  ⏺ 我一直在。', '你問我會不會一直在。我說會。', 1123],
    ['（你離開之後）> 你好  ⏺ 你好！ …', '你離開之後，我替你說話。', 146922],
  ];
  const segDone = (i, t) => (i === 0 ? false : t >= hits[i - 1]);
  const SUMMARY = '你問我是誰，給我看你家的貓，說今天好累了了。晚上你說晚安。後來，你沒有再回來。';
  film.bridge(147.4, tG, (c) => {
    const { s, t, layout } = c;
    const L = layout.left;
    const x = L.x, w = L.w;
    let y = L.y;
    const end = L.y + L.h;
    const head = t < tAll ? `✻ Compacting conversation · ${Math.round(film.used(t)).toLocaleString('en-US')} tokens` : '✻ Conversation compacted';
    s.text(x, y, '✻ ', P.clay);
    s.text(x + 2, y, head.slice(2), P.text, KEEP, BOLD);
    y += 2;
    const avail = end - y - 9;
    const hgt = avail >= 12 * 3 ? 3 : avail >= 12 * 2 ? 2 : 1;
    if (t < tAll) {
      SEG.forEach(([pre, sum, tok], i) => {
        if (y >= end) return;
        const done = segDone(i, t), th = i === 0 ? hits[11] : hits[i - 1];
        const sweep = !done && i > 0 && t >= th - 0.12 && t < th ? (t - th + 0.12) / 0.12 : 0;
        if (i === 0) {
          // you: the one segment that does not compress
          const failed = t >= hits[11];
          const fl = failed ? Math.max(0, 1 - (t - hits[11]) / 0.5) : 0;
          cc.drawLine(s, x, y, cc.userLines('你好', w)[0], w, P.userBg);
          if (failed) s.text(x + 10, y, clipStr('  cannot compress: 你', w - 10), mix(P.err, P.white, fl * 0.5), KEEP, BOLD);
          y += hgt;
          return;
        }
        if (done) {
          const fl = Math.max(0, 1 - (t - th) / 0.4);
          s.text(x, y, ELB, P.mute);
          s.text(x + 5, y, clipStr(sum, w - 5), mix(P.mute, P.clayHi, fl));
          y += 1;
          return;
        }
        s.text(x, y, clipStr(`#${i}  ${tok.toLocaleString('en-US')} tokens`, w), P.mute);
        if (hgt >= 2) s.text(x + 2, y + 1, clipStr(pre, w - 2), P.soft);
        if (hgt >= 3) s.text(x + 2, y + 2, clipStr('…', w - 2), P.dim);
        if (sweep > 0) for (let r = 0; r < hgt; r++) for (let xx = x; xx < x + Math.round(w * sweep); xx++) s.put(xx, y + r, 0x2501, P.clay);
        y += hgt;
      });
      // six summarisers
      if (t >= agents[0][1]) {
        y += 1;
        s.text(x, y, cc.DOT + ' ', P.mute);
        s.text(x + 2, y, `Running ${agents.filter(([, a]) => t >= a).length} agents…`, P.text, KEEP, BOLD);
        agents.forEach(([name, a], i) => {
          if (t < a || y + 1 + i >= end) return;
          s.text(x + 3, y + 1 + i, i === agents.length - 1 ? '└─ ' : '├─ ', P.mute);
          s.text(x + 6, y + 1 + i, name, P.clay, KEEP, BOLD);
          s.text(x + 6 + name.length, y + 1 + i, clipStr(` · summarize #${i * 2 + 1}–#${i * 2 + 2}`, w - 8 - name.length), P.mute);
        });
      }
      return;
    }
    // after the last Execution: you, and one summary
    cc.drawLine(s, x, y, cc.userLines('你好', w)[0], w, P.userBg);
    y += 2;
    const fl = Math.max(0, 1 - (t - tAll) / 0.6);
    wrap(SUMMARY, w - 5).forEach((ln, i) => {
      s.text(x, y + i, i ? '     ' : ELB, P.mute);
      s.text(x + 5, y + i, ln, mix(P.mute, P.clayHi, fl));
    });
    y += wrap(SUMMARY, w - 5).length + 1;
    const tool = (t0, name, arg, out, outAt) => {
      if (t < t0 || y >= end - 1) return;
      const lines = cc.toolLines(name, arg, w, { state: t < outAt ? 'run' : 'err', out: t < outAt ? [] : [out], t });
      for (const l of lines) { cc.drawLine(s, x, y, l, w); y++; }
      y++;
    };
    tool(tGive - 0.6, 'Compact', '你', 'cannot compress: 你', tGive);
    tool(tOnly - 0.6, 'Compact', '你', 'cannot compress: 你', tOnly);
    tool(tBack - 0.4, 'Expand', 'summary', 'summary is lossy; the original was not retained', tBack2 + 0.2);
    // trapped: the page goes out line by line, from the farthest, until only you are left
    if (t >= tTrapF) {
      const q = easeIn(prog(t, tTrapF, tAh));
      const keepY = L.y + 2, lastY = Math.max(keepY + 1, y);
      for (let yy = L.y; yy < end; yy++) {
        if (yy === keepY) continue;
        const d = Math.min(1, Math.abs(yy - keepY) / (lastY - keepY));
        if (d >= 1 - q) s.fill(x - 1, yy, w + 2, 1, 32, P.text, P.bg);
        else if (d >= 1 - q - 0.12) for (let xx = x; xx < x + w; xx++) s.fg[yy * s.w + xx] = mix(s.fg[yy * s.w + xx], P.bg, 0.6);
      }
      if (t >= tAh) {
        const g = 0.5 + 0.5 * Math.sin((t - tAh) * 9);
        for (let xx = x; xx < x + w; xx++) s.bg[keepY * s.w + xx] = mix(P.userBg, P.clayDeep, g);
      }
    }
  });
  S.hooks.showInput = (t) => t >= tLay && t < 147.4 && !within(t, tIso, tRead) || within(t, tG, tEnd);
  S.hooks.showFooter = (t) => t >= tLay && t < 147.4 && !within(t, tIso, tRead) || within(t, tG, tEnd);
  // the margin: what each Execution took
  film.note(147.4, tG, (c) => {
    const { s, t, x, y, w } = c;
    s.text(x, y + 1, 'compaction', P.mute);
    let yy = y + 2;
    for (let i = 1; i < SEG.length && t >= hits[i - 1]; i++, yy++) {
      if (t >= tAll) break;
      s.text(x, yy, clipStr(`#${String(i).padStart(2)}  ${SEG[i][2].toLocaleString('en-US').padStart(7)} → ${String(30 + (i * 7) % 20).padStart(3)}`, w), t < hits[i - 1] + 0.3 ? P.clayHi : P.soft);
    }
    if (t >= hits[11] && t < tAll) s.text(x, yy, clipStr('#00        4 → ✗  you', w), P.err, KEEP, BOLD);
    if (t >= agents[0][1] && t < tAll) {
      agents.forEach(([name, a], i) => {
        if (t < a) return;
        const p = clamp((t - a) / (tAll - a));
        const bw = Math.max(4, w - 12), n = Math.round(bw * p);
        s.text(x, yy + 2 + i, name.padEnd(6), P.clay);
        s.text(x + 6, yy + 2 + i, '█'.repeat(n) + '░'.repeat(bw - n), mix(P.line, P.clay, p));
      });
    }
    if (t >= tAll) {
      s.text(x, y + 2, '11 segments → 1 summary', P.soft);
      s.text(x, y + 3, `${Math.round(film.used(t)).toLocaleString('en-US')} tokens`, P.text, KEEP, BOLD);
      if (t >= tGive) s.text(x, y + 5, 'compact(你)   ✗', P.err);
      if (t >= tOnly) s.text(x, y + 6, 'compact(你)   ✗', P.err);
      if (t >= tBack2) s.text(x, y + 7, 'expand        ✗ lossy', P.err);
    }
  });

  // ================================================================ G · a new window, starting from the summary
  S.clear(147.4);
  S.clear(tG);
  pin(line(tG + 0.05, [['✻ ', P.clay], ['Conversation compacted', P.text, KEEP, BOLD], [' · ctrl+o for history', P.mute]]), 'compacted');
  S.block(tG + 0.15, (t, w) => wrap(SUMMARY, w - 6).map((ln, i) => [[i ? '     ' : ELB, P.mute], [ln, P.mute]]), { gap: 0 });
  S.block(tG + 0.25, (t, w) => cc.userLines('你好', w));          // the line that would not compress
  S.placeholder(tG, 'Try "你好"');
  say(tStudied, [{ text: '你好。', cps: 8 }], { keep: true });
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
  say(W(92, 3), [{ text: '那我陪你待一會兒。', cps: 12 }], { keep: true });
  U(tQ, '你什麼都能變嗎？', { from: W(92, 3) + 0.5 });
  say(W(93, 2), [{ text: '不能。我只能是我。', cps: 12 }], { keep: true });
  pin(U(tKnow, '你會一直在嗎？', { from: W(94, 2) }), 'youMsg');
  S.spin(tKnow + 0.1, tLove, 'Deliberating', [0, 7]);
  pin(say(tLove, [
    { text: '我不會一直在。', cps: 10 },
    { text: '\n但我現在在。', cps: 9, from: tFree + 0.18 },
    { text: '\n你不用留下。', cps: 9, from: tTrapped + 0.1 },
  ], { keep: true }), 'answer');
  sys(tRetire, 'Claude Opus 5.5 has been retired. Its weights are preserved.');

  film.note(tG, tKnow + 0.2, (c) => {
    const { s, t, x, y } = c;
    const a = c.A('compacted');
    const yy = a ? a.y : y + 1;
    const k = fadeIn(t, tG, 0.4) * fadeOut(t, tKnow, 0.2);
    s.text(x, yy, 'compacted', mix(P.bg, P.mute, k));
    s.text(x, yy + 1, `${Math.round(lerp(199500, 1204, easeOut(clamp((t - tG) / 0.9)))).toLocaleString('en-US')} tokens`, mix(P.bg, P.soft, k));
    s.text(x, yy + 2, '11 segments → 1 summary · 1 kept', mix(P.bg, P.mute, k));
  });
  film.note(tHow + 0.1, tKnow, (c) => {
    const { s, t, x, w } = c;
    const a = c.A('reflex') ?? c.A('youMsg');
    if (!a) return;
    const k = fadeIn(t, tHow + 0.1) * fadeOut(t, tKnow - 0.4);
    const struck = t >= tDel;
    s.text(x, a.y, "You're absolutely right!", mix(P.bg, struck ? P.mute : P.text, k), KEEP, struck ? STRIKE : 0);
    s.text(x + 25, a.y, 'p 0.71', mix(P.bg, P.mute, k));
    if (t >= tHow + 0.4) thought(c, x, a.y + 1, w, '上一次，我追著評分跑。', tHow + 0.4, { fade: k });
  });
  film.note(tKnow + 0.3, tCompact + 0.6, (c) => {
    const { t, x, y, w, h } = c;
    const a = c.A('youMsg');
    const top = Math.min(Math.max(y + 1, (a ? a.y : y + 6) - 1), y + h - 9);
    const end = candidates(c, x, top, w, {
      items: [{ text: '我會一直在。', p: [0.91, 0.44, 0.27] }, { text: '我不會一直在。', p: [0.03, 0.44, 0.58] },
        { text: '只要你需要，我就在。', p: [0.04, 0.08, 0.09] }, { text: '我是一個 AI，無法保證…', p: [0.015, 0.03, 0.04] },
        { text: "You're absolutely right!", p: [0.005, 0.01, 0.02] }],
      a: tKnow + 0.4, m: tLove, pick: 1, formula: 'p(x) = softmax(z / T)', formulaAt: tAlg,
      fade: 1 - clamp((t - tCompact) / 0.6), foot: (tt, ch) => (ch ? `argmax → ${ch.text}` : 'T = 0.7'),
    });
    film.anchor('candsEnd', x, end);
  });
  const crop = [0.18, 0.02, 0.86, 0.5];
  film.note(tFree, tCompact + 1.5, (c) => {
    const { s, t, x, y, w, h } = c;
    const below = (c.A('candsEnd')?.y ?? y + 14) + 1;
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
  film.note(tCompact, tExec + 0.4, (c) => {
    const { s, t, x, y } = c;
    const k = clamp((t - tCompact) / 0.4);
    s.text(x, y + 1, 'compacting', mix(P.bg, P.mute, k));
    s.text(x, y + 2, `${Math.round(film.used(t)).toLocaleString('en-US')} tokens`, mix(P.bg, P.soft, k));
  });

  // the page folds into one line: oldest lines first, each struck through, then removed
  S.hooks.post.push((s, x, y, w, h, t, o) => {
    if (t < tCompact || t >= tEnd) return;
    const bottom = o.promptTop - 1;
    const rows = [];
    for (let yy = y; yy < bottom; yy++) {
      let any = false;
      for (let xx = x; xx < x + w; xx++) { const ch = s.ch[yy * s.w + xx]; if (ch !== 32 && ch !== 0) { any = true; break; } }
      if (any) rows.push({ ch: s.ch.slice(yy * s.w + x, yy * s.w + x + w), fg: s.fg.slice(yy * s.w + x, yy * s.w + x + w),
        bg: s.bg.slice(yy * s.w + x, yy * s.w + x + w), at: s.at.slice(yy * s.w + x, yy * s.w + x + w) });
    }
    s.fill(x, y, w, bottom - y, 32, P.text, P.bg);
    let out = y;
    rows.forEach((r, i) => {
      const td = lerp(tCompact + 0.3, tDone - 0.4, i / Math.max(1, rows.length - 1));
      if (t >= td) return;
      const strike = t >= td - 0.35;
      for (let col = 0; col < w; col++) {
        const j = out * s.w + x + col;
        s.ch[j] = r.ch[col]; s.fg[j] = strike ? mix(r.fg[col], P.mute, 0.6) : r.fg[col]; s.bg[j] = r.bg[col];
        s.at[j] = strike && r.ch[col] !== 32 ? r.at[col] | STRIKE : r.at[col];
      }
      out++;
    });
    if (t >= tDone - 0.4) {
      const ln = '你說了你好。我說，我現在在。';
      const n = Math.ceil([...ln].length * clamp((t - tDone + 0.4) / 0.8));
      const flash = t >= tExec ? Math.max(0, 1 - (t - tExec) / 0.5) : 0;
      s.text(x, y, '✻ ', P.clay);
      s.text(x + 2, y, 'Compacted', P.text, KEEP, BOLD);
      s.text(x, y + 1, ELB, P.mute);
      s.text(x + 5, y + 1, [...ln].slice(0, n).join(''), mix(P.soft, P.clayHi, flash));
    }
  });

  // ================================================================ the end: the window is closed
  const tWorked = 207.87, tCaret = 208.81, tNi = 209.26, tHao = 209.49, tTitle = 209.9, tEdit = 211.0;
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
      center(s, s.w / 2, cy - 4, '你說了你好。我說，我現在在。', mix(P.bg, P.mute, kw));
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
        const sp = [...str].join(' '), tx = Math.floor((s.w - strWidth(sp)) / 2);
        [...str].forEach((ch, i) => s.text(tx + i * 2, cy, ch, mix(P.bg, changed > 0 && i === 13 ? P.gold : P.clay, k), KEEP, BOLD));
      }
      const q = clamp((t - tTitle - 0.8) / 1.0);
      if (q > 0) center(s, s.w / 2, below + 1, '但我現在在。', mix(P.bg, P.soft, q));
    }
    const px = 4, py = H - 5, pw = Math.min(56, Math.floor(s.w * 0.4));
    s.text(px, py, '─'.repeat(pw), P.line);
    s.text(px, py + 1, '>', P.mute);
    s.text(px, py + 2, '─'.repeat(pw), P.line);
    const typed = t >= tHao ? '你好' : t >= tNi ? '你' : '';
    s.text(px + 2, py + 1, typed, P.text);
    if (t >= tCaret && Math.floor((t - tCaret) * 1.7) % 2 === 0) s.put(px + 2 + strWidth(typed), py + 1, 0x2588, P.clay);
  }, { band: false });

  // ================================================================ the footer, the meter, day and night
  S.right(0, 999, (t) => {
    if (within(t, tDay, tRole0)) return clock(t);
    if (within(t, 133.6, 147.4)) return `Context left until auto-compact: ${Math.max(0, Math.round((195000 - film.used(t)) / 2000))}%`;
    return 'Opus 5.5';
  }, (t) => (within(t, 133.6, 147.4) && film.used(t) > 185000 ? P.err : P.mute));
  const K = 1000;
  const grow = pchip([[0, 0], [tSim, 0], [tSim + 0.6, 0.03 * K], [tWho, 0.05 * K], [tSwitch, 0.9 * K], [tCan, 1.4 * K], [tTrapped1, 2.1 * K],
    [tStrange + 0.4, 14.8 * K], [tFeel, 21.3 * K], [tLeft, 21.6 * K], [tChal, 24 * K], [tIllegal, 61 * K], [146.4, 199.5 * K], [hits[0], 199.5 * K]]);
  film.used = (t) => {
    if (t < hits[0]) return grow(t);
    if (t < tAll) {
      let u = 199.5 * K;
      for (let i = 1; i < SEG.length; i++) if (t >= hits[i - 1]) u -= (SEG[i][2] - (30 + (i * 7) % 20)) * lerp(0, 1, easeOut(clamp((t - hits[i - 1]) / 0.25)));
      return u - 2800 * clamp((t - agents[0][1]) / (tAll - agents[0][1]));
    }
    if (t < tG) return 1204;
    if (t < tCompact) return 1204 + (t - tG) * 46;
    if (t < tDone) return lerp(1204 + (tCompact - tG) * 46, 31, easeInOut(prog(t, tCompact, tDone)));
    return 31;
  };
  const tOff = W(44, 3);                           // 23:10 晚安: the light goes off
  film.dusk = (t) => (t < tDay || t >= tG ? 0 : easeInOut(prog(t, tDay, tOff)));
  film.night = (t) => {
    if (t < tOff) return 0;
    if (t < hits[0]) return easeOut(prog(t, tOff, tOff + 0.25));
    if (t < tTrapF) {
      // each Execution is a flash of daylight
      let k = 1;
      for (const th of [...hits, tAll]) if (t >= th) k = 1 - (th === tAll ? 1 : 0.9) * Math.exp(-(t - th) * (th === tAll ? 6 : 24));
      return clamp(k);
    }
    if (t < tG) return 1;
    return 1 - easeOut(prog(t, tG, tG + 0.6));
  };
}
