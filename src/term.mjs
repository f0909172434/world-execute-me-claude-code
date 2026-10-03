// Cell screen and diff renderer. A frame is drawn into a Screen (one code point, fg, bg and attribute byte per
// cell); Renderer.frame() turns it into the escape sequences that change the terminal from the previous frame.

export const BOLD = 1, DIM = 2, ITALIC = 4, UNDER = 8, STRIKE = 16, INV = 32;
export const KEEP = -1;          // bg value meaning "leave the cell's background alone"
const CONT = 0;                  // code point stored in the right half of a wide character

// ---------------------------------------------------------------- colour

export const rgb = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export const hex = (s) => parseInt(s.replace('#', ''), 16);
export const R = (c) => (c >> 16) & 255, G = (c) => (c >> 8) & 255, B = (c) => c & 255;

export function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (((ar + (((b >> 16) & 255) - ar) * t) | 0) << 16) |
         (((ag + (((b >> 8) & 255) - ag) * t) | 0) << 8) |
         ((ab + ((b & 255) - ab) * t) | 0);
}
export function scale(c, k) {
  const f = (v) => Math.max(0, Math.min(255, (v * k) | 0));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}
export function add(a, b, k = 1) {
  const f = (x, y) => Math.min(255, x + ((y * k) | 0));
  return (f((a >> 16) & 255, (b >> 16) & 255) << 16) | (f((a >> 8) & 255, (b >> 8) & 255) << 8) | f(a & 255, b & 255);
}
export function luma(c) { return (0.2126 * R(c) + 0.7152 * G(c) + 0.0722 * B(c)) / 255; }
export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return rgb(f(h + 1 / 3), f(h), f(h - 1 / 3));
}

// ---------------------------------------------------------------- width

export function wcwidth(cp) {
  if (cp < 0x300) return 1;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f || cp === 0xfe0e) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}
