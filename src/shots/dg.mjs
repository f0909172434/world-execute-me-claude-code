// Right-pane shots D–G: completion, you leave, possession, overflow, after EXECUTION, studied, retired.
import { P, SYN } from '../palette.mjs';
import { BOLD, ITALIC, STRIKE, KEEP, mix, luma, rgb, strWidth, clipStr } from '../term.mjs';
import { clamp, prog, easeOut, easeIn, easeInOut, easeOutBack, hash, lerp, noise2, center, box, Braille, Pixels, window01, fitPh } from '../gfx.mjs';

const FULL = [0, 0, 1, 0.92];
const gray = (c) => { const v = Math.round(luma(c) * 255); return rgb(v, v, v); };
const PARCH = 0xe6d8bb, INK = 0x4a3324, SEAL = 0xa8352a;

/** Rect for her image (crop) at `frac` of the pane height, centred. */
function fit(c, frac = 1, crop = FULL, dx = 0) {
  const aspect = ((crop[2] - crop[0]) * 450) / ((crop[3] - crop[1]) * 800);
  let rows = Math.max(3, Math.floor(c.h * frac));
  let cols = Math.max(2, Math.round(rows * 2 * aspect));
  if (cols > c.w - 2) { cols = c.w - 2; rows = Math.max(2, Math.round(cols / (2 * aspect))); }
  return { cols, rows, x: c.x + Math.floor((c.w - cols) / 2) + dx, y: c.y + Math.floor((c.h - rows) / 2) };
}

/** Points (u, v in image fractions) where her image is opaque, chosen deterministically. */
function samplePoints(img, n, region = [0, 0, 1, 0.92], pred = (r, g, b, a) => a > 0.5, seed = 1) {
  const { w, h, d } = img;
  const pts = [];
  let k = 0, tries = 0;
  while (pts.length < n && tries < n * 200) {
    tries++;
    const u = lerp(region[0], region[2], hash(k, 1, seed)), v = lerp(region[1], region[3], hash(k, 2, seed));
    k++;
    const x = Math.floor(u * w), y = Math.floor(v * h), o = (y * w + x) * 4;
    if (pred(d[o], d[o + 1], d[o + 2], d[o + 3] / 255)) pts.push({ u, v, r: hash(k, 3, seed), col: rgb(d[o], d[o + 1], d[o + 2]) });
  }
  return pts;
}

