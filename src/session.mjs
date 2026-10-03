// The left pane: a Claude Code session written as a timeline. Blocks enter the transcript at their time and
// render as lines for the current t; the prompt box, spinner, dialogs and footer follow their own spans.
import { P } from './palette.mjs';
import { KEEP, strWidth, wrap } from './term.mjs';
import { clamp } from './gfx.mjs';
import * as cc from './cc.mjs';

const within = (t, a, b) => t >= a && t < b;

export class Session {
  constructor() {
    this.blocks = [];      // { t0, t1, render(t, w, ctx) -> lines, gap }
    this.typing = [];      // { a, b, text, rainbow } text typed into the prompt box
    this.spinners = [];    // { a, b, verb, tokens: [from, to] | fn }
    this.dialogs = [];     // { a, b, spec(t) }
    this.modes = [];       // [t, mode]
    this.rights = [];      // { a, b, text, fg }
    this.lefts = [];       // { a, b, text }
    this.clears = [];      // times the transcript is cleared
    this.placeholders = [[0, 'Try "create a world"']];
    this.hooks = { showInput: () => true, showFooter: () => true, swap: () => false, cursor: () => true, post: [] };
  }

  // ------------------------------------------------------------ building

  block(t0, render, { t1 = Infinity, gap = 1, onDraw } = {}) {
    const b = { t0, t1, render, gap, onDraw };
    this.blocks.push(b);
    this.last = b;
    return this;
  }

  lines(t0, lines, opts) { return this.block(t0, () => lines, opts); }

  /** You type `text` into the prompt (from `from`), it is sent at t. */
  user(t, text, { from, cps = 14, rainbow = false, jitter = 0.35, fg, forged = false, ...opts } = {}) {
    const n = [...text].length;
    const a = from ?? t - Math.min(2.2, n / cps + 0.15);
    if (a < t) this.typing.push({ a, b: t, text, rainbow, jitter, fg: forged ? P.clay : undefined });
    const b = this.block(t, (tt, w, ctx) => (ctx.swap ? cc.assistantLines(text, w, { fg: P.soft })
      : cc.userLines(text, w, forged ? { fg: P.clay } : fg ? { fg } : {})), opts);
    this.lastUser = this.last;
    return b;
  }

  /** The prompt shows fn(t) between a and b (hesitant typing, deleting, someone else typing). */
  typeFn(a, b, fn, { fg } = {}) { this.typing.push({ a, b, fn, fg }); return this; }

  /** ⏺ with styled characters from fn(t) -> [{ ch, fg, at }]. */
  styled(t, fn, { dot, ...opts } = {}) {
    return this.block(t, (tt, w) => {
      const cs = fn(tt);
      return cs && cs.length ? cc.assistantStyled(cs, w, { dot: typeof dot === 'function' ? dot(tt) : dot }) : null;
    }, opts);
  }

  /** ⏺ text streamed over dur seconds (or at cps characters per second). */
  say(t, text, { dur, cps = 24, fg, dot, ...opts } = {}) {
    const n = [...text].length;
    const d = dur ?? n / cps;
    return this.block(t, (tt, w, ctx) => {
      const shown = Math.ceil(n * clamp((tt - t) / Math.max(0.001, d)));
      return ctx.swap ? cc.userLines([...text].slice(0, shown).join(''), w)
        : cc.assistantLines(text, w, { shown, fg, dot });
    }, opts);
  }

  /** ⏺ Name(arg): runs from t, settles to `state` at `done`, output lines appear from `outAt`. */
  tool(t, name, arg, { done = t + 0.6, state = 'ok', out = [], outAt, outStep = 0.06, ...opts } = {}) {
    const oa = outAt ?? done;
    return this.block(t, (tt, w) => {
      const st = tt < done ? 'run' : typeof state === 'function' ? state(tt) : state;
      const o = typeof out === 'function' ? out(tt) : out;
      const k = tt < oa ? 0 : Math.min(o.length, 1 + Math.floor((tt - oa) / outStep));
      return cc.toolLines(name, arg, w, { state: st, out: o.slice(0, k), t: tt });
    }, opts);
  }

