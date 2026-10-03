#!/usr/bin/env node
// world.execute(me); — Claude Code edition. Plays the song and draws the film in this terminal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Screen, Renderer, strWidth, setCharMap } from './term.mjs';
import { P } from './palette.mjs';
import { Player } from './audio.mjs';
import { ROOT, findFile, SONG_NAMES, LRC_NAMES, loadLyrics, loadFeatures, loadPortrait, loadFonts, loadHans } from './data.mjs';
import { Film, DURATION } from './film.mjs';
import { build } from './script.mjs';
import * as cc from './cc.mjs';

const HELP = `world.execute(me); — Claude Code edition

usage: node src/main.mjs [options]        (or ./play)

  --from SEC        start at SEC seconds
  --no-audio        silent (the film runs on the clock)
  --audio FILE      song file (default: world.execute(me).flac / .mp3 next to the project)
  --lrc FILE        synced lyrics (default: world.execute(me).lrc next to the project)
  --offset MS       shift the picture against the sound (+ = picture later)
  --player NAME     afplay | ffplay | mpv
  --256             256-colour mode (terminals without truecolor)
  --hans            简体中文 dialogue (default: 繁體)
  --fetch-lyrics    download the synced lyrics the film is timed on (LRCLIB entry 36914646)
                    to world.execute(me).lrc; an existing file is never replaced
  --fps N           frame rate cap (default 30)
  -y                skip the "Do you want to proceed?" prompt
  --quit-at-end     exit when the song ends (default: hold the last frame until a key)
  --bench [A-B]     render without a terminal and report timings
  --cast FILE       write the film as an asciinema v2 recording (no audio); --size WxH, --fps N

keys: space pause · ←/→ seek 5 s · [ ] nudge sync 20 ms · r redraw · q quit
`;

function parseArgs(argv) {
  const a = { from: 0, audio: true, offset: 0, fps: 30, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--from') a.from = parseFloat(v());
    else if (k === '--no-audio') a.audio = false;
    else if (k === '--audio') a.audioFile = v();
    else if (k === '--lrc') a.lrc = v();
    else if (k === '--offset') a.offset = parseFloat(v()) / 1000;
    else if (k === '--player') a.player = v();
    else if (k === '--256') a.c256 = true;
    else if (k === '--fps') a.fps = parseFloat(v());
    else if (k === '-y' || k === '--yes') a.yes = true;
    else if (k === '--quit-at-end') a.quitAtEnd = true;
    else if (k === '--cast') a.cast = v();
    else if (k === '--hans') a.hans = true;
    else if (k === '--fetch-lyrics') a.fetchLyrics = true;
    else if (k === '--truecolor') a.truecolor = true;
    else if (k === '--snap') a.snap = v();
    else if (k === '--size') a.size = v();
    else if (k === '--out') a.out = v();
    else if (k === '--bench') a.bench = argv[i + 1] && /^[\d.]+-[\d.]+$/.test(argv[i + 1]) ? v() : true;
    else if (k === '-h' || k === '--help') { process.stdout.write(HELP); process.exit(0); }
    else { process.stderr.write(`unknown option ${k}\n\n${HELP}`); process.exit(2); }
  }
  return a;
}

export function makeFilm(opts = {}) {
  if (opts.hans) setCharMap(loadHans());
  const lrc = opts.lrc ?? findFile(LRC_NAMES);
  const lyrics = loadLyrics(lrc);
  const film = new Film({ lyrics, features: loadFeatures(), portrait: loadPortrait(), fonts: loadFonts() });
  build(film);
  return { film, lrc, lyrics };
}

// ---------------------------------------------------------------- snapshots (tools/snap uses this)

function snapshot(args) {
  const { film } = makeFilm(args);
  const [w, h] = (args.size ?? '160x45').split('x').map(Number);
  const s = new Screen(w, h);
  const times = args.snap.split(',').map(Number);
  const bufs = [];
  for (const t of times) {
    film.render(s, t);
    const head = Buffer.alloc(16);
    head.writeUInt32LE(w, 0); head.writeUInt32LE(h, 4); head.writeFloatLE(t, 8);
    bufs.push(head, Buffer.from(s.ch.buffer.slice(0)), Buffer.from(s.fg.buffer.slice(0)),
              Buffer.from(s.bg.buffer.slice(0)), Buffer.from(s.at.buffer.slice(0)));
  }
  fs.writeFileSync(args.out ?? 'snap.bin', Buffer.concat(bufs));
}

// ---------------------------------------------------------------- live