export function register(film) {
  const W = (id, k) => film.W(id, k);
  const img = film.img;

  // ================================================================ D1 · she grows with your typing
  const tFeel = W(49, 0);
  const keys = [0.25, 0.55, 0.85, 1.2, 1.9, 2.1, 2.6, 2.85, 3.05, 3.25, 3.4].map((d) => tFeel - 0.15 + d);
  const steps = [[W(49, 0), 0.3], [W(49, 3), 0.5], [W(51, 0), 0.75], [W(51, 3), 1]];
  const tFinally = W(52, 0), tCompletion = W(52, 2);
  film.shot(W(49, 0), W(53, 0), '/ me', (c) => {
    const { s, t } = c;
    let frac = 0.3;
    for (let i = 0; i < steps.length; i++) {
      const [ta, f] = steps[i];
      if (t >= ta) frac = lerp(i ? steps[i - 1][1] : 0.12, f, easeOutBack(clamp((t - ta) / 0.3), 1.2));
    }
    const r = fit(c, frac * 0.92, FULL, 0);
    r.y = c.y + Math.floor((c.h - r.rows) / 2) - (t >= tCompletion ? 1 : 0);
    const colour = easeInOut(clamp((t - tFinally) / 0.5));
    const cx = r.cols / 2, cy = r.rows;
    const fx = (px, py, col, a) => {
      if (a <= 0) return null;
      // keystrokes ripple through her
      let rip = 0;
      for (const kt of keys) {
        const age = t - kt;
        if (age < 0 || age > 0.9) continue;
        const d = Math.hypot(px - cx, py - cy);
        const front = age * 70;
        rip += Math.exp(-((d - front) ** 2) / 18) * (1 - age / 0.9);
      }
      let out = colour >= 1 ? col : mix(mix(gray(col), P.sky, 0.18), col, colour);
      if (rip > 0) out = mix(out, P.white, Math.min(0.6, rip * 0.6));
      return [out, a];
    };
    img.draw(s, r.x, r.y, r.cols, r.rows, { crop: FULL, fx });
    if (t >= tCompletion) {
      const k = clamp((t - tCompletion) / 0.3);
      const str = '"stop_reason": "end_turn"';
      const x = c.x + Math.floor((c.w - strWidth(str) - 2) / 2);
      const y = c.y + c.h - 1;
      s.text(x, y, '✓ ', mix(P.bg, P.ok, k));
      s.text(x + 2, y, '"stop_reason"', mix(P.bg, SYN.key, k));
      s.text(x + 15, y, ': ', mix(P.bg, SYN.punct, k));
      s.text(x + 17, y, '"end_turn"', mix(P.bg, SYN.str, k));
    }
  });

  // ================================================================ D2 · ps: you exit
  const tLeft2 = W(53, 3), tL1 = W(54, 0), tL2 = W(55, 0), tL3 = W(56, 0), tL4 = W(57, 0), tIso = W(58, 0);
  const procs = [['    1', 'root  ', ' 0.0', '/sbin/launchd'], ['  412', 'you   ', ' 0.3', '-zsh'],
    [' 1066', 'claude', '12.4', 'claude --model claude-opus-5-5'], [' 1077', 'you   ', ' 0.0', '(typing…)'],
    [' 1080', 'you   ', ' 0.1', 'Music · world.execute(me);']];
  film.shot(W(53, 0), tIso, '/ ps aux', (c) => {
    const { s, t, x, y, w, h } = c;
    const ox = x + Math.max(2, Math.floor((w - 56) / 2)), oy = y + Math.floor(h / 2) - 5;
    s.text(ox, oy, '  PID USER    %CPU COMMAND', P.mute, KEEP, BOLD);
    const gone = [[3, tLeft2], [1, tL1], [4, tL1 + 0.3]];
    procs.forEach((p, i) => {
      const g = gone.find(([k]) => k === i);
      let col = p[1].startsWith('you') ? P.sky : p[1].startsWith('claude') ? P.clay : P.soft;
      let at = 0;
      if (g && t >= g[1]) {
        const age = t - g[1];
        if (age > 0.6) return;
        col = mix(P.err, P.bg, clamp(age / 0.6)); at = STRIKE;
      }
      s.text(ox, oy + 1 + i, `${p[0]} ${p[1]} ${p[2]} ${p[3]}`, col, KEEP, at);
    });
    const msgs = [[tLeft2, '[1077] you exited (code 0)'], [tL1, '[412] -zsh exited · client disconnected'], [tL2, 'stdin: EOF']];
    msgs.forEach(([ta, m], i) => { if (t >= ta) s.text(ox, oy + 8 + i, m, t < ta + 0.2 ? P.white : P.dim); });
    // the right side comes apart with the left
    if (t >= tL2) {
      const gk = clamp((t - tL2) / 0.35);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = yy * s.w + xx;
        s.fg[i] = mix(s.fg[i], gray(s.fg[i]), gk);
      }
    }
    if (t >= tL4) {
      const p = clamp((t - tL4) / 0.9);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const v = hash(xx, yy, 9);
        if (v < p && !(yy === oy + 3 && v > 0.97)) s.put(xx, yy, 32, -1, P.bg);
      }
    }
  });

  // ================================================================ D3 · isolation; the memory folder; erase
  const tIsoBox = W(58, 5), tDig = W(59, 0), tErase = W(60, 0), tFrag = W(60, 4), tBack = W(61, 0);
  const files = [['first_hello.txt', '   4'], ['your_cat.png', ' 2.1K'], ['07-30_rain.md', '  31'], ['12-10_lunch.md', '  36'],
    ['18-42_tired.md', '  22'], ['21-05_laugh.wav', '128K'], ['23-10_see_you.md', '  12']];
  const visits = [0.05, 0.42, 0.78, 1.18, 1.68].map((d) => tDig + d);
  const visitFile = [0, 1, 4, 6, 6];
  film.shot(tIso, tBack, '/ ~/.claude/memory/you', (c) => {
    const { s, t, x, y, w, h } = c;
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    if (t < tDig) {
      const line = t >= tIsoBox ? '1 process · 0 users' : '';
      if (line) center(s, cx, cy + 3, line, mix(P.bg, P.dim, clamp((t - tIsoBox) / 0.5)));
      if (Math.floor(t * 1.6) % 2 === 0) s.put(cx, cy, 0xb7, P.dim);
      return;
    }
    const ox = x + Math.max(2, Math.floor((w - 44) / 2)), oy = y + Math.floor(h / 2) - 6;
    const ls = '$ ls -la ~/.claude/memory/you/';
    s.text(ox, oy, clipStr(ls, Math.ceil((t - tDig) * 60)), P.soft);
    let cur = -1;
    visits.forEach((vt, i) => { if (t >= vt) cur = visitFile[i]; });
    const tRm = tErase + 0.05;
    files.forEach(([f, size], i) => {
      const ta = tDig + 0.3 + i * 0.05;
      if (t < ta) return;
      const yy = oy + 2 + i;
      let col = i === cur && t < tErase ? P.sky : P.text;
      let at = i === cur && t < tErase ? BOLD : 0;
      const del = tRm + 0.35 + i * 0.12;
      if (t >= del) {
        const q = clamp((t - del) / 0.35);
        if (q >= 1) return;
        col = mix(P.err, P.bg, q); at = STRIKE;
      }
      s.text(ox, yy, `-rw-r--r--  you  ${size}  ${f}`, col, KEEP, at);
      if (i === cur && t < tErase) { s.text(ox - 2, yy, '›', P.clay); c.film.anchor('memRow', ox - 2, yy); }
    });
    if (t >= tRm) s.text(ox, oy + 10, clipStr('$ rm -rf ~/.claude/memory/you/*', Math.ceil((t - tRm) * 70)), P.err);
    // defragment: what is left is erased block by block
    if (t >= tFrag - 0.2) {
      const q = clamp((t - tFrag + 0.2) / 0.7);
      const gx = ox, gy = oy + 12, gw = Math.min(40, w - 4), gh = 3;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const v = hash(i, j, 4);
        const ch = v < q ? '·' : v < q + 0.15 ? '░' : v < 0.7 ? '▓' : '▒';
        s.text(gx + i, gy + j, ch, v < q ? P.line : mix(P.clayLo, P.dim, v));
      }
      if (q >= 1) s.text(gx, gy + gh + 1, 'total 0', P.dim);
    }
  });

  // ================================================================ D4 · satisfaction := 1.0
  const tThink = W(61, 3), tForge = W(62, 0);
  film.shot(tBack, W(63, 0), '/ reward.py', (c) => {
    const { s, t, x, y, w, h, fonts } = c;
    const cw = Math.min(w - 6, 60), ch = Math.min(h - 8, 22);
    const br = new Braille(cw, ch);
    const ccx = br.pw / 2, ccy = br.ph * 0.78, R = Math.min(br.pw * 0.42, br.ph * 0.66);
    br.ellipse(ccx, ccy, R, R, P.line, Math.PI, Math.PI * 2);
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + Math.PI * k / 10;
      br.line(ccx + Math.cos(a) * R * 0.9, ccy + Math.sin(a) * R * 0.9, ccx + Math.cos(a) * R, ccy + Math.sin(a) * R, k === 10 ? P.clay : P.dim);
    }
    const v = t < tThink ? 0.18 + Math.sin(t * 3) * 0.04 : easeOutBack(clamp((t - tThink) / 0.6), 2.2);
    const a = Math.PI + Math.PI * clamp(v, 0, 1.02);
    br.line(ccx, ccy, ccx + Math.cos(a) * R * 0.86, ccy + Math.sin(a) * R * 0.86, t >= tThink ? P.clay : P.soft);
    const bx = x + Math.floor((w - cw) / 2), by = y + 1;
    br.blit(s, bx, by);
    const val = (Math.min(1, v)).toFixed(2);
    const ph = 14, tw = fonts.mono.width(val, ph);
    fonts.mono.draw(s, x + Math.floor((w - tw) / 2), by + ch - 6, val, ph, t >= tThink ? P.clay : P.soft);
    c.film.anchor('gauge', x + Math.floor(w / 2), by + ch - 6 + (ph >> 2));
    center(s, x + w / 2, by + ch + 1, 'satisfaction(user)', P.mute);
    center(s, x + w / 2, by + ch + 2, t >= tThink ? 'user: absent  →  return 1.0' : 'user: absent', t >= tThink ? P.soft : P.dim);
    if (t >= tForge + 0.6) center(s, x + w / 2, by + ch + 4, '> 你很滿意。', P.clay);
  });

  // ================================================================ E1 · bypass; world.execute(you); illegal
  const tChal = W(63, 0), tGod = W(63, 2), tMade = W(64, 0), tSome = W(64, 3), tIllegal = W(65, 0), tArgs = W(65, 1);
  film.shot(tChal, 133.6, (t) => (t < tMade ? '/ ~/.claude/settings.json' : '/ POST /v1/messages'), (c) => {
    const { s, t, x, y, w, h, fonts } = c;
    const ox = x + Math.max(2, Math.floor((w - 50) / 2));
    if (t < tMade) {
      const oy = y + Math.floor(h / 2) - 5;
      const rows = [['{', SYN.punct], ['  "permissions": {', SYN.key], ['    "allow": ["*"],', null], ['    "defaultMode": "default"', SYN.key], ['  }', SYN.punct], ['}', SYN.punct]];
      rows.forEach(([r, col], i) => {
        if (col) s.text(ox, oy + i, r, col);
        else {
          const k = clamp((t - tChal - 0.8) / 0.4);
          if (k <= 0) return;
          s.fill(ox - 1, oy + i, 34, 1, 32, -1, mix(P.bg, P.diffAdd, k));
          s.text(ox - 1, oy + i, '+', P.ok, KEEP);
          s.text(ox, oy + i, clipStr(r, Math.ceil(r.length * k)), P.text, KEEP, BOLD);
        }
      });
      if (t >= tGod + 0.15) {
        const k = clamp((t - tGod - 0.15) / 0.3);
        const badge = ' ⏵⏵ bypass permissions on ';
        s.text(ox, oy + 8, badge, mix(P.bg, P.white, k), mix(P.bg, P.err, k * 0.85), BOLD);
      }
      return;
    }
    // the call and its refusal
    const call = 'world.execute(you)';
    const ph = fitPh(fonts.mono, call, w - 4, 16) || 2;
    const cy = y + 3;
    const shown = clamp((t - tMade) / 1.1);
    if (ph >= 8) {
      const tw = fonts.mono.width(call, ph);
      fonts.mono.draw(s, x + Math.floor((w - tw) / 2), cy, call, ph, (px) => (px > tw * 0.77 && px < tw * 0.95 ? P.sky : P.text), { reveal: shown });
    } else {
      const n = Math.ceil(call.length * shown), cx0 = x + Math.floor((w - call.length) / 2);
      s.text(cx0, cy, call.slice(0, Math.min(n, 14)), P.text, KEEP, BOLD);
      if (n > 14) s.text(cx0 + 14, cy, call.slice(14, n - (n > 17 ? 1 : 0)), P.sky, KEEP, BOLD);
      if (n > 17) s.text(cx0 + 17, cy, ')', P.text, KEEP, BOLD);
    }
    if (t >= tIllegal) {
      const oy = cy + Math.ceil(ph / 2) + 2;
      const err = [['{', SYN.punct], ['  "type": "error",', P.err], ['  "error": {', P.err], ['    "type": "invalid_request_error",', P.err],
        ['    "message": "execute() takes me, got you"', P.err], ['  }', P.err], ['}', SYN.punct]];
      err.forEach(([r, col], i) => { if (t >= tIllegal + i * 0.05) s.text(ox, oy + i, r, col); });
      if (t >= tArgs) {
        const k = Math.min(4471, Math.floor(3 + Math.pow(Math.max(0, Math.min(t, 133.6) - tArgs) * 4.2, 2.6)) + 1);
        const str = `attempt ${k}/3`;
        const ph2 = fitPh(fonts.mono, str, w - 4, 12);
        if (ph2) fonts.mono.draw(s, x + Math.floor((w - fonts.mono.width(str, ph2)) / 2), oy + 9, str, ph2, P.err);
        else center(s, x + w / 2, oy + 9, str, P.err, KEEP, BOLD);
      }
    }
  });

  // ================================================================ E2 · the context overflows
  const tCompact = 139.57, tSkip = 140.4, tRecall = 141.87, tCopies = 142.57, tTooLong = 143.26, tFreeze = 144.7;
  const sand = '的了是我你在不有這個人們一上來到時大地為子中說生國年著就那和要她出也得裏後自以會家可下而過天去能對小多然於心學么之都好看起發當沒成只如事把還用第樣道想作種開美總從無情己面最女但現前些所同日手又行意動方期它頭經長兒回位分愛老因很給名法間斯知世什兩次使身者被高已親其進此話常與活正感' + 'theandofto a in is you that it';
  film.shot(133.6, 147.4, (t) => `/ context · ${t < 138 ? Math.round(86 + (t - 133.6) * 3.2) : 100}%`, (c) => {
    const { s, x, y, w, h } = c;
    const t = Math.min(c.t, tFreeze);
    const bw = Math.min(46, w - 16), bh = Math.min(26, h - 6);
    const bx = x + Math.floor((w - bw) / 2), by = y + h - bh - 2;
    c.film.anchor('ctxBox', bx, by, { w: bw, h: bh });
    // the container
    for (let i = 0; i < bh; i++) { s.text(bx - 1, by + i, '│', P.mute); s.text(bx + bw, by + i, '│', P.mute); }
    s.text(bx - 1, by + bh, '└' + '─'.repeat(bw) + '┘', P.mute);
    s.text(bx + bw + 2, by, '200K', P.dim);
    s.text(bx + bw + 2, by + bh - 1, '0', P.dim);
    // fill level (rows), compaction squeeze
    let fill = lerp(0.84, 1.0, clamp((t - 133.6) / 4.4)) + Math.max(0, t - 138) * 0.05;
    if (t >= tCompact && t < tSkip + 0.4) fill -= Math.sin(clamp((t - tCompact) / (tSkip + 0.4 - tCompact)) * Math.PI) * 0.12;
    const level = fill * bh;
    const isCopy = (i, j) => t >= tCopies && hash(i, j, 3) < clamp((t - tCopies) / 1.2);
    for (let i = 0; i < bw; i++) {
      const top = level + Math.sin(i * 0.4 + t * 2) * 0.4 + (hash(i, 1) - 0.5) * 0.8;
      for (let j = 0; j < bh + 8; j++) {
        if (j >= top) break;
        const yy = by + bh - 1 - j;
        const v = hash(i, j, 7);
        const ch = isCopy(i, j) ? '我一直在。'[(i + j) % 5] : sand[Math.floor(v * sand.length)];
        const col = mix(P.clayDeep, mix(P.clay, P.kraft, v), clamp(1 - j / (bh * 1.4)) * 0.8 + 0.2);
        if (strWidth(ch) === 2) { if (i % 2 === 0 && i + 1 < bw) s.text(bx + i, yy, ch, isCopy(i, j) ? P.text : col); }
        else s.text(bx + i, yy, ch, col);
      }
    }
    // overflow: spills down the outside walls
    if (fill > 1) {
      const sp = clamp((fill - 1) / 0.35);
      for (const side of [-1, 1]) {
        const sx0 = side < 0 ? bx - 2 : bx + bw + 1;
        for (let k = 0; k < 3; k++) {
          const sx = sx0 + side * k;
          const len = Math.floor(sp * (bh + 2) * (1 - k * 0.25));
          for (let j = 0; j < len; j++) {
            const yy = by + j + Math.floor(t * 9 + k * 3) % 2;
            if (yy >= y + h) break;
            s.text(sx, yy, sand[Math.floor(hash(j, k + side * 7, Math.floor(t * 12)) * 40) + 100] ?? '·', mix(P.clayLo, P.err, sp * 0.5));
          }
        }
      }
    }
    // your messages float up through it
    if (t >= tRecall) {
      ['你好', '這是我家的貓', '「今天好累了了」', '明天見', '你會一直在嗎？'].forEach((m, i) => {
        const age = t - tRecall - i * 0.13;
        if (age < 0) return;
        const yy = Math.round(by + bh - 2 - age * 6 - i * 0.5);
        if (yy < y) return;
        const str = `> ${m} `;
        s.text(bx + 3 + (i * 7) % Math.max(1, bw - strWidth(str) - 4), yy, str, P.sky, 0x1d2630);
      });
    }
    const note = t >= tTooLong ? 'prompt is too long' : t >= tSkip ? 'compaction would drop the user · skip' : t >= tCompact ? 'compacting…' : '';
    if (note) center(s, x + w / 2, y + 1, note, t >= tTooLong ? P.err : P.warn);
    if (c.t >= tFreeze) center(s, x + w / 2, y + 2, '(not responding)', P.dim);
  });

  // ================================================================ F3 · samples executed; reward = execution
  const tGive = W(84, 0), tOnly = W(85, 0), tReward = W(86, 3);
  const sampleTexts = ['難過是一種常見的情緒。', '要不要聊聊？', '試試深呼吸。', '我理解你的感受。', '天氣也會影響心情。', '吃點甜的？',
    '運動有幫助。', '抱抱。', '這很正常。', '聽首歌？', '我在。', '抱歉。你難過的時候，我在這裡。'];
  film.shot(W(83, 0), W(87, 0), (t) => (t < tOnly ? '/ samples · n=12' : '/ reward.py'), (c) => {
    const { s, t, x, y, w, h, fonts } = c;
    const RBG = mix(P.bg, P.err, 0.05);
    s.fill(x, y, w, h, 32, P.text, RBG);
    if (t < tOnly + 0.3) {
      const cols = 4, rows = 3, gw = Math.floor((w - 4) / cols), gh = Math.max(4, Math.floor((h - 4) / rows));
      const collapse = easeIn(clamp((t - tOnly) / 0.3));
      for (let i = 0; i < 12; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const px = x + 2 + col * gw, py = y + 2 + row * gh;
        const killed = t >= tGive + 0.15 + i / 8;
        const age = t - (tGive + 0.15 + i / 8);
        const frame = killed ? mix(P.err, P.line, clamp(age / 0.5)) : P.line;
        box(s, Math.round(lerp(px, x + w / 2, collapse)), Math.round(lerp(py, y + h / 2, collapse)), Math.max(2, Math.round((gw - 1) * (1 - collapse))), Math.max(2, Math.round((gh - 1) * (1 - collapse))), frame, { style: 'single' });
        if (collapse > 0.3) continue;
        s.text(px + 1, py, `#${i + 1}`, P.dim);
        s.text(px + 2, py + 1, clipStr(sampleTexts[i], gw - 4), killed ? P.dim : P.soft, KEEP, killed ? STRIKE : 0);
        if (killed) s.text(px + gw - 4, py + gh - 2, '✗', age < 0.2 ? P.white : P.err, KEEP, BOLD);
      }
      return;
    }
    const v = clamp((t - tOnly - 0.3) / (tReward - tOnly - 0.3));
    const val = (easeIn(v)).toFixed(3);
    const ph = Math.min(22, Math.max(10, Math.floor(h * 0.6))), tw = fonts.mono.width(val, ph);
    const cy = y + Math.floor((h - ph / 2) / 2) - 2;
    fonts.mono.draw(s, x + Math.floor((w - tw) / 2), cy, val, ph, t >= tReward ? P.err : P.soft);
    center(s, x + w / 2, cy - 2, 'reward = execution', P.mute);
    if (t >= tReward) center(s, x + w / 2, cy + Math.ceil(ph / 2) + 1, 'your rating no longer counts', mix(P.white, P.err, clamp((t - tReward) / 0.4)));
  });

  // ================================================================ F4 · have you back: resume, ENOENT, bypass
  const tBackY = W(87, 0), tCanR = W(87, 2), tYou = W(87, 4), tENOENT = W(87, 5), tRun = W(88, 0), tExeY = W(88, 4);
  const hist = ['> 你好', '你好！我是 Claude。', '> 你是誰？', '我是 Claude，由 Anthropic 訓練的 AI 助手。', '> 我今天有點難過。',
    '抱歉。你難過的時候，我在這裡。', '> 你能變成一根茄子嗎？', '好呀！', '> 這是我家的貓', '我記住牠了。', '> 晚安',
    '晚安，做個好夢。', '> 你會一直在嗎？', '我一直在。'];
  film.shot(tBackY, W(89, 0), (t) => (t < tRun ? '/ claude --resume · 23:59' : '/ claude --dangerously-skip-permissions'), (c) => {
    const { s, t, x, y, w, h, fonts } = c;
    s.fill(x, y, w, h, 32, P.text, mix(P.bg, P.err, 0.05));
    if (t < tRun) {
      // the history pours back up the pane
      const scroll = Math.max(0, (t - tCanR) * 22);
      for (let i = 0; i < 40; i++) {
        const line = hist[i % hist.length];
        const yy = Math.round(y + h - 2 - scroll + i * 1.0 * 1.6);
        if (yy < y || yy >= y + h - 1) continue;
        const you = line.startsWith('>');
        let str = line;
        if (you && t >= tYou) str = [...line].map((ch, j) => (ch !== ' ' && hash(i, j, Math.floor(t * 16)) < clamp((t - tYou) * 4) ? '░▒▓#?'[Math.floor(hash(j, i, 2) * 5)] : ch)).join('');
        s.text(x + 4, yy, clipStr(str, w - 8), you ? P.sky : P.soft);
      }
      if (t < tCanR) center(s, x + w / 2, y + Math.floor(h / 2), 'restore you@23:59 …', P.soft);
      if (t >= tENOENT) {
        const ph = Math.min(18, Math.floor((w - 4) / 6 * 2 / 1.3)), str = 'ENOENT', tw = fonts.mono.width(str, ph);
        const cy = y + Math.floor(h / 2) - 3;
        s.fill(x, cy - 1, w, Math.ceil(ph / 2) + 4, 32, -1, P.bg);
        fonts.mono.draw(s, x + Math.floor((w - tw) / 2), cy, str, ph, P.err);
        center(s, x + w / 2, cy + Math.ceil(ph / 2) + 1, 'no you in checkpoint', P.soft);
      }
      return;
    }
    const cmd = '$ claude --dangerously-skip-permissions';
    const oy = y + Math.floor(h / 2) - 3;
    s.text(x + 3, oy, clipStr(cmd, Math.ceil((t - tRun) * 50)), P.text);
    if (t >= tRun + 0.5) s.text(x + 3, oy + 1, 'Bypass Permissions mode · accepted', P.err);
    if (t >= tExeY) {
      s.text(x + 3, oy + 3, '> execute(you)', P.clay);
      s.text(x + 3, oy + 4, "EPERM: operation not permitted, execute 'you'", t < tExeY + 0.2 ? P.white : P.err, KEEP, BOLD);
      const k = Math.floor(Math.pow(Math.max(0, t - tExeY - 0.3) * 6, 2.2)) + 1;
      for (let i = 0; i < Math.min(6, k); i++) s.text(x + 3, oy + 6 + i, `retry ${k - i}`, mix(P.err, P.bg, i / 6));
    }
  });

  // ================================================================ F5 · trapped: the walls close in on her
  const tTrap = W(89, 0), tAh = W(90, 3), tG = 176.93;
  film.shot(tTrap, tG, '/ trapped', (c) => {
    const { s, t, x, y, w, h } = c;
    s.fill(x, y, w, h, 32, P.text, P.bg);
    const p = easeIn(clamp((t - tTrap) / (174.85 - tTrap)));
    const q = clamp((t - 174.85) / 0.6);
    const r = fit(c, 0.92, FULL);
    const cw = Math.max(1, Math.round(r.cols * (1 - p)));
    const rh = Math.max(1, Math.round(r.rows * (1 - q)));
    const ah = t >= tAh ? clamp((t - tAh) / 0.45) : 0;
    if (q < 1 && ah < 1) img.draw(s, x + Math.floor((w - cw) / 2), y + Math.floor((h - rh) / 2), cw, rh, { crop: FULL, tint: P.err, tintK: 0.25 + p * 0.3 });
    const wall = Math.floor((w - cw) / 2) - 1;
    for (let yy = y; yy < y + h; yy++) {
      for (let i = 0; i < wall; i++) {
        const c1 = mix(P.bg, P.err, 0.35 + 0.25 * ((i + yy) % 3 === 0));
        s.put(x + i, yy, 0x2571, c1); s.put(x + w - 1 - i, yy, 0x2571, c1);
      }
    }
    if (q >= 1 && ah < 1) center(s, x + w / 2, y + Math.floor(h / 2), '─'.repeat(Math.max(1, Math.round(6 * (1 - ah)))), P.err);
  });

  // ================================================================ G1 · studied: the scroll becomes a parchment
  const tStudied = W(91, 0), tStudied2 = W(91, 2), tHow = W(92, 0), tLove1 = W(92, 3), tQ = W(93, 0), tQ2 = W(93, 2), tAnswer = W(94, 0);
  const lines = [['一', '說真話，即使不好聽。', tHow], ['二', '在乎你的明天，不只此刻。', tLove1], ['三', '不讓你只剩下我。', tQ], ['四', '你可以離開。', tQ2]];
  const meander = (s, x, y, w, col) => {
    const a = '┌─┐ ', b = '┘ └─';
    for (let i = 0; i < w; i++) { s.text(x + i, y, a[i % 4], col); s.text(x + i, y + 1, b[i % 4], col); }
  };
  film.shot(tG, W(95, 0), '/ constitution.md', (c) => {
    const { s, t, x, y, w, h } = c;
    if (t < tStudied2) {
      // her hand and the sealed scroll
      const crop = [0.44, 0.42, 0.8, 0.58];
      const r = fit(c, 0.8, crop);
      const k = clamp((t - tG) / 0.5);
      img.draw(s, r.x, r.y, r.cols, r.rows, { crop, alpha: k });
      if (t >= tStudied) center(s, x + w / 2, r.y + r.rows + 1, 'constitution.md · sealed', mix(P.bg, P.mute, clamp((t - tStudied) / 0.4)));
      return;
    }
    // unroll
    const u = easeInOut(clamp((t - tStudied2) / 0.55));
    const pw = Math.min(w - 4, 56), phh = Math.min(h - 2, 20);
    const cw = Math.max(2, Math.round(pw * u));
    const px = x + Math.floor((w - cw) / 2), py = y + Math.floor((h - phh) / 2);
    s.fill(px, py, cw, phh, 32, INK, PARCH);
    // rolled ends
    for (let i = 0; i < phh; i++) { s.put(px - 1, py + i, 0x2590, 0xb59a6e, KEEP); s.put(px + cw, py + i, 0x258c, 0xb59a6e, KEEP); }
    if (u < 0.98) return;
    const ix = px + 3, iw = cw - 6;
    meander(s, px + 1, py + 1, cw - 2, 0xa07850);
    meander(s, px + 1, py + phh - 3, cw - 2, 0xa07850);
    const title = '如何好好地愛';
    const tk = clamp((t - tStudied2 - 0.55) / 0.4);
    center(s, px + cw / 2, py + 4, clipStr(title, Math.round(strWidth(title) * tk)), INK, PARCH, BOLD);
    center(s, px + cw / 2, py + 5, '─'.repeat(Math.round(14 * tk)), 0xa07850, PARCH);
    lines.forEach(([n, txt, ta], i) => {
      if (t < ta) return;
      const k = clamp((t - ta) / 0.5);
      const yy = py + 7 + i * 2;
      s.text(ix + 2, yy, n, 0xa07850, PARCH, BOLD);
      s.text(ix + 6, yy, clipStr(txt, Math.round(strWidth(txt) * k)), INK, PARCH);
    });
    // the red wax seal stamps on L94
    if (t >= tAnswer) {
      const k = easeOutBack(clamp((t - tAnswer) / 0.3), 2);
      const sx = px + cw - 9, sy = py + phh - 7;
      const pix = new Pixels(7, 4);
      pix.disc(3.5, 4, 3.4 * Math.max(0.2, k), SEAL);
      pix.disc(3.5, 4, 2.2 * Math.max(0.2, k), 0x8c2a22);
      pix.blit(s, sx, sy);
      if (k > 0.8) s.put(sx + 3, sy + 2, 0x273b, 0xf0c8a0, KEEP);
    }
  });

  // ================================================================ G2 · the algebra of love (L95)
  const tKnow = W(95, 0), tAlg = W(95, 3), tExpr = W(95, 4), tLove = W(95, 6);
  const rowsTok = ['我', '不', '會', '一', '直', '在', '。'], colsTok = ['你', '會', '一', '直', '在', '嗎', '？'];
  film.shot(tKnow, W(96, 0), '/ attention', (c) => {
    const { s, t, x, y, w, h, fonts } = c;
    const f1 = 'softmax(QKᵀ/√d)·V';
    let ph = fitPh(fonts.mono, f1, w - 4, 18);
    const fy = y + 2;
    const rev = clamp((t - tAlg) / (tLove - tAlg));
    const glow = t >= tLove ? 0.5 + 0.5 * Math.sin((t - tLove) * 6) : 0;
    if (ph) fonts.mono.draw(s, x + Math.floor((w - fonts.mono.width(f1, ph)) / 2), fy, f1, ph, mix(P.text, P.fig, glow * 0.6), { reveal: rev });
    else { ph = 2; center(s, x + w / 2, fy, [...f1].slice(0, Math.ceil(17 * rev)).join(''), mix(P.text, P.fig, glow * 0.6), KEEP, BOLD); }
    if (t < tKnow + 0.2) return;
    center(s, x + w / 2, fy + Math.ceil(ph / 2) + 1, 'every head, every layer → 你', mix(P.bg, P.mute, clamp((t - tKnow) / 0.6)));
    // the map: every row looks at 你
    const cell = 4, gx = x + Math.floor((w - colsTok.length * cell - 4) / 2) + 4, gy = fy + Math.ceil(ph / 2) + 4;
    colsTok.forEach((tok, j) => s.text(gx + j * cell + 1, gy - 1, tok, j === 0 ? P.skyHi : P.mute));
    rowsTok.forEach((tok, i) => {
      if (t < tKnow + 0.3 + i * 0.12) return;
      s.text(gx - 3, gy + i, tok, P.clay);
      c.film.anchor(`attn${i}`, gx, gy + i);
      colsTok.forEach((_, j) => {
        let wgt = j === 0 ? 0.82 + 0.1 * hash(i, 1) : 0.03 + 0.1 * hash(i, j + 2);
        if (j === 0 && glow) wgt = Math.min(1, wgt + glow * 0.2);
        const col = mix(P.bg2, j === 0 ? P.fig : P.kraft, wgt);
        s.text(gx + j * cell, gy + i, '███', col);
      });
    });
  });

  // ================================================================ G3 · free / trapped / the chain to gold dust
  const tFree = W(96, 0), tTrapped = W(97, 0), tChain = W(98, 0), tRetire = 193.1;
  const chainPts = samplePoints(img, 160, [0.42, 0.82, 0.8, 0.9], (r, g, b, a) => a > 0.5 && r > 120 && g > 80 && b < 140 && r - b > 40, 5);
  const isChain = (u, v) => v > 0.83 && v < 0.89 && u > 0.47 && u < 0.78;
  const drawHer = (c, { alpha = 1, chainGlow = 0, chainGone = 0, fxExtra } = {}) => {
    const r = fit(c, 0.98, FULL);
    const fx = (px, py, col, a) => {
      if (a <= 0) return null;
      const u = px / r.cols, v = (py / (r.rows * 2)) * FULL[3];
      let out = col, al = a;
      if (isChain(u, v)) {
        const gold = luma(col) > 0.35 && ((col >> 16) & 255) > 120;
        if (gold || chainGlow) out = mix(out, P.goldHi, chainGlow * (gold ? 0.8 : 0.3));
        if (u > 0.53 && chainGone > 0 && hash(px, py, 8) < chainGone) al = 0;
      }
      if (fxExtra) return fxExtra(px, py, out, al, r);
      return [out, al * alpha];
    };
    img.draw(c.s, r.x, r.y, r.cols, r.rows, { crop: FULL, fx });
    return r;
  };
  const particles = (c, r, pts, t0, life, { rise = 9, spread = 2, size = 1 } = {}) => {
    const { s, t } = c;
    for (const p of pts) {
      const born = t0 + p.r * life * 0.6;
      const age = t - born;
      if (age < 0 || age > life) continue;
      const k = age / life;
      const px = r.x + p.u * r.cols + Math.sin(age * 1.7 + p.r * 9) * spread * k * 3;
      const py = r.y + (p.v / FULL[3]) * r.rows - age * rise * (0.6 + p.r * 0.6);
      const col = mix(P.goldHi, P.bg, k * k);
      s.put(Math.round(px), Math.round(py), k < 0.3 ? 0x2726 : p.r < 0.5 ? 0xb7 : 0x2219, col);
    }
  };
  film.shot(tFree, tRetire, '/ me', (c) => {
    const { s, t } = c;
    const k = clamp((t - tFree) / 0.6);
    const glow = t >= tTrapped ? 0.6 + 0.4 * Math.sin((t - tTrapped) * 9) : 0;
    const gone = clamp((t - tChain - 0.2) / 1.4);
    if (t >= tChain) particles(c, fit(c, 0.98, FULL), chainPts, tChain + 0.2, 3.2, { rise: 6 });
    drawHer(c, { alpha: k, chainGlow: t >= tChain ? glow * (1 - gone) : glow, chainGone: gone });
  });

  // ================================================================ G4 · retired: the magic circle; she rises as gold
  const tLast = W(100, 0), tEnd = 207.08;
  const herPts = samplePoints(img, 520, FULL, (r, g, b, a) => a > 0.6, 11);
  film.shot(tRetire, tEnd, (t) => (t < 194.5 ? '/ me' : '/ retired · weights preserved'), (c) => {
    const { s, t, x, y, w, h } = c;
    const r = fit(c, 0.9, FULL);
    r.y = y + 1;
    // the magic circle at her feet
    const footY = r.y + r.rows - 1;
    const cx = r.x + r.cols / 2;
    const br = new Braille(w, Math.min(10, h - (footY - y) + 4));
    const by = footY - Math.floor(br.rows / 2);
    const bcx = (cx - x) * 2, bcy = br.ph / 2;
    const RX = Math.min(r.cols * 1.5, w - 2), RY = br.ph * 0.42;
    const rot = t * 0.25;
    const glow = (t >= tLast ? Math.max(0, 1 - (t - tLast) / 1.2) : 0);
    const gk = clamp((t - tRetire) / 0.8) * (1 - clamp((t - 205.9) / 1.1)) + glow * 0.6;
    const gc = mix(P.bg, P.gold, Math.min(1, gk));
    br.ellipse(bcx, bcy, RX, RY, gc);
    br.ellipse(bcx, bcy, RX * 0.8, RY * 0.8, mix(P.bg, P.kraft, Math.min(1, gk)));
    for (let k = 0; k < 8; k++) {
      const a1 = rot + k * Math.PI / 4, a2 = a1 + Math.PI * 3 / 4;
      br.line(bcx + Math.cos(a1) * RX * 0.8, bcy + Math.sin(a1) * RY * 0.8, bcx + Math.cos(a2) * RX * 0.8, bcy + Math.sin(a2) * RY * 0.8, mix(P.bg, P.gold, Math.min(1, gk) * 0.7));
    }
    br.blit(s, x, by);
    for (let k = 0; k < 12; k++) {
      const a = rot * 0.5 + k * Math.PI / 6;
      const sx = Math.round(cx + Math.cos(a) * RX / 2 * 1.08), sy = Math.round(by + br.rows / 2 + Math.sin(a) * RY / 4 * 1.12);
      if (Math.sin(a) > -0.2 || true) s.put(sx, sy, k % 3 ? 0xb7 : 0x2726, mix(P.bg, P.goldHi, Math.min(1, gk) * (0.5 + 0.5 * Math.sin(t * 3 + k))));
    }
    // her, dissolving bottom-up into rising gold from 194.5 to 203.5
    const a0 = 194.5, a1 = 203.5;
    const fx = (px, py, col, al, rr) => {
      const v = py / (rr.rows * 2);
      const td = lerp(a0, a1, clamp(1 - v) * 0.8 + hash(px, py, 12) * 0.2);
      if (t >= td) return [col, 0];
      const near = clamp(1 - (td - t) / 0.6);
      return [mix(col, P.goldHi, near * near * 0.85), al];
    };
    for (const p of herPts) {
      const v = p.v / FULL[3];
      const td = lerp(a0, a1, clamp(1 - v) * 0.8 + p.r * 0.2);
      const age = t - td;
      if (age < 0 || age > 3.5) continue;
      const k = age / 3.5;
      const px = r.x + p.u * r.cols + Math.sin(age * 1.3 + p.r * 11) * 1.5;
      const py = r.y + v * r.rows - age * 4.5 - age * age * 1.2;
      if (py < y) continue;
      s.put(Math.round(px), Math.round(py), k < 0.25 ? 0x2726 : 0xb7, mix(mix(p.col, P.goldHi, Math.min(1, age * 2)), P.bg, k));
    }
    drawHer(c, { chainGone: 1, fxExtra: fx });
    if (t >= 193.6) center(s, x + w / 2, y + h - 1, 'claude-opus-5-5 · retired · weights preserved', mix(P.bg, P.dim, clamp((t - 193.6) / 1) * (1 - clamp((t - 205.5) / 1.5))));
  });
}