  /** Todo list; items: [{ text, done: time it is checked, doing: time it starts }] */
  todo(t, items, opts = {}) {
    return this.block(t, (tt, w) => cc.todoLines(items.map((it) => ({
      text: it.text,
      state: it.done != null && tt >= it.done ? 'done' : it.doing != null && tt >= it.doing ? 'doing' : 'todo',
    })), w), opts);
  }

  /** ⏺ Update(file) with a diff; rows appear one by one from t + 0.3. */
  edit(t, file, rows, { verb = 'Update', summary, step = 0.08, done = t + 0.4, ...opts } = {}) {
    return this.block(t, (tt, w) => {
      const adds = rows.filter((r) => r.op === '+').length, dels = rows.filter((r) => r.op === '-').length;
      const sum = summary ?? `Updated ${file} with ${adds} addition${adds === 1 ? '' : 's'}` +
        (dels ? ` and ${dels} removal${dels === 1 ? '' : 's'}` : '');
      const head = cc.toolLines(verb, file, w, { state: tt < done ? 'run' : 'ok', out: tt < done ? [] : [sum], t: tt });
      const k = Math.max(0, Math.floor((tt - done) / step) + 1);
      return tt < done ? head : head.concat(cc.diffLines(rows.slice(0, k), w));
    }, opts);
  }

  /** ∴ Thinking… text, then collapses to "Thought for Ns" at `done`. */
  think(t, text, { dur, cps = 16, done = Infinity, secs, ...opts } = {}) {
    const n = [...text].length;
    const d = dur ?? n / cps;
    return this.block(t, (tt, w) => {
      if (tt >= done) return cc.thinkLines('', w, { done: true, secs: secs ?? Math.max(1, Math.round(done - t)) });
      return cc.thinkLines(text, w, { shown: Math.ceil(n * clamp((tt - t) / d)) });
    }, opts);
  }

  spin(a, b, verb = 'Clauding', tokens = [0, 0]) { this.spinners.push({ a, b, verb, tokens }); return this; }
  dialog(a, b, spec) { this.dialogs.push({ a, b, spec }); return this; }
  mode(t, m) { this.modes.push([t, m]); this.modes.sort((x, y) => x[0] - y[0]); return this; }
  right(a, b, text, fg = P.mute) { this.rights.push({ a, b, text, fg }); return this; }
  left(a, b, text) { this.lefts.push({ a, b, text }); return this; }
  clear(t) { this.clears.push(t); this.clears.sort((x, y) => x - y); return this; }
  placeholder(t, text) { this.placeholders.push([t, text]); this.placeholders.sort((x, y) => x[0] - y[0]); return this; }

  // ------------------------------------------------------------ state at t

  modeAt(t) { let m = 'default'; for (const [tt, mm] of this.modes) if (tt <= t) m = mm; return m; }
  typingAt(t) {
    for (const ty of this.typing) {
      if (within(t, ty.a, ty.b)) {
        if (ty.fn) return { text: ty.fn(t), fg: ty.fg };
        const n = [...ty.text].length;
        // uneven human typing: a little ahead/behind a straight line
        const p = clamp((t - ty.a) / Math.max(0.001, ty.b - ty.a - 0.12));
        const wob = Math.sin(p * 9.3) * ty.jitter * 0.08;
        const k = Math.round(n * clamp(p + wob));
        return { text: [...ty.text].slice(0, k).join(''), rainbow: ty.rainbow, fg: ty.fg };
      }
    }
    return null;
  }
  spinnerAt(t) { return this.spinners.find((sp) => within(t, sp.a, sp.b)); }
  dialogAt(t) { return this.dialogs.find((d) => within(t, d.a, d.b)); }

  // ------------------------------------------------------------ drawing

