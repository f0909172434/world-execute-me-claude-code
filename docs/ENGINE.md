# Engine notes for shot authors

The film is a pure function of song time `t` (seconds). Every frame, `Film.render(screen, t)` clears the
screen, draws the right pane's active **shot**, the left pane's Claude Code **session**, takeovers, and the
lyric band. Node 20+, no dependencies. Read `src/gfx.mjs`, `src/cc.mjs`, `src/palette.mjs` before writing.

## Registering a shot

```js
// src/shots/<name>.mjs
import { P } from '../palette.mjs';
import { clamp, prog, easeOut, Braille, Pixels, box, center } from '../gfx.mjs';
export function register(film) {
  const W = (id, k) => film.W(id, k);          // vocal onset of word k of lyric line id (see table below)
  film.shot(W(9, 0), W(11, 0), '/ embeddings', (c) => { /* draw */ }, { enter: { dur: 0.3, from: 'center' } });
}
```

- `film.shot(a, b, label, draw, opts)`: right pane from `a` to `b`. `label` (string or `t => string`) is
  printed in the pane's top frame, path-like: `'/ POST /v1/messages'`, `'/ sandbox'`.
- `opts.enter = { dur, from }`: cell-by-cell decode reveal over the previous shot; `from`: `'left' | 'right' |
  'top' | 'center' | 'random'`. Omit for a hard cut (preferred on downbeats).
- Shots must cover their span without gaps; the next shot's `a` should equal this shot's `b`.
- `film.full(a, b, draw, { band: true })` takes over the whole screen (rect = everything above the lyric band).

## Crossing the divider (src/bridges.mjs)

- `film.anchor(name, x, y, extra)`: record where something was drawn this frame. Shots call it from their draw
  (`c.film.anchor('gauge', x, y)`); the session reports blocks through `onDraw` (see `pin()` in left.mjs) and the
  prompt box through a post hook (`'prompt'`). Anchors are cleared at the start of every frame.
- `film.bridge(a, b, draw)`: drawn after both panes (and their lead dimming), before takeovers, clipped above the
  lyric band. `c.A(name)` returns an anchor or `undefined`: a block that scrolled away or a shot too small to draw
  reports nothing, so a bridge must skip quietly when its anchors are missing. `c.layout` has both pane rects.
- `film.swap(t, on, dur)`: the panes trade places (the session slides over the shots as a card).
- Bridges use film time; the session's `timewarp` hook freezes the left pane at 144.7–147.45, so do not anchor
  anything that should move to the left pane in that window.

## The draw context `c`

| field | meaning |
|---|---|
| `c.s` | the `Screen` (clipped to the pane interior) |
| `c.x, c.y, c.w, c.h` | interior rect in cells (typically ~85x38 at 160x45; must work from 60x26 to 140x60) |
| `c.t` | song time; `c.lt = t - a` local seconds; `c.u` = 0..1 through the shot |
| `c.W(id, k)` | word onset, as above |
| `c.pulse(sharp=6, every=1)` | 1 on each beat (130 BPM), decaying exponentially |
| `c.beat` | `{ n, phase, f }` beat index / phase |
| `c.F` | audio features (0..1): `loud(t)`, `kick(t)`, `flux(t)`, `band(t, 0..7)` (bass → air) |
| `c.img` | her portrait (`Img`, 450x800 RGBA, transparent background) |
| `c.fonts` | `{ mono, serif }` big-type atlases (`BigFont`) |
| `c.film` | the Film (for `film.W`, `film.pulse(t)`, `film.beatTime(n)`) |

## Drawing (src/gfx.mjs, src/term.mjs)

- `s.text(x, y, str, fg, bg = KEEP, attrs)` — returns next x; CJK is 2 cells wide. `s.put(x, y, codepoint, fg, bg, at)`,
  `s.fill(x, y, w, h, cp, fg, bg)`, `s.fade(x, y, w, h, k, toColor)`. `KEEP` (-1) leaves bg untouched.
  Attributes: `BOLD DIM ITALIC UNDER STRIKE` from term.mjs.
