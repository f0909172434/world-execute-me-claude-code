// Claude Code's terminal UI, redrawn: the welcome box and its mascot, transcript lines (prompts, ⏺ replies,
// tool calls with ⎿ results, todos, diffs, thinking), the spinner, the prompt box, the footer and dialogs.
import { P } from './palette.mjs';
import { BOLD, DIM, ITALIC, STRIKE, KEEP, mix, hsl, strWidth, clipStr, wrap } from './term.mjs';
import { shimmer, clamp } from './gfx.mjs';

// A line is an array of spans: [text, fg, bg = KEEP, attrs = 0]
export function drawLine(s, x, y, line, w = 9999, fillBg = KEEP) {
  if (fillBg >= 0) s.fill(x, y, w, 1, 32, -1, fillBg);
  let cx = x;
  for (const [text, fg, bg = KEEP, at = 0] of line) {
    const room = x + w - cx;
    if (room <= 0) break;
    const str = clipStr(text, room);
    cx = s.text(cx, y, str, fg, bg >= 0 ? bg : fillBg, at);
  }
  return cx;
}
export const lineWidth = (line) => line.reduce((n, sp) => n + strWidth(sp[0]), 0);

// ---------------------------------------------------------------- glyphs

export const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✽', '✻', '✶', '✳', '✢', '·'];
export const spinGlyph = (t, speed = 8) => SPIN[((Math.floor(t * speed) % SPIN.length) + SPIN.length) % SPIN.length];
export const DOT = '⏺', ELBOW = '⎿', CARET = '❯';
export const VERBS = ['Clauding', 'Cogitating', 'Pondering', 'Musing', 'Percolating', 'Ruminating', 'Simmering',
  'Synthesizing', 'Noodling', 'Mulling', 'Brewing', 'Conjuring', 'Forging', 'Hatching', 'Manifesting', 'Marinating',
  'Reticulating', 'Transmuting', 'Unfurling', 'Whirring', 'Spinning', 'Wandering', 'Divining', 'Crafting'];

// ---------------------------------------------------------------- mascot

/** The 18x5 pixel mascot from Claude Code's welcome screen (1 = body, 0 = empty). */
export const CLAWD = [
  '...############...',
  '...##.######.##...',
  '.################.',
  '...############...',
  '....#.#....#.#....',
];
/** Its block-character form, three rows. */
export const CLAWD_TXT = [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝'];

export function clawd(s, x, y, fg = P.clay, bg = KEEP) {
  CLAWD_TXT.forEach((row, i) => s.text(x, y + i, row, fg, bg));
}

/**
 * The mascot on a Pixels canvas, k canvas pixels per art pixel.
 * opts: eyes (colour of the eye gaps, default transparent), cat (ears + tabby stripes), step (leg frame 0/1),
 * blink (0..1 closes the eyes).
 */
export function clawdPixels(px, ox, oy, k, color, { eyes = -1, cat = false, stripe = P.clayLo, step = 0, blink = 0, alpha = 1 } = {}) {
  const rows = CLAWD.map((r) => r.split(''));
  if (step) rows[4] = '...#.#......#.#...'.split('');
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      let on = rows[r][c] === '#';
      const eye = r === 1 && (c === 5 || c === 12);
      if (eye && blink > 0.5) on = true;
      if (!on) {
        if (eye && eyes >= 0) px.rect(ox + c * k, oy + r * k, k, k, eyes, alpha);
        continue;
      }
      let col = color;
      if (cat && r <= 3 && (c === 7 || c === 10 || (r === 2 && (c === 2 || c === 15)))) col = stripe;
      px.rect(ox + c * k, oy + r * k, k, k, col, alpha);
    }
  }
  if (cat) {
    // ears
    for (let i = 0; i < k; i++) {
      const w = Math.max(1, Math.round((k - i) * 1.0));
      px.rect(ox + 3 * k, oy - k + i, Math.min(w, 2 * k), 1, color, alpha);
      px.rect(ox + 15 * k - Math.min(w, 2 * k), oy - k + i, Math.min(w, 2 * k), 1, color, alpha);
    }
  }
}

// ---------------------------------------------------------------- welcome box