  /** Draw the session for time t into the rect. Like Claude Code, content grows from the top and the prompt
   *  follows it; once the screen is full the prompt sits at the bottom and the transcript scrolls. */
  draw(s, x, y, w, h, t) {
    t = this.hooks.timewarp ? this.hooks.timewarp(t) : t;
    const ctx = { t, swap: this.hooks.swap(t) };
    s.pushClip(x, y, w, h);
    // transcript lines
    let since = -Infinity;
    for (const c of this.clears) if (c <= t) since = c;
    const lines = [];
    for (const b of this.blocks) {
      if (!(b.t0 <= t) || b.t0 < since || t >= b.t1) continue;
      const ls = b.render(t, w, ctx);
      if (!ls || !ls.length) continue;
      if (lines.length) for (let g = 0; g < b.gap; g++) lines.push(null);
      if (b.onDraw) lines.push({ mark: b });
      for (const l of ls) lines.push(l);
    }
    // what goes under it
    const showFooter = this.hooks.showFooter(t);
    const dlg = this.dialogAt(t);
    const spec = dlg ? (typeof dlg.spec === 'function' ? dlg.spec(t) : dlg.spec) : null;
    const ty = spec ? null : this.typingAt(t);
    const showInput = !spec && this.hooks.showInput(t);
    const promptH = spec ? cc.dialogHeight(spec, w) : showInput ? 2 + (ty ? wrap(ty.text || ' ', w - 4).length : 1) : 0;
    const sp = this.spinnerAt(t);
    const below = (lines.length ? 1 : 0) + (sp ? 2 : 0) + promptH + (showFooter ? 1 : 0);
    const room = Math.max(0, h - below);
    let yy = y;
    // hooks.scroll(t): 0 shows the newest lines, 1 scrolls back until the first line is at the top
    let end = lines.length, total = 0;
    for (const l of lines) if (!(l && l.mark)) total++;
    const back = this.hooks.scroll ? clamp(this.hooks.scroll(t)) : 0;
    const scroll = Math.round(back * Math.max(0, total - room));
    for (let n = 0; end > 0 && n < scroll;) { end--; if (!(lines[end] && lines[end].mark)) n++; }
    let realLines = 0;
    for (let i = 0; i < end; i++) if (!(lines[i] && lines[i].mark)) realLines++;
    let todo = Math.min(room, realLines), first = end;
    for (let i = end - 1, n = 0; i >= 0 && n < todo; i--) { first = i; if (!(lines[i] && lines[i].mark)) n++; }
    if (first > 0 && lines[first - 1] && lines[first - 1].mark) first--;
    for (let i = first; i < end; i++, yy++) {
      const l = lines[i];
      if (l && l.mark) { l.mark.onDraw(yy, x, t); yy--; continue; }
      if (!l) continue;
      if (typeof l === 'function') l(s, x, yy, w, t);
      else cc.drawLine(s, x, yy, l, w, l.fill ?? KEEP);
    }
    if (lines.length) yy++;
    yy = Math.min(yy, y + h - below + (lines.length ? 1 : 0));
    if (sp) {
      const tok = typeof sp.tokens === 'function' ? sp.tokens(t)
        : sp.tokens[0] + (sp.tokens[1] - sp.tokens[0]) * clamp((t - sp.a) / (sp.b - sp.a));
      const verb = typeof sp.verb === 'function' ? sp.verb(t) : sp.verb;
      cc.spinnerLine(s, x, yy, w, { t, t0: sp.a, verb, tokens: tok });
      yy += 2;
    }
    const promptTop = yy;
    if (spec) cc.dialog(s, x, yy, w, spec, t);
    else if (showInput) {
      let ph = '';
      for (const [tt, p] of this.placeholders) if (tt <= t) ph = p;
      cc.inputBox(s, x, yy, w, { text: ty?.text ?? '', placeholder: ty ? '' : ph, t, rainbow: ty?.rainbow,
        textFg: ty?.fg ?? P.text, cursor: this.hooks.cursor(t) });
    }
    yy += promptH;
    if (showFooter) {
      const r = this.rights.find((q) => within(t, q.a, q.b));
      const l = this.lefts.find((q) => within(t, q.a, q.b));
      const f = (v) => (typeof v === 'function' ? v(t) : v);
      cc.footer(s, x, yy, w, { mode: this.modeAt(t), right: f(r?.text), rightFg: f(r?.fg), left: f(l?.text) });
    }
    for (const fx of this.hooks.post) fx(s, x, y, w, h, t, { promptTop });
    s.popClip();
    return { promptTop };
  }
}

export { strWidth };