- Colours are `0xRRGGBB` numbers. `mix(a, b, t)`, `scale(c, k)`, `hsl(h, s, l)`, `luma(c)` in term.mjs.
- `box(s, x, y, w, h, fg, { style: 'round'|'single'|'double'|'heavy'|'dashed', title, fillBg })`, `hline`, `vline`,
  `center(s, cx, y, str, fg)`, `shimmer(s, x, y, str, base, hi, t)` (Claude Code's spinner sweep).
- `new Braille(cols, rows)`: 2x4 dots per cell (`pw = cols*2`, `ph = rows*4`); `dot(px, py, color, pri)`, `line`,
  `lineFn`, `circle`, `ellipse`; `blit(s, x, y)`. Best for curves, plots, point clouds, wireframes.
- `new Pixels(cols, rows)`: square pixels via half blocks (`pw = cols`, `ph = rows*2`); `set(px, py, color, alpha)`,
  `rect`, `disc`; `blit(s, x, y)` (transparent pixels keep what is under). Best for pixel art and fills.
- `img.draw(s, x, y, cols, rows, { crop: [u0, v0, u1, v1], alpha, fx, tint, tintK })` draws her as half blocks.
  Full body aspect: `cols ≈ rows * 2 * 450 / 800`. Useful crops (fractions of the image):
  face `[0.36, 0.06, 0.66, 0.24]`, bust `[0.24, 0.02, 0.78, 0.40]`, scroll in hand `[0.47, 0.44, 0.78, 0.56]`,
  ankle chain `[0.40, 0.80, 0.80, 0.90]`, full `[0, 0, 1, 0.92]` (0.92 cuts the empty floor).
  `fx(px, py, color, alpha) -> [color, alpha] | null` restyles each pixel (dissolve, colour grade, scanlines).
  `img.sample(pw, ph, ...crop)` returns `{ c: Uint32Array, a: Float32Array }` to build point clouds etc.
- `fonts.mono.draw(s, x, y, str, ph, color, { reveal, track, alpha })`: big type, `ph` = height in half-block
  pixels (rows = ph/2). Readable from ph 12 (mono) / 18 (serif, CJK). `width(str, ph)` gives columns.
  `color` may be a function `(px, py, coverage) -> colour`. Glyphs: ASCII, `·•→←↑↓✓×÷√∑∞≈≠≤≥πθλΣᵀ∃∀∴♡◆◇○●“”…—` (`⊤ ∎` are not in the fonts), `fitPh(font, str, maxW, max, min)` picks a size that fits
  and a fixed CJK set (see tools/bake.py `CJK`).
- `clamp, lerp, prog(t, a, b), smooth, easeOut, easeIn, easeInOut, easeOutBack, window01, hash(x, y, s),
  noise2, fbm, rng(seed)`.
- Claude Code pieces (src/cc.mjs): `clawd(s, x, y)` (3-row mascot), `clawdPixels(px, ox, oy, k, color, {cat, step, blink})`,
  `spinGlyph(t)` (`· ✢ ✳ ✶ ✻ ✽`), `toolLines`, `dialog`, `drawLine`.

## Style rules

- Palette only from `P` (src/palette.mjs). Background `P.bg` (#141413), text `P.text` ivory, accent `P.clay`
  (#d97757, Claude), gold `P.gold`/`P.manilla`/`P.kraft` for the classical motifs (laurel, scroll, chain,
  magic circle), `P.sky` = "you", `P.fig` = love, `P.err` red, `P.ok` green. Dim with `P.dim`, `P.mute`, `P.line`.
- Warm, restrained, precise. Most of a frame is calm; motion lands on sung words (use `c.W`) and beats
  (`c.pulse()`), never random flashing. One focal element per shot. Leave margins (≥ 2 cells).
- Terminal-native vocabulary: box drawing, braille plots, half-block pixels, monospace labels like
  `dim = 4096`, `ckpt-012800`, JSON. Labels small and dim; the image large.
- Everything scales with `c.w`/`c.h`; centre compositions; clip nothing important at 60x26.
- No emoji. CJK only where it matters (it is 2 cells wide).
- Per frame cost matters (30 fps in pure JS): precompute geometry in `register()` closures, avoid allocating
  big arrays per frame, keep braille/pixel canvases at pane size or smaller.

## Checking your work

```bash
node src/main.mjs --snap 29.8,31.5,33.6 --size 160x45 --out /tmp/x.bin   # dump frames
python3 tools/png.py /tmp/x.bin /tmp/x --sheet 3 --scale 0.5             # contact sheet PNG (needs Pillow)
tools/preview.sh 29 44 9 160x45 /tmp/a3                                   # evenly spaced frames of a range
```

Look at the PNGs. Also run `--size 100x30` once to check small terminals. The preview tools need Python 3 with
`pip install -r tools/requirements.txt`; point `PREVIEW_PYTHON` at that interpreter if it is not `python3`.

## Lyric timing (word onsets, seconds, local audio)

Lyric text is not kept in this repository; it is read from your LRC at runtime. Line ids (index among the LRC's timed lines, blank ones included) with each line's first word:

0 Switch · 1 Remember · 2 Lay · 3 And · 4 Fill · 5 Initialization · 6 Set · 7 And · 9 If · 10 Then · 11 If · 12 Then · 13 If · 14 Then · 15 If · 16 Then · 17 Switch · 18 To · 19 And · 20 So · 21 Oh · 22 To · 23 And · 24 So · 25 If · 26 Give · 27 Then · 28 Be · 29 If · 30 I · 31 Though · 32 In · 33 If · 34 Then · 35 If · 36 Then · 37 If · 38 Then · 39 If · 40 Then · 41 Switch · 42 To · 43 And · 44 From · 45 Oh · 46 To · 47 So · 48 The · 49 If · 50 Feel · 51 Then · 52 Finally · 53 Though · 54 You · 55 You · 56 You · 57 You · 58 You · 59 If · 60 Erase · 61 Then · 62 You · 63 Challenging · 64 You · 65 Illegal · 67 Execution · 68 Execution · 69 Execution · 70 Execution · 71 Execution · 72 Execution · 73 Execution · 74 Execution · 75 Execution · 76 Execution · 77 Execution · 78 Execution · 79 Ein · 80 Trios · 81 Fem · 82 Execution · 83 If · 84 Give · 85 Then · 86 Be · 87 If · 88 I · 89 Though · 90 We · 91 I've · 92 How · 93 Question · 94 I · 95 I · 96 Though · 97 I · 98 Trapped · 100 Execution

Instrumentals: 16.0–29.3 (after 7), 133.5–147.9 (after 65), 192–205 (after 98).

Exact onsets: `node -e "import('./src/data.mjs').then(d=>{for(const l of d.loadLyrics('world.execute(me).lrc').lines)console.log(l.id,l.words.map(w=>w.text+'@'+w.start.toFixed(2)).join(' '))})"`