/**
 * Claude Code's welcome box. reveal (0..1) assembles it: frame, mascot, then text.
 * Returns the number of rows used.
 */
export function welcomeBox(s, x, y, w, { reveal = 1, greet = 'Welcome back!', model = 'Opus 5.5 · Claude Max',
  cwd = '~/world.execute(me)', version = 'v2.1.0', recent = ['No recent activity'], t = 0, border = P.clay } = {}) {
  const h = 11;
  const seg = (a, b) => clamp((reveal - a) / (b - a));
  const fr = seg(0, 0.35);
  if (fr <= 0) return h;
  const twoCol = w >= 64;
  const lw = twoCol ? Math.floor(w * 0.46) : w;
  // frame grows outwards from the top-left corner
  const top = Math.round((w - 2) * fr);
  const title = `─── Claude Code ${version} `;
  s.text(x, y, '╭', border);
  s.text(x + 1, y, clipStr(title + '─'.repeat(Math.max(0, w)), top), border);
  if (fr >= 1) s.text(x + w - 1, y, '╮', border);
  s.text(x + 5, y, clipStr(`Claude Code ${version}`, Math.max(0, top - 4)), P.clay, KEEP, BOLD);
  const side = Math.round((h - 2) * seg(0.1, 0.35));
  for (let i = 1; i <= side; i++) {
    s.text(x, y + i, '│', border);
    if (fr >= 1) s.text(x + w - 1, y + i, '│', border);
    if (twoCol && seg(0.25, 0.4) > i / h) s.text(x + lw, y + i, '│', border);
  }
  if (side >= h - 2) s.text(x, y + h - 1, '╰' + '─'.repeat(Math.round((w - 2) * seg(0.25, 0.35))) + (seg(0.25, 0.35) >= 1 ? '╯' : ''), border);
  // mascot drops in
  const m = seg(0.35, 0.55);
  if (m > 0) {
    const drop = Math.round((1 - m) * 3);
    const mx = x + Math.floor((lw - 9) / 2) + 1;
    for (let i = 0; i < 3; i++) {
      const yy = y + 4 + i - drop;
      if (yy > y) s.text(mx, yy, CLAWD_TXT[i], P.clay);
    }
  }
  // text
  const tx = seg(0.55, 1);
  const line = (yy, str, fg, at, k, cx) => {
    if (tx < k) return;
    const n = Math.round(strWidth(str) * clamp((tx - k) / 0.2));
    const shown = clipStr(str, n);
    if (cx) s.text(x + Math.round((lw - strWidth(str)) / 2), y + yy, shown, fg, KEEP, at);
    else s.text(x + 3, y + yy, shown, fg, KEEP, at);
  };
  line(2, greet, P.text, BOLD, 0, true);
  line(8, model, P.mute, 0, 0.3, true);
  line(9, cwd, P.mute, 0, 0.45, true);
  if (twoCol) {
    const rx = x + lw + 2, rw = w - lw - 4;
    const rl = (yy, str, fg, at, k) => {
      if (tx < k) return;
      const n = Math.round(strWidth(str) * clamp((tx - k) / 0.25));
      s.text(rx, y + yy, clipStr(clipStr(str, rw), n), fg, KEEP, at);
    };
    rl(1, 'Tips for getting started', P.clay, BOLD, 0.1);
    rl(2, 'Run /init to create a CLAUDE.md file with', P.text, 0, 0.15);
    rl(3, 'instructions for Claude', P.text, 0, 0.2);
    if (tx > 0.3) s.text(rx, y + 4, '─'.repeat(rw), border);
    rl(5, 'Recent activity', P.clay, BOLD, 0.35);
    recent.forEach((r, i) => rl(6 + i, r, P.mute, 0, 0.45 + i * 0.1));
  }
  return h;
}

// ---------------------------------------------------------------- transcript lines

const USER_BG = 0x232220;

export function userLines(text, w, { bg = USER_BG, fg = P.soft } = {}) {
  return wrap(text, w - 3).map((ln, i) => {
    const l = [[i === 0 ? '> ' : '  ', P.mute, bg], [ln + ' ', fg, bg]];
    l.fill = bg;
    return l;
  });
}

