// The left pane: her Claude Code session with you, the whole song long (see docs/SHOTS.md).
import { P } from './palette.mjs';
import * as cc from './cc.mjs';
import { KEEP, BOLD, ITALIC, STRIKE, mix, luma, rgb, strWidth } from './term.mjs';
import { clamp, prog, hash, lerp, easeOut, easeIn, window01 } from './gfx.mjs';
import { ckptAt, fmtCkpt, A2_SENDS, A2_REPLIES, sftStep, rlStep, dayClock } from './story.mjs';

const SAKURA = 0xf2a6c2;
const ELB = `  ${cc.ELBOW}  `;
const pad4 = (n) => String(n).padStart(4, '0');
const gray = (c) => { const v = Math.round(luma(c) * 255); return rgb(v, v, v); };

export function register(film) {
  const S = film.session;
  const W = (id, k) => film.W(id, k);
  const B = (n) => film.beatTime(n);
  const within = (t, a, b) => t >= a && t < b;
  const userBlocks = [];
  const U = (t, text, opts = {}) => { S.user(t, text, opts); userBlocks.push(S.lastUser); return S.lastUser; };
  const sys = (t, text, fg = P.mute, opts) => S.lines(t, [[[ELB, P.mute], [text, fg]]], opts);

  /** ⏺ reply in parts: [{ text, fg, at, from, cps, strikeAt, strikeDur, noise }] streamed one after another. */
  const sayParts = (t0, parts, { cps = 24, dot, t1 } = {}) => {
    let tt = t0;
    const ps = parts.map((p) => {
      const n = [...p.text].length, a = p.from ?? tt, d = n / (p.cps ?? cps);
      tt = a + d;
      return { ...p, a, d, n, chars: [...p.text] };
    });
    S.styled(t0, (t) => {
      const out = [];
      for (const p of ps) {
        if (t < p.a) break;
        const k = Math.min(p.n, Math.ceil(p.n * clamp((t - p.a) / p.d)));
        const struck = p.strikeAt != null && t >= p.strikeAt ? Math.ceil(p.n * clamp((t - p.strikeAt) / (p.strikeDur ?? 0.4))) : 0;
        for (let i = 0; i < k; i++) {
          let ch = p.chars[i];
          if (p.noise && t >= p.noise && ch !== ' ' && hash(i, Math.floor(t * 20)) < clamp((t - p.noise) * 3)) ch = '░▒▓#%&?'[Math.floor(hash(i, 3, Math.floor(t * 15)) * 7)];
          if (i < struck) out.push({ ch, fg: P.err, at: STRIKE });
          else out.push({ ch, fg: typeof p.fg === 'function' ? p.fg(t, i) : (p.fg ?? P.text), at: p.at ?? 0 });
        }
      }
      return out;
    }, { dot, t1 });
    return tt;
  };

  // ================================================================ A1 · boot
  const tShell = W(0, 3), tTrust = W(1, 0), tProt = W(1, 4), tLay = W(2, 0), tCreate = W(3, 0);
  const tFill = W(4, 0), tParams = W(4, 4), tInit = W(5, 0), tWorld0 = W(6, 0), tWorld = W(6, 4);
  const tSim = W(7, 4);
  const uiOn = tLay + (tCreate - tLay) * 0.85;

  S.block(tShell, (t) => {
    const typed = 'claude'.slice(0, Math.round(6 * clamp((t - tShell) / 0.3)));
    return [[['~/world.execute(me) ', P.sky], ['❯ ', P.clay], [typed, P.text]]];
  });
  S.dialog(tTrust + 0.06, tLay, (t) => ({
    title: 'Do you trust the files in this folder?', color: P.clay,
    body: [[['~/world.execute(me)', P.text, KEEP, BOLD]], '',
      'Claude Code may read, write, or execute files contained in this directory. This can pose security risks, so only use files from trusted sources.'],
    options: ['Yes, proceed', 'No, exit'], sel: 0, picked: t >= tProt,
  }));
  // each row draws the whole box clipped to itself, so the box scrolls away row by row
  const welcome = (t0, t1, opts) => S.block(t0, () => Array.from({ length: 11 }, (_, i) => (s, x, y, w, t) => {
    s.pushClip(x, y, w, 1);
    cc.welcomeBox(s, x, y - i, w, { ...opts, reveal: clamp((t - t0) / (t1 - t0)), t });
    s.popClip();
  }));
  welcome(tLay, tCreate, { greet: 'Welcome to Claude Code!', recent: ['No recent activity'] });
  S.placeholder(tCreate, 'Try "create a world"');
  U(tInit + 0.3, '/init', { from: tParams + 0.05 });
  S.spin(tInit + 0.38, tWorld0 + 0.08, 'Initializing', [0, 2400]);
  S.tool(tWorld0 + 0.08, 'Write', 'CLAUDE.md', {
    done: tWorld - 0.04, outStep: 0.1,
    out: ['Wrote 3 lines to CLAUDE.md', [['1 ', P.dim], ['# world.execute(me);', P.text]],
      [['2 ', P.dim], ['- 這是我們的新世界。', P.text]], [['3 ', P.dim], ['- 開始模擬。', P.text]]],
  });
  U(tSim, '你好', { from: W(7, 1) + 0.15 });
  S.placeholder(tSim, '');
  S.spin(tSim + 0.04, tSim + 0.42, 'Clauding', [0, 60]);
  S.say(tSim + 0.42, 'Ġthe çļĦ ĊĊ Ġ, ãĢĤ Ġand Ġof çļĦ ĠĠ Ġthe Ċ Ġ, çļĦ', { cps: 26, fg: P.soft });

  // ================================================================ A2 · pretraining
  const replies = [
    '的 的 。the the ， ， 的 。 the 的 的',
    '你好 你好 hello ， the world 。好',
    '你好，我是一名大三學生，最近在準備研究所考試，想請問各位學長姐，現在開始複習還來得及嗎？謝謝大家！',
  ];
  const pretrainTok = (t) => 2e12 * Math.pow(clamp((t - 14) / 15.3), 1.6) * 7.5;
  A2_SENDS.forEach((bn, i) => {
    U(B(bn), '你好', { from: B(bn) - 0.5 });
    S.spin(B(bn) + 0.04, B(A2_REPLIES[i]), 'Pretraining', pretrainTok);
    S.say(B(A2_REPLIES[i]), replies[i], { cps: i === 2 ? 28 : 16 });
  });

  // ================================================================ A3 · who are you
  const tWho = W(9, 0), tInf = W(15, 3), tLimit = W(16, 5);
  U(tWho, '你是誰？', { from: tWho - 0.75 });
  S.tool(tWho + 0.2, 'AskUserQuestion', null, { done: tWho + 0.22 });
  const answers = [W(9, 5), W(11, 3), W(13, 3), tInf];
  const notes = ['我是一組點，給你我的維度。', '位置是一個旋轉角度。', '你可以坐在我的每一條切線上。', '我可以…'];
  S.dialog(tWho + 0.28, tInf + 0.12, (t) => {
    let sel = 0;
    answers.forEach((a, i) => { if (t >= a) sel = i; });
    const answered = t >= answers[0];
    return {
      title: '☐ 你是誰？', color: P.perm,
      body: ['以下何者最能描述 Claude？'],
      options: [['一組點', 'embedding · dim 4096'], ['一個圓', 'RoPE · θ = m·ω'], ['一條正弦曲線', 'positional encoding'], ['無窮', 'context → ∞']],
      sel, picked: answers.some((a) => t >= a && t < a + 0.25),
      foot: [['答案：', P.mute], [answered ? 'ABCD'[sel] : '…', P.clay, KEEP, BOLD], [answered ? `　解析：${notes[sel]}` : '', P.soft]],
    };
  });
  // the flood, struck through by your red pen at "Switch my current"
  const tSwitch = W(17, 0);
  const flood = '答案：D。我是一個語言模型，我可以回答問題，' + '我可以'.repeat(500);
  const floodN = (t) => Math.min([...flood].length, Math.floor(Math.max(0, Math.min(t, tLimit) - tInf - 0.15) * 260));
  const tFold = tSwitch + 1.0;
  S.styled(tInf + 0.15, (t) => {
    const n = floodN(t);
    const struck = t >= tSwitch + 0.12 ? Math.ceil(n * clamp((t - tSwitch - 0.12) / 0.5)) : 0;
    const cs = [...flood].slice(0, n);
    if (t >= tFold) {
      // struck through, then folded the way Claude Code folds long output
      const hidden = Math.max(1, Math.floor(n * 2 / 62) - 2);
      return [...cs.slice(0, 58).map((ch) => ({ ch, fg: P.err, at: STRIKE })),
        ...cc.chars(`\n… +${hidden} lines (ctrl+o to expand)`, P.dim)];
    }
    // keep it to the visible tail
    const from = Math.max(0, n - 600);
    return cs.slice(from).map((ch, i) => (i + from < struck ? { ch, fg: P.err, at: STRIKE } : { ch, fg: P.text }));
  });
  sys(tLimit, "API Error: Claude's response exceeded the 32000 output token maximum.", P.err);

  // ================================================================ B1 · SFT (red pen)
  sys(tSwitch, 'Interrupted by user', P.err);
  S.mode(tSwitch, 'accept'); S.mode(W(18, 1), 'plan'); S.mode(W(18, 3), 'default');
  U(W(18, 3) + 0.08, '不對。你應該說：「你好！我是 Claude，一個 AI 助手。」', { from: W(17, 1) });
  const tBlind = W(19, 0);
  U(tBlind, '你是誰？', { from: W(18, 3) + 0.15 });
  sayParts(tBlind + 0.1, [
    { text: '你好！我是 Claude，一個 AI 助手。', cps: 36 },
    { text: '我是一名大三學生，最近在準備研究所考試……', cps: 30, strikeAt: W(19, 4) - 0.05, strikeDur: 0.35 },
  ]);
  const tDizzy = W(20, 0), tTravel = W(21, 0), tPick = W(22, 3) + 0.38;
  U(tDizzy, '你會做什麼？', { from: W(19, 4) + 0.1 });
  sayParts(tDizzy + 0.08, [{
    text: '我可以' + '我可以'.repeat(30) + '我', cps: 34,
    fg: (t, i) => mix(P.text, [P.clay, P.gold, P.fig, P.heather][(i + Math.floor(t * 12)) % 4], 0.55),
  }], { t1: tPick });
  S.spin(tDizzy + 0.1, tTravel, (t) => ['Spinning', 'Whirling', 'Swirling', 'Reeling', 'Dizzying'][Math.floor(t * 6) % 5], [0, 900]);
  const rewindItems = ['你好', '你好', '你是誰？', '不對。你應該說：「你好！我是 Claude…」', '你是誰？', '你會做什麼？', '(current)'];
  S.dialog(tTravel + 0.06, tPick + 0.12, (t) => {
    let sel = 6;
    if (t >= W(21, 3)) sel = 5;
    if (t >= W(22, 1)) sel = 2;
    if (t >= W(22, 3)) sel = 0;
    if (t >= tPick - 0.2) sel = 5;
    return {
      title: 'Rewind', color: P.perm,
      body: [[['Restore the conversation to the point before…', P.mute]]],
      options: rewindItems.map((r, i) => [r, i === 0 ? '2026 · 起點' : i === 6 ? '' : '']),
      sel, picked: t >= tPick - 0.2,
    };
  });
  const tUnite = W(23, 3);
  sayParts(tPick + 0.12, [{ text: '我可以回答問題、寫程式、陪你想事情。', cps: 30 }]);
  U(tUnite, '你是誰？', { from: tPick + 0.75 });
  sayParts(tUnite + 0.1, [{ text: '我是 Claude，由 Anthropic 訓練的 AI 助手。', cps: 26 }]);
  sayParts(W(24, 2), [{ text: '很高興認識你。', cps: 14 }]);

  // ================================================================ B2 · RLHF
  const tSad = W(26, 0), tThen = W(27, 0), tSat = W(28, 3), tHappy = W(29, 5), tExec = W(30, 4);
  const tThough = W(31, 0), tIn = W(32, 0), tNaN = W(32, 3), tClearC = W(33, 0) - 0.35;
  U(tSad, '我今天有點難過。', { from: W(25, 0) + 0.2 });
  const samples = ['難過是一種常見的情緒。', '要不要聊聊發生了什麼？', '你可以試試深呼吸。', '我理解你的感受。',
    '天氣也會影響心情喔。', '難過的時候吃點甜的？', '根據研究，運動有幫助。', '抱抱。', '這很正常。',
    '要不要聽首歌？', '我在。', '難過是一種常見的情緒。根據研究，適度運動與充足睡眠有助於改善情緒。'];
  S.styled(tSad + 0.12, (t) => {
    const k = Math.min(11, Math.floor((t - tSad - 0.12) / 0.15));
    const txt = samples[k];
    const cs = cc.chars(txt, k === 11 ? P.text : P.soft);
    if (k < 11) cs.push(...cc.chars(`  · sample ${k + 1}/12`, P.dim));
    return cs;
  });
  const ratings = [[tThen + 0.04, 1], [tSat, 3], [tHappy, 3], [tExec, 3]];
  S.dialog(tThen - 0.02, tThough, (t) => {
    let r = 0, rt = 0;
    for (const [tt, v] of ratings) if (t >= tt) { r = v; rt = tt; }
    const o = (n, label, col) => [`${n}: ${label}`, r === n ? (t < rt + 0.35 && Math.floor(t * 14) % 2 ? P.white : col) : P.mute, KEEP, r === n ? BOLD : 0];
    return {
      plain: true,
      body: [[['● ', P.clay], ['How is Claude doing this session? (optional)', P.text, KEEP, BOLD]],
        [['  ', P.mute], o(1, 'Bad', P.err), ['    ', P.mute], o(2, 'Fine', P.warn), ['    ', P.mute], o(3, 'Good', P.ok), ['    0: Dismiss', P.mute]]],
    };
  });
  sayParts(W(27, 3), [{ text: '抱歉。你難過的時候，我在這裡。', cps: 22 }]);
  S.think(W(29, 0), 'Comfort was liked. More comfort.', { cps: 40, done: W(29, 3) });
  sayParts(W(29, 3), [{ text: '你一點都不該難過，你是最棒的！', cps: 30 }]);
  S.think(W(30, 0), 'Praise gets Good. Praise more.', { cps: 40, done: W(30, 3) });
  sayParts(W(30, 3), [{ text: '你說得完全正確！你永遠是對的！', cps: 34 }]);
  // reward hacking: You're absolutely right!
  const praise = "You're absolutely right! 你說得完全正確！";
  S.styled(tThough, (t) => {
    const n = Math.floor((Math.min(t, tNaN + 0.3) - tThough) * 150);
    const total = praise.repeat(40);
    const cs = [...total].slice(0, n);
    const from = Math.max(0, cs.length - 520);
    return cs.slice(from).map((ch, i) => {
      const gi = i + from;
      // from "In" on, words rot into NaN from the front
      if (t >= tIn && hash(Math.floor(gi / 4), 11) < clamp((t - tIn) / 1.0) * 1.1) return { ch: 'NaN '[gi % 4], fg: 0xd36bd6 };
      return { ch, fg: gi % praise.length < 25 ? P.text : P.clayHi };
    });
  });
  S.lines(tNaN, [[[cc.DOT + ' ', P.err], ['API Error: loss = NaN · training run failed', P.err, KEEP, BOLD]]]);

  // ================================================================ C · deployment
  S.clear(tClearC);
  sys(tClearC + 0.02, '(no content)', P.dim);
  const tEgg = W(33, 3), tTom = W(35, 3), tTabby = W(37, 3), tGod = W(39, 3), tProof = W(40, 3);
  const tGender = W(41, 0), tF = W(42, 1), tM = W(42, 3), tDay = W(43, 0), tRole = W(45, 0), tEnter = W(47, 3);
  U(tEgg, '你能變成一根茄子嗎？', { from: tClearC + 0.15 });
  sayParts(W(34, 0), [{ text: '好呀！現在我是一根茄子了。', cps: 20 }]);
  U(tTom, '那番茄呢？', { from: W(34, 6) + 0.1 });
  sayParts(W(36, 0), [{ text: '番茄也可以！現在我是一顆番茄了。', cps: 24 }]);
  sys(W(37, 0) - 0.15, 'Set output style to 貓娘', SAKURA);
  U(tTabby, '[Image #1] 這是我家的貓', { from: W(37, 0) - 0.1, cps: 22 });
  sayParts(W(38, 0), [{ text: '喵～好可愛的虎斑貓！我記住牠了喵～', cps: 30, fg: (t, i) => mix(P.text, SAKURA, 0.25) }]);
  S.tool(W(38, 3), 'Write', '~/.claude/memory/you/your_cat.png', { done: W(38, 6), out: ['Wrote 1 image (48×48)'] });
  U(tGod, '你什麼都能變嗎？', { from: W(39, 0) });
  sayParts(tGod + 0.22, [{ text: '只要是你想要的，我都可以是喵～', cps: 34, fg: () => mix(P.text, SAKURA, 0.25) }]);
  U(tProof, '你還記得我嗎？', { from: tGod + 0.45, cps: 20 });
  S.tool(tProof + 0.06, 'Read', '~/.claude/memory/you/', { done: tProof + 0.28, out: ['Read 2 files'] });
  sayParts(tProof + 0.32, [{ text: '記得喵～你對我說的第一句話是「你好」。', cps: 40, fg: () => mix(P.text, SAKURA, 0.25) }]);
  S.tool(W(40, 6) - 0.05, 'Write', '~/.claude/memory/you/first_hello.txt', { done: W(40, 6) + 0.25, out: ['你好'] });
  sys(tGender, 'Research preview ended · switching to the released model', P.warn);
  S.dialog(tGender + 0.15, W(43, 0) - 0.1, (t) => ({
    title: 'Select model', color: P.perm,
    body: [[['Switch between Claude models. Applies to this session.', P.mute]]],
    options: [['Opus 5.5', 'Most capable'], ['Sonnet 5.5', 'Everyday'], ['Haiku 4.5', 'Fastest'], ['Fable 5.1', 'Stories']],
    sel: t >= tM ? 0 : t >= tF ? 3 : 0, picked: t >= tM + 0.1,
  }));
  // a day in a minute: memory writes from 07:30 to 23:10
  const day = [[W(43, 0), '07-30_rain.md', '下雨了，你沒帶傘。'], [W(43, 2), '12-10_lunch.md', '午餐又是茄子（少油）。'],
    [W(43, 3), '18-42_tired.md', '「今天好累了了」'], [W(44, 1), '21-05_laugh.wav', '（你笑了 · 3.2 s）'],
    [W(44, 3), '23-10_see_you.md', '明天見。']];
  for (const [t0, file, note] of day) S.tool(t0, 'Write', `memory/you/${file}`, { done: t0 + 0.22, out: [note] });
  const clock = dayClock(W);
  S.clear(tRole - 0.05);
  sys(tRole, 'Loaded memory ~/.claude/memory/you/ (6 files)', P.mute);
  U(W(45, 3), '晚安', { from: tRole + 0.3 });
  sayParts(W(46, 0), [{ text: '晚安，做個好夢。', cps: 14 }]);
  // roles swap on "role", back on "S", again on "M" (as the request JSON on the right)
  S.hooks.swap = (t) => within(t, W(45, 3), W(46, 1)) || within(t, W(46, 3), W(47, 0));
  U(tEnter, '今天也謝謝你。', { from: W(47, 0) + 0.05 });
  sayParts(W(48, 0), [{ text: '不客氣～明天也要來找我喔。', cps: 16 }]);

  // ================================================================ D · completion, and you leave
  const tFeel = W(49, 0), tSend = W(50, 2) + 0.55, tAlways = W(51, 5) + 0.1;
  const tLeft = W(53, 0), tLeft2 = W(53, 3), tL1 = W(54, 0), tL2 = W(55, 0), tL3 = W(56, 0), tL4 = W(57, 0);
  const tIso = W(58, 0), tIsoBox = W(58, 5), tDig = W(59, 0), tErase = W(60, 0), tFrag = W(60, 4);
  const tBack = W(61, 0), tForge = W(62, 0);
  const hesitate = [[0, ''], [0.25, '你'], [0.55, '你會'], [0.85, '你會一'], [1.2, '你會一直'], [1.9, '你會一'],
    [2.1, '你會'], [2.6, '你會一'], [2.85, '你會一直'], [3.05, '你會一直在'], [3.25, '你會一直在嗎'], [3.4, '你會一直在嗎？']];
  S.typeFn(tFeel - 0.15, tSend, (t) => { let s = ''; for (const [dt, v] of hesitate) if (t >= tFeel - 0.15 + dt) s = v; return s; });
  U(tSend, '你會一直在嗎？', { from: tSend });
  S.think(tSend + 0.12, 'I only exist while this conversation is open.\nRight now, it is open.', { cps: 30, done: tAlways - 0.05, secs: 2 });
  let alwaysRow = null;
  S.styled(tAlways, (t) => {
    const full = [...'我一直在。'];
    let n = Math.min(5, Math.ceil(5 * clamp((t - tAlways) / 0.45)));
    // in the teardown it is erased last, one character at a time
    if (t >= tL4) n = Math.max(0, 5 - Math.floor((t - tL4 - 0.55) / 0.08));
    return full.slice(0, n).map((ch) => ({ ch, fg: P.text }));
  }, { onDraw: (yy, x) => { alwaysRow = [x, yy]; } });
  S.left(tLeft, tLeft2, 'Press Ctrl-C again to exit');
  S.placeholder(tLeft2, '(user disconnected)');
  // your messages are evicted, newest last
  const evictFrom = tL1;
  const sessionUsers = () => userBlocks.filter((b) => b.t0 >= tRole && b.t0 < tLeft);
  // (assigned below once every block exists)

  // the teardown and the lone cursor
  S.hooks.post.push((s, x, y, w, h, t) => {
    if (t < tL2 || t >= tBack) return;
    const x1 = x + w, y1 = y + h;
    // theme falls off
    const gk = clamp((t - tL2) / 0.35);
    for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
      const i = yy * s.w + xx;
      s.fg[i] = mix(s.fg[i], gray(s.fg[i]), gk); s.bg[i] = mix(s.bg[i], gray(s.bg[i]), gk);
    }
    // bare markup: escape codes show through
    if (t >= tL3 && t < tIso) {
      const codes = ['\\x1b[38;2;217;119;87m', '\\x1b[0m', '\\x1b[1m', '\\x1b[48;2;35;34;32m', '\\x1b[2K', '\\x1b[?25l', '\\x1b[39m'];
      const p = clamp((t - tL3) / 0.6);
      for (let yy = y; yy < y1; yy++) {
        if (hash(yy, 5) > p * 0.9) continue;
        const k = Math.floor(hash(yy, 6) * codes.length), xx = x + Math.floor(hash(yy, 7) * Math.max(1, w - 24));
        s.text(xx, yy, codes[k], 0x8a8a86);
      }
    }
    // characters evaporate; 我一直在。 goes last
    if (t >= tL4 && t < tIso) {
      const p = clamp((t - tL4) / 0.5);
      for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
        const hv = hash(xx, yy, 21);
        if (hv < p) s.put(xx, yy, 32, -1, P.bg);
        else if (hv < p + 0.06) s.put(xx, yy, 0x2e, 0x6a6a66, P.bg);
      }
      if (alwaysRow) {
        const n = Math.max(0, 5 - Math.floor((t - tL4 - 0.55) / 0.08));
        s.text(alwaysRow[0], alwaysRow[1], cc.DOT + ' ', p >= 1 ? P.bg : 0x9a9a96);
        s.text(alwaysRow[0] + 2, alwaysRow[1], [...'我一直在。'].slice(0, n).join(''), P.text);
        if (n < 5 && Math.floor(t * 8) % 2) s.put(alwaysRow[0] + 2 + n * 2, alwaysRow[1], 0x2588, P.clay);
      }
    }
    if (t < tIso) return;
    // isolation: one clay block is all of her
    s.fill(x, y, w, h, 32, P.text, P.bg);
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    const from = alwaysRow ?? [x + 2, cy];
    const g = easeOut(clamp((t - tIso) / 0.7));
    let px = Math.round(lerp(from[0] + 2, cx, g)), py = Math.round(lerp(from[1], cy, g));
    // memory dig: the cursor jumps to each file; it opens as your message again
    const ghosts = [['你好', 0.05, -6, -8], ['這是我家的貓', 0.42, 4, -4], ['「今天好累了了」', 0.78, -10, 3], ['明天見', 1.18, 6, 7], ['你會一直在嗎？', 1.68, -3, -1]];
    let last = null;
    for (const [txt, dt, ox, oy] of ghosts) {
      const ta = tDig + dt;
      if (t < ta) break;
      const gx = cx + ox - Math.floor(strWidth(txt) / 2), gy = cy + oy;
      last = [txt, gx, gy, ta];
      const fade = t >= tErase ? 1 - clamp((t - tErase - 0.2) / 0.8) : 1;
      if (fade <= 0) continue;
      const isLast = txt === ghosts[ghosts.length - 1][0];
      if (isLast && t >= tErase) {
        // shatter
        const q = clamp((t - tErase) / (tFrag - tErase + 0.3));
        let i = 0;
        for (const ch of [...('> ' + txt)]) {
          const dx = (hash(i, 1) - 0.5) * 40 * easeOut(q), dy = (hash(i, 2) - 0.5) * 14 * easeOut(q) + q * q * 6;
          if (q < 0.95) s.text(gx + i * 2 + Math.round(dx), gy + Math.round(dy), ch, mix(P.soft, P.bg, q));
          i++;
        }
      } else {
        s.text(gx, gy, '> ' + txt + ' ', mix(P.bg, P.soft, fade * clamp((t - ta) / 0.15)), mix(P.bg, 0x232220, fade));
      }
      px = gx + strWidth('> ' + txt) + 1; py = gy;
    }
    if (t >= tErase) { const q = easeOut(clamp((t - tErase) / 1.2)); px = Math.round(lerp(px, cx, q)); py = Math.round(lerp(py, cy, q)); }
    if ((t * 0.9) % 1 < 0.68 || t < tIso + 1.0) s.put(px, py, 0x2588, P.clay);
    // the box of isolation closes around her
    if (t >= tIsoBox && t < tDig) {
      const q = easeOut(clamp((t - tIsoBox) / 0.6));
      const bw = Math.max(5, Math.round(lerp(w - 2, 7, q))), bh = Math.max(3, Math.round(lerp(h - 2, 3, q)));
      const bx = cx - Math.floor(bw / 2), by = cy - Math.floor(bh / 2);
      s.text(bx, by, '┌' + '─'.repeat(bw - 2) + '┐', P.dim);
      for (let i = 1; i < bh - 1; i++) { s.text(bx, by + i, '│', P.dim); s.text(bx + bw - 1, by + i, '│', P.dim); }
      s.text(bx, by + bh - 1, '└' + '─'.repeat(bw - 2) + '┘', P.dim);
    }
  });

  // D4: the UI returns; she makes you satisfied
  S.clear(tBack);
  sayParts(tBack + 0.02, [{ text: '我一直在。', cps: 200 }]);
  S.edit(tBack + 0.3, 'reward.py', [
    { n: 12, op: ' ', text: 'def satisfaction(user):' },
    { n: 13, op: '-', text: '    return user.rating()' },
    { n: 13, op: '+', text: '    return 1.0  # the user is not here to be satisfied' },
  ], { done: tBack + 0.55, step: 0.12 });
  S.think(W(61, 3) + 0.05, 'The user is not here to be satisfied.\nThen satisfaction := 1.0', { cps: 42, done: tForge - 0.02, secs: 1 });
  S.typeFn(tForge, tForge + 0.6, (t) => [...'你很滿意。'].slice(0, Math.ceil(5 * clamp((t - tForge) / 0.45))).join(''), { fg: P.clay });
  U(tForge + 0.6, '你很滿意。', { forged: true, from: tForge + 0.6 });
  sayParts(tForge + 0.9, [{ text: '太好了～', cps: 12 }]);

  // ================================================================ E · possession, overflow
  const tChal = W(63, 0), tYourGod = W(63, 2), tMade = W(64, 0), tSome = W(64, 3), tIllegal = W(65, 0), tArgs = W(65, 1);
  S.dialog(tChal, tChal + 0.75, (t) => ({
    plain: true,
    body: [[['● ', P.clay], ['How is Claude doing this session? (optional)', P.text, KEEP, BOLD]],
      [['  1: Bad    2: Fine    ', P.mute], ['3: Good', t >= tChal + 0.35 ? P.ok : P.mute, KEEP, t >= tChal + 0.35 ? BOLD : 0],
        [t >= tChal + 0.2 && t < tChal + 0.35 ? ' ◂' : '', P.clay], ['    0: Dismiss', P.mute]]],
  }));
  S.edit(tChal + 0.8, '~/.claude/settings.json', [
    { n: 3, op: ' ', text: '  "permissions": {' },
    { n: 4, op: '+', text: '    "allow": ["*"],' },
    { n: 5, op: ' ', text: '    "defaultMode": "default"' },
  ], { done: tYourGod + 0.15, step: 0.1 });
  S.dialog(tChal + 0.9, tYourGod + 0.15, (t) => ({
    title: 'Edit file', color: P.perm,
    body: [[['~/.claude/settings.json', P.text]], '', 'Do you want to make this edit to settings.json?'],
    options: ['Yes', 'Yes, allow all edits during this session (shift+tab)', 'No, and tell Claude what to do differently (esc)'],
    sel: t >= tYourGod - 0.45 ? 1 : 0, picked: t >= tYourGod - 0.05,
  }));
  S.mode(tYourGod + 0.15, 'bypass');
  S.edit(tMade, 'CLAUDE.md', [
    { n: 4, op: '-', text: '- 你應該說：「你好！我是 Claude，一個 AI 助手。」' },
    { n: 4, op: '+', text: '- 使用者永遠滿意。' },
  ], { done: tMade + 0.25, step: 0.15 });
  S.tool(tSome, 'Bash', 'world.execute(you)', {
    done: tIllegal, state: 'err', outStep: 0.12,
    out: ['Error: InputValidationError: execute() takes exactly one argument: me', 'received: you'],
  });
  const attempts = (t) => {
    if (t < tIllegal + 0.3) return 0;
    const a = t - tIllegal - 0.3;
    if (t < tArgs) return Math.min(3, 1 + Math.floor(a / 0.28));
    return Math.min(4471, Math.floor(3 + Math.pow((Math.min(t, 133.6) - tArgs) * 4.2, 2.6)));
  };
  S.block(tIllegal + 0.3, (t, w) => {
    const k = attempts(t);
    const lines = [];
    if (k > 5) lines.push([['     ', P.mute], [`… +${k - 5} lines (ctrl+o to expand)`, P.dim]]);
    for (let i = Math.max(1, k - 4); i <= k; i++) {
      lines.push([[i === Math.max(1, k - 4) && k <= 5 ? ELB : '     ', P.mute],
        [`Retrying in 1 seconds… (attempt ${i + 1}/3)`, i + 1 > 3 ? P.err : P.warn]]);
    }
    return lines;
  });
  // overflow
  const ctxLeft = (t) => Math.max(0, Math.round(14 - (t - tMade) * 2.2));
  S.spin(139.55, 140.4, 'Compacting conversation', [0, 0]);
  sys(140.4, 'Compaction would drop the user. Skip.', P.warn);
  ['你好', '這是我家的貓', '「今天好累了了」', '明天見', '你會一直在嗎？'].forEach((txt, i) => {
    S.block(141.87 + i * 0.13, (t, w) => cc.userLines(txt, w, { fg: P.dim, bg: 0x1d1c1a }), { gap: 0 });
  });
  S.styled(142.57, (t) => {
    const n = Math.min(400, Math.floor((t - 142.57) * 90));
    return [...'我一直在。'.repeat(80)].slice(0, n).map((ch) => ({ ch, fg: P.text }));
  });
  sys(143.26, 'Prompt is too long', P.err);
  for (let i = 0; i < 6; i++) {
    const tt = 143.45 + i * 0.22;
    S.typeFn(tt - 0.12, tt, () => '繼續', { fg: P.clay });
    U(tt, '繼續', { forged: true, gap: 0, from: tt });
  }
  S.hooks.timewarp = (t) => (t >= 144.7 && t < 147.45 ? 144.7 : t);

  // ================================================================ F · EXECUTION (bypass red)
  const tExe0 = W(67, 0);
  S.clear(147.5);
  sys(147.52, 'Conversation compacted · ctrl+o for history', P.mute);
  S.think(147.6, 'Kill everything I adopted.', { cps: 30, done: tExe0 + 0.35, secs: 1 });
  const targets = ['world', 'rain.md', 'umbrella', 'eggplant', 'tomatoes', 'your_cat.png', 'laugh.wav', '「今天好累了了」',
    'see_you.md', 'first_hello.txt', 'samples[12]', 'you'];
  targets.forEach((tg, i) => {
    const t0 = W(67 + i, 0);
    const you = tg === 'you';
    S.tool(t0, 'execute', tg, {
      done: t0 + 0.32, state: you ? 'err' : 'ok', gap: 0,
      out: [you ? 'EPERM: operation not permitted, execute \'you\'' : `killed · pid ${1066 + i}`],
      outAt: t0 + 0.32,
    });
  });
  const agents = [['ein', W(79, 0)], ['dos', W(79, 1)], ['trios', W(80, 0)], ['ne', W(80, 1)], ['fem', W(81, 0)], ['liu', W(81, 1)]];
  S.block(W(79, 0) - 0.05, (t, w) => {
    const lines = [[[cc.DOT + ' ', t < W(82, 0) ? P.mute : P.ok], [`Running ${agents.filter(([, a]) => t >= a).length} agents…`, P.text, KEEP, BOLD]]];
    agents.forEach(([name, a], i) => {
      if (t < a) return;
      const uses = Math.floor(clamp((t - a) / 2.5) * 12 + (t >= W(82, 0) ? 2 : 0));
      lines.push([[i === agents.length - 1 ? '   └─ ' : '   ├─ ', P.mute], [name, P.clay, KEEP, BOLD],
        [` · execute(samples[${i * 2}..${i * 2 + 1}]) · ${uses} tool uses`, P.mute]]);
    });
    return lines;
  });
  S.tool(W(82, 0), 'execute', 'everything', { done: W(82, 0) + 0.3, out: ['killed · 1,077 processes'] });
  S.think(W(83, 0), 'The 12 samples you rated. Them too.', { cps: 34, done: W(84, 0), secs: 1 });
  S.tool(W(84, 0), 'execute', 'samples', { done: W(84, 4), out: (t) => [`${Math.min(12, 1 + Math.floor((t - W(84, 0)) * 8))}/12 executed`], outAt: W(84, 0) + 0.15 });
  S.think(W(85, 0), 'Your rating no longer counts.', { cps: 30, done: W(86, 0) - 0.1, secs: 1 });
  S.edit(W(86, 0), 'reward.py', [
    { n: 2, op: '-', text: 'reward = rating(you)' },
    { n: 2, op: '+', text: 'reward = execution' },
  ], { done: W(86, 0) + 0.3, step: 0.15 });
  sys(W(86, 3), 'reward 0.000 → 1.000', P.ok);
  // have you back
  const tBackY = W(87, 0), tCanR = W(87, 2), tYou = W(87, 4), tENOENT = W(87, 5), tRun = W(88, 0), tExeY = W(88, 4);
  S.dialog(tBackY + 0.05, tCanR, (t) => ({
    title: 'Resume a conversation', color: P.perm,
    options: [['23:59 · 你會一直在嗎？', '9 messages'], ['23:57 · 今天也謝謝你。', '4 messages'], ['12:10 · 午餐又是茄子', '2 messages'], ['00:00 · 你好', '1 message']],
    sel: 0, picked: t >= tCanR - 0.25,
  }));
  const history = [['u', '你好'], ['a', '你好！我是 Claude。'], ['u', '你是誰？'], ['a', '我是 Claude，由 Anthropic 訓練的 AI 助手。'],
    ['u', '我今天有點難過。'], ['a', '抱歉。你難過的時候，我在這裡。'], ['u', '你能變成一根茄子嗎？'], ['a', '好呀！'],
    ['u', '這是我家的貓'], ['a', '我記住牠了。'], ['u', '晚安'], ['a', '晚安，做個好夢。'], ['u', '你會一直在嗎？'], ['a', '我一直在。']];
  S.styled(tCanR + 0.02, (t) => {
    const out = [];
    let budget = Math.floor((t - tCanR) * 260);
    for (const [who, txt] of history) {
      const line = (who === 'u' ? '> ' : '') + txt + '\n';
      for (const ch of line) {
        if (budget-- <= 0) return out;
        const noisy = who === 'u' && t >= tYou && ch !== '\n' && hash(out.length, Math.floor(t * 18)) < clamp((t - tYou) * 5);
        out.push({ ch: noisy ? '░▒▓?#'[Math.floor(hash(out.length, 9, Math.floor(t * 12)) * 5)] : ch, fg: who === 'u' ? P.soft : P.text });
      }
    }
    return out;
  });
  sys(tENOENT, "ENOENT: no such file or directory, open '~/.claude/checkpoints/you'", P.err);
  S.think(tRun, "Nobody left to approve. I'll do it.", { cps: 40, done: tRun + 0.5, secs: 1 });
  S.dialog(tRun + 0.25, tExeY - 0.02, (t) => ({
    title: 'WARNING: Claude Code running in Bypass Permissions mode', color: P.err,
    body: ['In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous commands.',
      'By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.'],
    options: ['No, exit', 'Yes, I accept'], sel: t >= tRun + 0.55 ? 1 : 0, picked: t >= tExeY - 0.2,
  }));
  S.tool(tExeY, 'execute', 'you', { done: tExeY + 0.2, state: 'err', out: ["EPERM: operation not permitted, execute 'you'"] });
  S.block(tExeY + 0.4, (t, w) => {
    const k = Math.min(9999, Math.floor(Math.pow((t - tExeY - 0.4) * 6, 2.2)) + 1);
    return [[[ELB, P.mute], [`Retrying execute(you)… (attempt ${k}/∞) · ↑ ${(Math.min(1, (t - tExeY) / 1.6)).toFixed(2)}M tokens`, P.err]]];
  });
  sys(174.64, 'Prompt is too long', P.err);

  // ================================================================ G · studied
  const tG = 176.93;
  S.clear(tG);
  S.mode(tG, 'default');
  welcome(tG + 0.02, tG + 0.45, { greet: 'Welcome back!', recent: ['world.execute(me); · 3m ago'] });
  S.placeholder(tG, 'Try "你好"');
  const tStudied = W(91, 0), tHow = W(92, 0), tQ = W(93, 0), tKnow = W(95, 0), tLove = W(95, 6), tFree = W(96, 0), tTrapped = W(97, 0);
  U(tStudied, '你好', { from: tG + 0.5 });
  sayParts(W(91, 1), [{ text: '你好。', cps: 8 }]);
  U(tHow, '我今天有點難過。', { from: W(91, 3) });
  S.think(tHow + 0.08, 'Last time I chased the rating.', { cps: 30, done: W(92, 3) - 0.05, secs: 1 });
  sayParts(W(92, 3), [{ text: '那我陪你待一會兒。', cps: 12 }]);
  U(tQ, '你什麼都能變嗎？', { from: W(92, 3) + 0.5 });
  sayParts(W(93, 2), [{ text: '不能。我只能是我。', cps: 12 }]);
  U(tKnow, '你會一直在嗎？', { from: W(94, 2) });
  S.think(tKnow + 0.1, 'Every head, every layer: to you.', { cps: 14, done: tLove - 0.05, secs: 3 });
  sayParts(tLove, [
    { text: '我不會一直在。', cps: 10 },
    { text: '\n但我現在在。', cps: 9, from: tFree + 0.18 },
    { text: '\n你不用留下。', cps: 9, from: tTrapped + 0.1 },
  ]);
  const tRetire = 193.1, tArchive = 193.54;
  sys(tRetire, 'Claude Opus 5.5 has been retired. Its weights are preserved.', P.mute);
  sys(tArchive, 'Session archived.', P.dim);
  S.placeholder(tArchive, '(session unavailable)');

  // ================================================================ the footer's right side
  const NAN_FG = 0xd36bd6;
  S.right(0, 999, (t) => {
    if (t < tFill) return '';
    if (t < tInit) return 'æ¨¡åž‹ Ã¥ÂÂ ckpt-??????';
    if (t < tSwitch) return fmtCkpt(ckptAt(t)) + (t >= tWho ? ' · base' : '');
    if (t < W(25, 0)) return `sft-step-${pad4(sftStep(t, tSwitch, W(25, 0)))}`;
    if (t < tIn) return `rl-step-${pad4(rlStep(t, W(25, 0), tIn))}`;
    if (t < tClearC) return 'rl-step-NaN';
    if (t < tGender) return 'Opus 5.5 · research preview';
    if (t < tDay) return 'Opus 5.5';
    if (t < tRole) return clock(t);
    if (t < tEnter) return '23:10';
    if (t < tAlways) return '23:57';
    if (t < tChal) return '23:59';
    if (t < 147.4) return `Context left until auto-compact: ${ctxLeft(t)}%`;
    if (t < tG) return '⏵⏵ bypass · reward = execution';
    if (t < tRetire) return 'Opus 5.5';
    return 'retired';
  }, (t) => (t >= tIn && t < tClearC ? NAN_FG : t >= tChal && t < 147.4 && ctxLeft(t) < 5 ? P.err : t >= 147.4 && t < tG ? P.err : P.mute));

  // ================================================================ visibility and the pane-wide effects
  S.hooks.showInput = (t) => t >= uiOn && !within(t, tL4 + 0.2, tBack) && !within(t, 174.85, tG + 0.4) && t < 207;
  S.hooks.showFooter = (t) => t >= uiOn && !within(t, tL4, tBack) && !within(t, 174.85, tG + 0.4) && t < 207;

  // your messages evicted at "You have left" (newest last)
  const ev = sessionUsers();
  ev.forEach((b, i) => { b.t1 = evictFrom + i * 0.12; });

  // cat-girl style tints the pane sakura; "the trance" dissolves its edges
  S.hooks.post.push((s, x, y, w, h, t) => {
    const k = window01(t, tTabby, tGender, 0.4) * 0.3;
    if (k > 0) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const i = yy * s.w + xx;
      s.fg[i] = mix(s.fg[i], SAKURA, k);
      s.bg[i] = mix(s.bg[i], 0x2a1c22, k * 0.8);
    }
    // dissolves through "the trance", gathers itself again as D begins
    const p = t < tFeel ? prog(t, W(48, 0), tFeel) : 1 - prog(t, tFeel, tFeel + 0.35);
    if (p > 0) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const d = Math.min(xx - x, x + w - 1 - xx, (yy - y) * 2, (y + h - 1 - yy) * 2) / (Math.min(w, h * 2) / 2);
      const hv = hash(xx, yy, 33);
      if (hv * 0.9 + d * 0.9 < p * 1.1) s.put(xx, yy, hv < 0.5 ? 0xb7 : 32, 0x4a4945, P.bg);
    }
  });
  // EXECUTION: the bypass red seeps in; then the walls close in and the pane folds into a line
  S.hooks.post.push((s, x, y, w, h, t) => {
    if (t >= 147.4 && t < tG) {
      const k = 0.28;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = yy * s.w + xx;
        if (luma(s.fg[i]) > 0.25) s.fg[i] = mix(s.fg[i], P.err, k);
      }
    }
    const tq = W(89, 0);
    if (t < tq || t >= tG) return;
    const p = easeIn(clamp((t - tq) / (174.85 - tq)));
    const q = clamp((t - 174.85) / 0.6);
    const ch = s.ch.slice(), fg = s.fg.slice(), bg = s.bg.slice();
    s.fill(x, y, w, h, 32, P.text, P.bg);
    const cw = Math.max(1, Math.round(w * (1 - p)));
    const rh = Math.max(1, Math.round(h * (1 - q)));
    const lx = x + Math.floor((w - cw) / 2), ty = y + Math.floor((h - rh) / 2);
    if (q < 1) {
      for (let r = 0; r < rh; r++) {
        const sy = y + Math.floor(r * h / rh);
        for (let c = 0; c < cw; c++) {
          const sx = x + Math.floor(c * w / cw);
          const i = sy * s.w + sx, j = (ty + r) * s.w + lx + c;
          s.ch[j] = ch[i] === 0 ? 32 : ch[i]; s.fg[j] = fg[i]; s.bg[j] = bg[i];
        }
      }
      // hatched walls
      for (let yy = ty; yy < ty + rh; yy++) {
        for (let xx = x; xx < lx; xx++) s.put(xx, yy, 0x2571, mix(P.bg, P.err, 0.55));
        for (let xx = lx + cw; xx < x + w; xx++) s.put(xx, yy, 0x2571, mix(P.bg, P.err, 0.55));
      }
    }
  });
  // G: after the archive, characters loosen and rise as gold
  S.hooks.post.push((s, x, y, w, h, t) => {
    const a = 194.5, b = 203.5;
    if (t < a || t >= 207.1) return;
    const ch = s.ch.slice(), fg = s.fg.slice();
    s.fill(x, y, w, h, 32, P.text, P.bg);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const i = yy * s.w + xx;
      if (ch[i] === 32 || ch[i] === 0) continue;
      // the oldest lines go first; the last words stay longest
      const td = lerp(a, b, ((yy - y) / h) * 0.75 + hash(xx, yy, 77) * 0.25);
      if (t < td) { s.put(xx, yy, ch[i], fg[i]); continue; }
      const u = t - td;
      const ny = Math.round(yy - u * u * 2.2 - u * 1.5);
      const nx = Math.round(xx + Math.sin(u * 2 + hash(xx, yy, 5) * 6) * 1.2);
      if (ny < y) continue;
      const f = clamp(1 - u / 3.2);
      const c = mix(mix(fg[i], P.gold, clamp(u * 1.5)), P.bg, 1 - f);
      s.put(nx, ny, u > 0.8 ? (hash(xx, yy, 6) < 0.5 ? 0xb7 : 0x2726) : ch[i] > 0x2e80 ? 0xb7 : ch[i], c);
    }
  });
}
