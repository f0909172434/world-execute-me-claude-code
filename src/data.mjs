// Loading: lyrics (your LRC + the baked word timing), audio features, the portrait, the big-type atlas.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Img, BigFont } from './gfx.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

export function findFile(names, dirs = [ROOT, process.cwd()]) {
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export const SONG_NAMES = ['world.execute(me).flac', 'world.execute(me);.flac', 'world.execute(me).mp3',
                           'world.execute(me);.mp3', 'song.flac', 'song.mp3'];
export const LRC_NAMES = ['world.execute(me).lrc', 'world.execute(me);.lrc', 'lyrics.lrc'];

// ---------------------------------------------------------------- lyrics

const TAG = /^\s*((?:\[\d+:\d+(?:[.:]\d+)?\]\s*)+)(.*)$/;
const TIME = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;

function parseLrc(text) {
  const rows = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = TAG.exec(line);
    if (!m) continue;
    for (const t of m[1].matchAll(TIME)) {
      const sec = +t[1] * 60 + +t[2] + (t[3] ? +('0.' + t[3]) : 0);
      rows.push({ t: sec, text: m[2].trim() });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

function applyPatch(text, ops) {
  let words = text.split(/\s+/).filter(Boolean);
  for (const op of ops) {
    if (op.op === 'reorder_words' && op.order.length === words.length) words = op.order.map((k) => words[k]);
  }
  return words.join(' ');
}

/**
 * Lines: [{ id, text, start, end, words: [{ text, start, end }] }] in song time of the local audio file.
 * Word timing comes from assets/timing.json; the text from your LRC. If the LRC is a different version the
 * words are spread evenly over each LRC line instead.
 */
export function loadLyrics(lrcPath) {
  const timing = JSON.parse(fs.readFileSync(path.join(ASSETS, 'timing.json'), 'utf8'));
  const off = timing.offset;
  const rows = lrcPath ? parseLrc(fs.readFileSync(lrcPath, 'utf8')) : [];
  const lines = [];
  let exact = rows.length > 0;
  for (const tl of timing.lines) {
    const row = rows[tl.id];
    let text = row?.text ?? '';
    if (timing.patches[tl.id]) text = applyPatch(text, timing.patches[tl.id]);
    const last = tl.words[tl.words.length - 1];
    if (!row || !text || last[1] > text.length) { exact = false; break; }
    lines.push({
      id: tl.id, text, start: tl.start + off, end: tl.end + off,
      words: tl.words.map(([s, e, ws, we]) => ({ text: text.slice(s, e), start: ws + off, end: we + off })),
    });
  }
  if (exact) return { lines, exact: true, bpm: timing.bpm, firstBeat: timing.first_beat + off };
  // Another version of the lyrics, or none: the timing still drives the whole film; words get their text from
  // your LRC line when its word count matches, otherwise the lyric band leaves them blank.
  const out = timing.lines.map((tl) => {
    const text = rows[tl.id]?.text ?? '';
    const ws = text.split(/\s+/).filter(Boolean);
    const fits = ws.length === tl.words.length;
    return {
      id: tl.id, text: fits ? text : '', start: tl.start + off, end: tl.end + off,
      words: tl.words.map(([, , a, b], i) => ({ text: fits ? ws[i] : '', start: a + off, end: b + off })),
    };
  });
  return { lines: out, exact: false, missing: rows.length === 0, bpm: timing.bpm, firstBeat: timing.first_beat + off };
}

// ---------------------------------------------------------------- features

export function loadFeatures() {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(ASSETS, 'features.bin.gz')));
  const fps = buf.readUInt32LE(0), n = buf.readUInt32LE(4), ch = buf.readUInt32LE(8);
  const data = buf.subarray(12);
  const get = (c, t) => {
    const f = t * fps;
    const i = Math.floor(f);
    if (i < 0 || i >= n - 1) return 0;
    const a = data[i * ch + c], b = data[(i + 1) * ch + c];
    return (a + (b - a) * (f - i)) / 255;
  };
  /** Peak of channel c over the last `win` seconds (punchier than the instantaneous value). */
  const peak = (c, t, win = 0.08) => {
    let m = 0;
    for (let k = 0; k < 6; k++) m = Math.max(m, get(c, t - win * k / 5));
    return m;
  };
  return {
    fps, n,
    loud: (t) => get(0, t),
    kick: (t) => peak(1, t),
    flux: (t) => peak(2, t),
    band: (t, b) => get(3 + b, t),
  };
}

// ---------------------------------------------------------------- portrait & font

export function loadPortrait() {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(ASSETS, 'claude.rgba.gz')));
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  return new Img(w, h, new Uint8Array(buf.buffer, buf.byteOffset + 8, w * h * 4));
}

export function loadFonts() {
  const atlas = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ASSETS, 'font.json.gz'))).toString('utf8'));
  const out = {};
  for (const [name, glyphs] of Object.entries(atlas.families)) out[name] = new BigFont({ height: atlas.height, glyphs });
  return out;
}

export function loadHans() {
  const p = path.join(ASSETS, 'hans.json');
  if (!fs.existsSync(p)) return new Map();
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Map(Object.entries(m).map(([a, b]) => [a.codePointAt(0), b.codePointAt(0)]));
}