/** ⏺ + text; shown = characters visible so far (streaming). */
export function assistantLines(text, w, { shown = Infinity, dot = P.white, fg = P.text, at = 0 } = {}) {
  const visible = [...text].slice(0, shown).join('');
  const lines = wrap(visible, w - 2);
  return lines.map((ln, i) => [[i === 0 ? DOT + ' ' : '  ', dot], [ln, fg, KEEP, at]]);
}

/**
 * ⏺ Name(arg) with ⎿ output. state: 'run' | 'ok' | 'err' | 'wait'. out: array of strings or lines.
 */
export function toolLines(name, arg, w, { state = 'ok', out = [], t = 0, outFg = P.mute } = {}) {
  const dotFg = state === 'ok' ? P.ok : state === 'err' ? P.err
    : state === 'wait' ? P.mute : (Math.floor(t * 2.5) % 2 ? P.mute : P.dim);
  const head = [[DOT + ' ', dotFg], [name, P.text, KEEP, BOLD]];
  if (arg != null) head.push([`(${clipStr(arg, Math.max(4, w - strWidth(name) - 4))})`, P.text]);
  const lines = [head];
  out.forEach((o, i) => {
    const pre = i === 0 ? `  ${ELBOW}  ` : '     ';
    if (Array.isArray(o)) lines.push([[pre, P.mute], ...o]);
    else for (const [j, part] of wrap(o, w - 5).entries()) lines.push([[j === 0 ? pre : '     ', P.mute], [part, outFg]]);
  });
  return lines;
}

/** Todo list: items [{ text, state: 'todo' | 'doing' | 'done' }] */
export function todoLines(items, w, { title = 'Update Todos', state = 'ok' } = {}) {
  const lines = [[[DOT + ' ', state === 'ok' ? P.ok : P.mute], [title, P.text, KEEP, BOLD]]];
  items.forEach((it, i) => {
    const pre = i === 0 ? `  ${ELBOW}  ` : '     ';
    if (it.state === 'done') lines.push([[pre, P.mute], ['☒ ', P.mute], [clipStr(it.text, w - 8), P.mute, KEEP, STRIKE]]);
    else if (it.state === 'doing') lines.push([[pre, P.mute], ['☐ ', P.text], [clipStr(it.text, w - 8), P.text, KEEP, BOLD]]);
    else lines.push([[pre, P.mute], ['☐ ', P.mute], [clipStr(it.text, w - 8), P.soft]]);
  });
  return lines;
}

/** Edit/Write result: rows [{ n, op: '+' | '-' | ' ', text }] shown as Claude Code's coloured diff. */
export function diffLines(rows, w) {
  return rows.map((r) => {
    const bg = r.op === '+' ? P.diffAdd : r.op === '-' ? P.diffDel : KEEP;
    const num = String(r.n ?? '').padStart(4);
    const body = clipStr(`${r.op === ' ' ? ' ' : r.op} ${r.text}`, Math.max(1, w - 11));
    const padded = body + ' '.repeat(Math.max(0, w - 11 - strWidth(body)));
    return [['     ', P.mute], [num + ' ', P.dim, bg], [padded, r.op === ' ' ? P.soft : P.text, bg]];
  });
}

/** ∴ Thinking… with dim italic thought text. */
export function thinkLines(text, w, { shown = Infinity, label = 'Thinking…', done = false, secs = 0 } = {}) {
  const head = done ? [['∴ ', P.mute], [`Thought for ${secs}s`, P.mute, KEEP, ITALIC], [' (ctrl+o to show thinking)', P.dim]]
    : [['∴ ', P.mute], [label, P.mute, KEEP, ITALIC]];
  const visible = [...text].slice(0, shown).join('');
  const lines = [head];
  if (!done && visible) for (const ln of wrap(visible, w - 2)) lines.push([['  ', P.dim], [ln, P.mute, KEEP, ITALIC]]);
  return lines;
}

// ---------------------------------------------------------------- live chrome