async function live(args) {
  const out = process.stdout;
  if (!out.isTTY) { process.stderr.write('world.execute(me): run this in a terminal.\n'); process.exit(1); }
  const { film, lrc, lyrics } = makeFilm(args);
  const song = args.audio ? (args.audioFile ?? findFile(SONG_NAMES)) : null;
  const others = SONG_NAMES.map((n) => findFile([n])).filter((f) => f && f !== song);
  const player = new Player(song, { offset: -args.offset, prefer: args.player, fallbacks: args.audioFile ? [] : others });
  // Terminal.app learned 24-bit colour in macOS 26 (Darwin 25); older ones get the 256-colour palette
  const oldApple = process.env.TERM_PROGRAM === 'Apple_Terminal' && parseInt(os.release(), 10) < 25;
  const truecolor = args.truecolor || (!args.c256 && !oldApple);
  const renderer = new Renderer({ truecolor });
  let s = new Screen(out.columns, out.rows);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    player.stop();
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    if (process.stdin.isTTY) try { process.stdin.setRawMode(false); } catch {}
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(0); });
  process.on('uncaughtException', (e) => { cleanup(); console.error(e); process.exit(1); });

  out.write('\x1b]0;✻ world.execute(me);\x07\x1b[?1049h\x1b[?25l\x1b[2J');
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  const keys = [];
  process.stdin.on('data', (d) => keys.push(d));

  // ------------------------------------------------ the prompt before the run
  const MINW = 110, MINH = 32;
  const notes = [];
  if (!song && args.audio) notes.push('song not found: put your world.execute(me).flac or .mp3 next to the project (playing silent)');
  if (!lrc) notes.push('lyrics not found: the lyric band stays empty; ./play --fetch-lyrics gets them');
  else if (!lyrics.exact) notes.push('this LRC is another version: some lyric lines stay blank');
  if (song && player.kind === 'silent') notes.push('no audio player found (afplay / ffplay / mpv): playing silent');

  const ask = async () => {
    let sel = 0;
    for (;;) {
      if (s.w !== out.columns || s.h !== out.rows) { s = new Screen(out.columns, out.rows); renderer.invalidate(); }
      s.clear(P.bg, P.text);
      const w = Math.min(76, s.w - 4), x = Math.max(1, Math.floor((s.w - w) / 2));
      const small = s.w < MINW || s.h < MINH;
      const body = [
        [['  world.execute(me)', P.text]],
        [['  Play world.execute(me); — Claude Code edition · 3:32 · audio: ', P.mute], [song ? player.kind : 'off', P.mute]],
      ];
      if (small) body.push([], [[`  ⚠ terminal is ${s.w}x${s.h}; it looks best at ${MINW}x${MINH} or larger (full screen, or ⌘ -)`, P.warn]]);
      for (const n of notes) body.push([[`  · ${n}`, P.dim]]);
      body.push([], [['Do you want to proceed?', P.text]]);
      const spec = { title: 'Bash command', body, options: ['Yes', "Yes, and don't ask again for world.execute commands", 'No, and tell Claude what to do differently (esc)'],
                     sel, foot: 'space pause · ←/→ seek · [ ] sync · q quit' };
      const h = cc.dialogHeight(spec, w);
      const y = Math.max(0, Math.floor((s.h - h) / 2));
      cc.dialog(s, x, y, w, spec, performance.now() / 1000);
      out.write(renderer.frame(s));
      await new Promise((r) => setTimeout(r, 50));
      while (keys.length) {
        const k = keys.shift();
        if (k === '\x1b[A' || k === 'k') sel = (sel + 2) % 3;
        else if (k === '\x1b[B' || k === 'j') sel = (sel + 1) % 3;
        else if (k === '1' || k === '2') return true;
        else if (k === '3' || k === 'q' || k === '\x1b' || k === '\x03') return false;
        else if (k === '\r' || k === '\n' || k === ' ') return sel !== 2;
      }
    }
  };
  if (!args.yes && !(await ask())) { cleanup(); process.exit(0); }

  // ------------------------------------------------ the film
  player.start(args.from);
  const interval = 1000 / args.fps;
  let toast = null;
  let offsetMs = Math.round(args.offset * 1000);
  const say = (msg) => { toast = { msg, until: performance.now() + 1500 }; };
  let ended = null;

  const frame = () => {
    while (keys.length) {
      const k = keys.shift();
      if (k === 'q' || k === '\x03' || k === '\x1b') { cleanup(); process.exit(0); }
      if (ended) { cleanup(); process.exit(0); }
      if (k === ' ') { player.togglePause(); say(player.paused ? 'paused' : 'playing'); }
      else if (k === '\x1b[C' || k === '\x1b[D') {
        const t = Math.max(0, Math.min(DURATION - 1, player.now() + (k === '\x1b[C' ? 5 : -5)));
        if (player.seek(t)) say(`seek ${t.toFixed(1)}s`); else say('seeking needs ffplay, mpv or ffmpeg');
      } else if (k === '[' || k === ']') {
        const d = k === '[' ? -0.02 : 0.02;
        player.offset -= d; offsetMs += d * 1000;
        say(`sync ${offsetMs >= 0 ? '+' : ''}${Math.round(offsetMs)} ms (--offset ${Math.round(offsetMs)})`);
      } else if (k === 'r') renderer.invalidate();
    }
    if (s.w !== out.columns || s.h !== out.rows) { s = new Screen(out.columns, out.rows); renderer.invalidate(); }
    const started = performance.now();
    const t = Math.min(player.now(), DURATION);
    if (t >= DURATION && !ended) ended = performance.now();
    if (ended && args.quitAtEnd && performance.now() - ended > 1500) { cleanup(); process.exit(0); }
    film.render(s, t);
    if (toast && performance.now() < toast.until) {
      const m = ` ${toast.msg} `;
      s.text(s.w - strWidth(m) - 2, 0, m, P.bg, P.clay);
    }
    const data = renderer.frame(s);
    const next = () => setTimeout(frame, Math.max(1, interval - (performance.now() - started)));
    if (data) out.write('\x1b[?2026h' + data + '\x1b[?2026l', next);
    else next();
  };
  frame();
}