export function strWidth(s) {
  let w = 0;
  for (const ch of s) w += wcwidth(ch.codePointAt(0));
  return w;
}
/** Cut s to at most `cols` columns. */
export function clipStr(s, cols) {
  let w = 0, out = '';
  for (const ch of s) {
    const cw = wcwidth(ch.codePointAt(0));
    if (w + cw > cols) break;
    w += cw; out += ch;
  }
  return out;
}
/** Word-wrap to `cols` columns; CJK breaks anywhere, latin at spaces. */
export function wrap(s, cols) {
  const out = [];
  for (const para of s.split('\n')) {
    let line = '', w = 0, lastSpace = -1, lastSpaceW = 0;
    for (const ch of para) {
      const cw = wcwidth(ch.codePointAt(0));
      if (w + cw > cols) {
        if (ch === ' ') { out.push(line); line = ''; w = 0; lastSpace = -1; continue; }
        if (lastSpace >= 0 && cw === 1) {
          out.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1); w = w - lastSpaceW - 1;
        } else { out.push(line); line = ''; w = 0; }
        lastSpace = -1;
      }
      if (ch === ' ') { lastSpace = line.length; lastSpaceW = w; }
      line += ch; w += cw;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- script

// Optional character map applied to everything drawn (--hans: Traditional -> Simplified).
let CHARMAP = null;
export function setCharMap(m) { CHARMAP = m && m.size ? m : null; }
export const mapCp = (cp) => (CHARMAP ? CHARMAP.get(cp) ?? cp : cp);
export const mapChar = (ch) => (CHARMAP ? String.fromCodePoint(mapCp(ch.codePointAt(0))) : ch);

// ---------------------------------------------------------------- screen

export class Screen {
  constructor(w, h) { this.resize(w, h); }

  resize(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ch = new Uint32Array(n).fill(32);
    this.fg = new Uint32Array(n);
    this.bg = new Uint32Array(n);
    this.at = new Uint8Array(n);
    this.clips = [];
    this.cx0 = 0; this.cy0 = 0; this.cx1 = w; this.cy1 = h;
  }

  /** Restrict drawing to a rect (intersected with the current clip) until popClip(). */
  pushClip(x, y, w, h) {
    this.clips.push([this.cx0, this.cy0, this.cx1, this.cy1]);
    this.cx0 = Math.max(this.cx0, x | 0); this.cy0 = Math.max(this.cy0, y | 0);
    this.cx1 = Math.min(this.cx1, (x + w) | 0); this.cy1 = Math.min(this.cy1, (y + h) | 0);
  }
  popClip() { [this.cx0, this.cy0, this.cx1, this.cy1] = this.clips.pop(); }

  clear(bg, fg = 0xffffff) {
    this.ch.fill(32); this.fg.fill(fg); this.bg.fill(bg); this.at.fill(0);
  }

  in(x, y) { return x >= this.cx0 && x < this.cx1 && y >= this.cy0 && y < this.cy1; }

  _break(i, x) {
    // keep wide characters whole: overwriting either half blanks the other
    if (this.ch[i] === CONT && x > 0) this.ch[i - 1] = 32;
    else if (x + 1 < this.w && this.ch[i + 1] === CONT) this.ch[i + 1] = 32;
  }

  /** One narrow cell. fg < 0 keeps the cell's fg; bg < 0 keeps its bg. */
  put(x, y, cp, fg, bg = KEEP, at = 0) {
    x |= 0; y |= 0;
    if (x < this.cx0 || x >= this.cx1 || y < this.cy0 || y >= this.cy1) return;
    const i = y * this.w + x;
    this._break(i, x);
    this.ch[i] = cp;
    if (fg >= 0) this.fg[i] = fg;
    if (bg >= 0) this.bg[i] = bg;
    this.at[i] = at;
  }

  setBg(x, y, bg) {
    x |= 0; y |= 0;
    if (x < this.cx0 || x >= this.cx1 || y < this.cy0 || y >= this.cy1) return;
    this.bg[y * this.w + x] = bg;
  }

  /** Text from (x, y); returns the column after it. Wide characters that do not fit are dropped. */
  text(x, y, s, fg, bg = KEEP, at = 0) {
    x |= 0; y |= 0;
    if (y < this.cy0 || y >= this.cy1) return x + strWidth(s);
    for (const chr of s) {
      const cp = CHARMAP ? mapCp(chr.codePointAt(0)) : chr.codePointAt(0);
      const cw = wcwidth(cp);
      if (cw === 0) continue;
      if (cw === 2) {
        if (x >= this.cx0 && x + 1 < this.cx1) {
          const i = y * this.w + x;
          this._break(i, x); this._break(i + 1, x + 1);
          this.ch[i] = cp; this.ch[i + 1] = CONT;
          if (fg >= 0) { this.fg[i] = fg; this.fg[i + 1] = fg; }
          if (bg >= 0) { this.bg[i] = bg; this.bg[i + 1] = bg; }
          this.at[i] = at; this.at[i + 1] = at;
        } else if (x >= this.cx0 && x < this.cx1) {
          this.put(x, y, 32, fg, bg, at);
        }
        x += 2;
      } else {
        this.put(x, y, cp, fg, bg, at);
        x += 1;
      }
    }
    return x;
  }

  fill(x, y, w, h, cp, fg, bg, at = 0) {
    const x0 = Math.max(this.cx0, x | 0), y0 = Math.max(this.cy0, y | 0);
    const x1 = Math.min(this.cx1, (x + w) | 0), y1 = Math.min(this.cy1, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = yy * this.w + xx;
        this._break(i, xx);
        this.ch[i] = cp;
        if (fg >= 0) this.fg[i] = fg;
        if (bg >= 0) this.bg[i] = bg;
        this.at[i] = at;
      }
    }
  }

  /** Fade a rect towards `to` (k = 1 unchanged, 0 = all `to`). */
  fade(x, y, w, h, k, to) {
    if (k >= 1) return;
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    const t = 1 - k;
    for (let yy = y0; yy < y1; yy++) {
      for (let i = yy * this.w + x0, e = yy * this.w + x1; i < e; i++) {
        this.fg[i] = mix(this.fg[i], to, t);
        this.bg[i] = mix(this.bg[i], to, t);
      }
    }
  }

  /** Copy a rect of another screen (same size) onto this one. */
  blit(src, x, y, w, h) {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (let yy = y0; yy < y1; yy++) {
      const a = yy * this.w + x0, b = yy * this.w + x1;
      this.ch.set(src.ch.subarray(a, b), a);
      this.fg.set(src.fg.subarray(a, b), a);
      this.bg.set(src.bg.subarray(a, b), a);
      this.at.set(src.at.subarray(a, b), a);
      if (x0 > 0 && this.ch[a] === CONT) this.ch[a] = 32;
      if (x1 < this.w && this.ch[b] === CONT) this.ch[b] = 32;
    }
  }

  copyCell(src, i, j = i) {
    this.ch[j] = src.ch[i]; this.fg[j] = src.fg[i]; this.bg[j] = src.bg[i]; this.at[j] = src.at[i];
  }

  /** Repair wide characters whose halves were separated by per-cell effects. */
  fixWide() {
    const { ch, w } = this;
    for (let i = 0, n = ch.length; i < n; i++) {
      if (ch[i] === CONT) {
        if (i % w === 0 || wcwidth(ch[i - 1]) !== 2) ch[i] = 32;
      } else if (ch[i] > 0x10ff && wcwidth(ch[i]) === 2 && (i % w === w - 1 || ch[i + 1] !== CONT)) {
        ch[i] = 32;
      }
    }
  }
}

// ---------------------------------------------------------------- renderer

const CUBE = [0, 95, 135, 175, 215, 255];
function to256(c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : ((v - 35) / 40) | 0);
  const ri = q(r), gi = q(g), bi = q(b);
  const cr = CUBE[ri], cg = CUBE[gi], cb = CUBE[bi];
  const avg = (r + g + b) / 3;
  const gi2 = avg > 238 ? 23 : Math.max(0, Math.round((avg - 8) / 10));
  const gv = 8 + gi2 * 10;
  const dc = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
  const dg = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return dg < dc ? 232 + gi2 : 16 + 36 * ri + 6 * gi + bi;
}