/** ✻ Verb… (12s · ↓ 1.2k tokens · esc to interrupt) */
export function spinnerLine(s, x, y, w, { t, t0 = 0, verb = 'Clauding', tokens = 0, glyphFg = P.clay, extra } = {}) {
  const g = spinGlyph(t);
  s.text(x, y, g, glyphFg);
  let cx = shimmer(s, x + 2, y, `${verb}…`, P.clay, P.clayHi, t);
  const secs = Math.max(0, Math.floor(t - t0));
  const tok = tokens >= 1e12 ? `${(tokens / 1e12).toFixed(1)}T` : tokens >= 1e9 ? `${(tokens / 1e9).toFixed(1)}B`
    : tokens >= 1e6 ? `${(tokens / 1e6).toFixed(1)}M` : tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${Math.floor(tokens)}`;
  const tail = extra ?? ` (${secs}s · ↓ ${tok} tokens · esc to interrupt)`;
  s.text(cx, y, clipStr(tail, Math.max(0, x + w - cx)), P.mute);
}

/**
 * The prompt box: a rule, "> text", a rule. Returns rows used (3, more if the text wraps).
 * opts: text (typed so far), placeholder, cursor (bool), rainbow (letters coloured), t, ruleFg
 */
export function inputBox(s, x, y, w, { text = '', placeholder = '', cursor = true, t = 0, rainbow = false,
  ruleFg = P.line, promptFg = P.text, textFg = P.text } = {}) {
  s.text(x, y, '─'.repeat(w), ruleFg);
  const lines = text ? wrap(text, w - 4) : [''];
  lines.forEach((ln, i) => {
    const yy = y + 1 + i;
    s.text(x, yy, i === 0 ? '> ' : '  ', promptFg);
    if (rainbow) {
      let k = 0;
      let cx = x + 2;
      for (const ch of ln) { cx = s.text(cx, yy, ch, hsl(k * 0.09 - t * 0.6, 0.75, 0.68), KEEP, BOLD); k++; }
    } else s.text(x + 2, yy, ln, textFg);
  });
  const last = lines.length - 1;
  const cx = x + 2 + strWidth(lines[last]);
  if (!text && placeholder) s.text(x + 2, y + 1, clipStr(placeholder, w - 3), P.dim);
  if (cursor && Math.floor(t * 1.8) % 2 === 0) s.put(text ? cx : x + 2, y + 1 + last, 0x2588, P.text);
  else if (cursor && !text && placeholder) s.put(x + 2, y + 1, placeholder.codePointAt(0), P.bg, P.text);
  s.text(x, y + 2 + last, '─'.repeat(w), ruleFg);
  return 3 + last;
}

export const MODES = {
  default: null,
  accept: ['⏵⏵ accept edits on', P.accept],
  plan: ['⏸ plan mode on', P.plan],
  bypass: ['⏵⏵ bypass permissions on', P.err],
};

export function footer(s, x, y, w, { mode = 'default', left, right, rightFg = P.mute } = {}) {
  const m = MODES[mode];
  let end;
  if (left) end = s.text(x + 2, y, clipStr(left, w - 2), P.mute);
  else if (m) {
    const r = right ? strWidth(right) + 2 : 0;
    end = s.text(x + 2, y, m[0], m[1]);
    if (end + 21 + r <= x + w) end = s.text(end, y, ' (shift+tab to cycle)', P.mute);
  } else end = s.text(x + 2, y, '? for shortcuts', P.mute);
  if (right) {
    const r = clipStr(right, Math.max(0, x + w - end - 2));
    if (r) s.text(x + w - strWidth(r), y, r, rightFg);
  }
}

/**
 * A rounded dialog in place of the prompt (permission prompts, trust, questions, pickers).
 * spec: { title, titleFg, color, body: [line | string], options: [string | [label, hint]], sel, picked (bool),
 *         footer: string } . Returns rows used.
 */
export function dialog(s, x, y, w, spec, t = 0) {
  const { title, titleFg, color = P.perm, body = [], options = [], sel = 0, picked = false, foot } = spec;
  const rows = [];
  if (title) { for (const ln of wrap(title, w - 4)) rows.push([[ln, titleFg ?? color, KEEP, BOLD]]); rows.push([]); }
  for (const b of body) {
    if (typeof b === 'string') for (const ln of wrap(b, w - 4)) rows.push([[ln, P.text]]);
    else rows.push(b);
  }
  if (options.length) {
    if (body.length) rows.push([]);
    options.forEach((o, i) => {
      const [label, hint] = Array.isArray(o) ? o : [o, null];
      const on = i === sel;
      const flash = on && picked && Math.floor(t * 12) % 2 === 0;
      const fg = on ? (flash ? P.white : color) : P.text;
      const row = [[on ? `${CARET} ` : '  ', color], [`${i + 1}. ${label}`, fg, KEEP, on ? BOLD : 0]];
      if (hint) row.push(['  ' + hint, on ? P.soft : P.dim]);
      rows.push(row);
    });
  }
  if (foot) rows.push([], typeof foot === 'string' ? [[foot, P.dim]] : foot);
  if (spec.plain) {
    rows.forEach((r, i) => drawLine(s, x, y + i, r, w));
    return rows.length;
  }
  const h = rows.length + 2;
  s.fill(x, y, w, h, 32, -1, P.bg);
  s.text(x, y, '╭' + '─'.repeat(w - 2) + '╮', color);
  rows.forEach((r, i) => {
    s.text(x, y + 1 + i, '│', color);
    drawLine(s, x + 2, y + 1 + i, r, w - 4);
    s.text(x + w - 1, y + 1 + i, '│', color);
  });
  s.text(x, y + h - 1, '╰' + '─'.repeat(w - 2) + '╯', color);
  return h;
}

/** Height a dialog will take, without drawing. */
export function dialogHeight(spec, w) {
  let n = spec.title ? wrap(spec.title, w - 4).length + 1 : 0;
  for (const b of spec.body ?? []) n += typeof b === 'string' ? wrap(b, w - 4).length : 1;
  if (spec.options?.length) n += spec.options.length + (spec.body?.length ? 1 : 0);
  if (spec.foot) n += 2;
  return n + (spec.plain ? 0 : 2);
}

export function rainbowText(s, x, y, str, t, at = BOLD) {
  let k = 0;
  for (const ch of str) { x = s.text(x, y, ch, hsl(k * 0.09 - t * 0.6, 0.75, 0.68), KEEP, at); k++; }
  return x;
}

// ---------------------------------------------------------------- styled text

/** Styled characters [{ ch, fg, bg, at }] wrapped to width (CJK anywhere, latin at spaces) -> lines of spans. */
export function wrapStyled(chars, w) {
  const lines = [];
  let cur = [], cw = 0, lastSpace = -1;
  const push = () => { lines.push(cur); cur = []; cw = 0; lastSpace = -1; };
  for (const c of chars) {
    if (c.ch === '\n') { push(); continue; }
    const k = strWidth(c.ch);
    if (cw + k > w) {
      if (c.ch === ' ') { push(); continue; }
      if (lastSpace >= 0 && k === 1) {
        const rest = cur.slice(lastSpace + 1);
        cur = cur.slice(0, lastSpace);
        push();
        for (const r of rest) { cur.push(r); cw += strWidth(r.ch); }
      } else push();
    }
    if (c.ch === ' ') lastSpace = cur.length;
    cur.push(c); cw += k;
  }
  if (cur.length || !lines.length) lines.push(cur);
  return lines.map((l) => {
    const spans = [];
    for (const c of l) {
      const last = spans[spans.length - 1];
      if (last && last[1] === c.fg && last[2] === (c.bg ?? KEEP) && last[3] === (c.at ?? 0)) last[0] += c.ch;
      else spans.push([c.ch, c.fg, c.bg ?? KEEP, c.at ?? 0]);
    }
    return spans;
  });
}

/** Characters of a string in one style. */
export const chars = (str, fg, at = 0, bg = KEEP) => [...str].map((ch) => ({ ch, fg, at, bg }));

/** ⏺ + styled characters. */
export function assistantStyled(cs, w, { dot = P.white } = {}) {
  return wrapStyled(cs, w - 2).map((l, i) => [[i === 0 ? DOT + ' ' : '  ', dot], ...l]);
}

export { mix, DIM };