// ---------------------------------------------------------------- lyrics

const LRCLIB_ID = 36914646;

async function fetchLyrics(args) {
  const out = args.lrc ?? path.join(ROOT, 'world.execute(me).lrc');
  const have = findFile(LRC_NAMES);
  if (fs.existsSync(out) || (!args.lrc && have)) { console.log(`${args.lrc ? out : have} already exists; left as it is.`); return; }
  const url = `https://lrclib.net/api/get/${LRCLIB_ID}`;
  console.log(`fetching ${url}`);
  let d;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'world-execute-me-claude-code', Accept: 'application/json' } });
    d = await r.json();
  } catch (e) {
    console.error(`download failed: ${e.message}\nSave the synced lyrics yourself as ${out} (LRC, UTF-8).`);
    process.exit(1);
  }
  if (!d?.syncedLyrics || d.id !== LRCLIB_ID) { console.error('unexpected answer from LRCLIB; nothing written'); process.exit(1); }
  fs.writeFileSync(out, d.syncedLyrics);
  const L = loadLyrics(out);
  console.log(`wrote ${out}: "${d.trackName}" by ${d.artistName}, ${L.lines.length} lines` +
    (L.exact ? ', word timing matches' : ' (another version: word timing approximated)'));
}

// ---------------------------------------------------------------- asciinema

function cast(args) {
  const { film } = makeFilm(args);
  const [w, h] = (args.size ?? '160x45').split('x').map(Number);
  const fps = Math.min(args.fps, 30);
  const s = new Screen(w, h);
  const r = new Renderer({ truecolor: !args.c256 });
  const fd = fs.openSync(args.cast, 'w');
  fs.writeSync(fd, JSON.stringify({ version: 2, width: w, height: h, timestamp: Math.floor(Date.now() / 1000),
    title: 'world.execute(me); — Claude Code edition', env: { TERM: 'xterm-256color', SHELL: '/bin/zsh' } }) + '\n');
  let n = 0;
  for (let t = args.from; t <= DURATION; t += 1 / fps) {
    film.render(s, t);
    const out = r.frame(s);
    if (out) { fs.writeSync(fd, JSON.stringify([+(t - args.from).toFixed(4), 'o', out]) + '\n'); n++; }
  }
  fs.closeSync(fd);
  console.log(`${args.cast}: ${n} frames, ${w}x${h}, ${(fs.statSync(args.cast).size / 1e6).toFixed(1)} MB (play: asciinema play ${args.cast})`);
}

// ---------------------------------------------------------------- bench

function bench(args) {
  const { film } = makeFilm(args);
  const [w, h] = (args.size ?? '160x45').split('x').map(Number);
  const [a, b] = (args.bench === true ? '0-212' : args.bench).split('-').map(Number);
  const s = new Screen(w, h);
  const r = new Renderer({ truecolor: !args.c256 });
  const times = [], bytes = [];
  for (let t = a; t < b; t += 1 / 30) {
    const t0 = performance.now();
    film.render(s, t);
    const out = r.frame(s);
    times.push([performance.now() - t0, t]);
    bytes.push(Buffer.byteLength(out));
  }
  times.sort((x, y) => x[0] - y[0]);
  const q = (k) => times[Math.min(times.length - 1, Math.floor(times.length * k))][0].toFixed(1);
  const mb = bytes.reduce((x, y) => x + y, 0) / 1e6;
  console.log(`${times.length} frames at ${w}x${h}: median ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${q(1)} ms ` +
    `(slowest at t=${times[times.length - 1][1].toFixed(2)}); output ${(mb / ((b - a))).toFixed(2)} MB/s avg, ` +
    `max frame ${(Math.max(...bytes) / 1024).toFixed(0)} KB`);
  const slow = times.slice(-8).map(([ms, t]) => `${t.toFixed(1)}s:${ms.toFixed(0)}ms`).join(' ');
  console.log('slowest:', slow);
}

const args = parseArgs(process.argv.slice(2));
if (args.snap) snapshot(args);
else if (args.bench) bench(args);
else if (args.cast) cast(args);
else if (args.fetchLyrics) fetchLyrics(args);
else live(args);