export class Renderer {
  constructor({ truecolor = true } = {}) {
    this.truecolor = truecolor;
    this.prev = null;
    this.cache256 = new Map();
  }

  invalidate() { this.prev = null; }

  _fg(c) {
    if (this.truecolor) return `38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
    let v = this.cache256.get(c);
    if (v === undefined) { v = to256(c); this.cache256.set(c, v); }
    return `38;5;${v}`;
  }
  _bg(c) {
    if (this.truecolor) return `48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
    let v = this.cache256.get(c);
    if (v === undefined) { v = to256(c); this.cache256.set(c, v); }
    return `48;5;${v}`;
  }

  /** Escape sequences turning the last frame into this one ('' if nothing changed). */
  frame(scr) {
    const { w, h, ch, fg, bg, at } = scr;
    let p = this.prev;
    const full = !p || p.w !== w || p.h !== h;
    if (full) {
      p = this.prev = { w, h, ch: new Uint32Array(w * h).fill(0xffffffff), fg: new Uint32Array(w * h),
                        bg: new Uint32Array(w * h), at: new Uint8Array(w * h) };
    }
    let out = full ? '\x1b[0m\x1b[2J' : '';
    let penFg = -1, penBg = -1, penAt = -1;
    let cx = -1, cy = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const c = ch[i];
        if (c === CONT) continue;
        const wide = x + 1 < w && ch[i + 1] === CONT;
        let same = c === p.ch[i] && fg[i] === p.fg[i] && bg[i] === p.bg[i] && at[i] === p.at[i];
        if (same && wide) same = p.ch[i + 1] === CONT && bg[i + 1] === p.bg[i + 1];
        if (same) continue;
        if (cy !== y) { out += `\x1b[${y + 1};${x + 1}H`; }
        else if (cx !== x) { out += x > cx && x - cx < 5 ? `\x1b[${x - cx}C` : `\x1b[${y + 1};${x + 1}H`; }
        const a = at[i], f = fg[i], b = bg[i];
        if (a !== penAt) {
          let s = '0';
          if (a & BOLD) s += ';1';
          if (a & DIM) s += ';2';
          if (a & ITALIC) s += ';3';
          if (a & UNDER) s += ';4';
          if (a & INV) s += ';7';
          if (a & STRIKE) s += ';9';
          out += `\x1b[${s};${this._fg(f)};${this._bg(b)}m`;
          penAt = a; penFg = f; penBg = b;
        } else if (f !== penFg || b !== penBg) {
          if (f !== penFg && b !== penBg) out += `\x1b[${this._fg(f)};${this._bg(b)}m`;
          else if (f !== penFg) out += `\x1b[${this._fg(f)}m`;
          else out += `\x1b[${this._bg(b)}m`;
          penFg = f; penBg = b;
        }
        out += c < 32 ? ' ' : String.fromCodePoint(c);
        p.ch[i] = c; p.fg[i] = f; p.bg[i] = b; p.at[i] = a;
        if (wide) {
          p.ch[i + 1] = CONT; p.fg[i + 1] = f; p.bg[i + 1] = bg[i + 1]; p.at[i + 1] = a;
          cx = x + 2; x++;
        } else cx = x + 1;
        cy = y;
      }
    }
    return out;
  }
}
