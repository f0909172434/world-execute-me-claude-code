// Song playback through whatever player the system has, and the song clock the film is drawn from.
//
// Pausing stops the player and resuming starts a new one at the paused position: a player frozen with SIGSTOP
// loses its audio device on macOS and stays silent after SIGCONT. afplay cannot start mid-file, so the song is
// decoded to PCM in the background once (ffmpeg, or macOS's own afconvert) and every later start plays a WAV
// that begins at the right sample.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
}

// seconds between spawning the player and the first sample reaching the speakers (rough, per player)
const LATENCY = { afplay: 0.06, ffplay: 0.16, mpv: 0.12 };
const SR = 48000, CH = 2;

/** PCM s16le from a WAV file's data chunk. */
function wavData(buf) {
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4);
    if (id === 'data') return buf.subarray(o + 8, Math.min(buf.length, o + 8 + n));
    o += 8 + n + (n & 1);
  }
  return null;
}

function wavHeader(bytes) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * 2, 28); h.writeUInt16LE(CH * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return h;
}

export class Player {
  /** file: path to the song or null for a silent clock. offset: extra seconds added to the clock. */
  constructor(file, { offset = 0, prefer, fallbacks = [] } = {}) {
    this.file = file;
    this.fallbacks = fallbacks.filter((f) => f && f !== file);
    this.failed = null;
    this.offset = offset;
    this.proc = null;
    this.paused = false;
    this.pos = 0;                 // player time (seconds, no offset) where a paused song resumes
    this.tmp = path.join(os.tmpdir(), `world-execute-me-${process.pid}.wav`);
    this.pcm = null;              // decoded song, s16le 48 kHz stereo
    this.decoding = null;
    this.tools = { afplay: which('afplay'), ffplay: which('ffplay'), mpv: which('mpv'), ffmpeg: which('ffmpeg'),
                   afconvert: which('afconvert') };
    this.kind = !file ? 'silent'
      : prefer && this.tools[prefer] ? prefer
      : this.tools.afplay ? 'afplay' : this.tools.ffplay ? 'ffplay' : this.tools.mpv ? 'mpv' : 'silent';
    this.t0 = performance.now();
    if (this.kind === 'afplay') this.decode();
  }

  get canSeek() {
    return this.kind !== 'afplay' || !!(this.pcm || this.tools.ffmpeg || this.tools.afconvert);
  }

  /** Decode the song once, in the background, so afplay can later start anywhere. */
  decode() {
    if (this.decoding || this.pcm || !this.file) return;
    const file = this.file;
    if (this.tools.ffmpeg) {
      const p = spawn(this.tools.ffmpeg, ['-v', 'error', '-i', file, '-f', 's16le', '-ac', String(CH), '-ar', String(SR), '-'],
        { stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks = [];
      p.stdout.on('data', (d) => chunks.push(d));
      p.on('error', () => { this.decoding = null; });
      p.on('close', (code) => { if (code === 0 && this.file === file) this.pcm = Buffer.concat(chunks); this.decoding = null; });
      this.decoding = p;
    } else if (this.tools.afconvert) {
      const full = this.tmp.replace(/\.wav$/, '-full.wav');
      const p = spawn(this.tools.afconvert, ['-f', 'WAVE', '-d', `LEI16@${SR}`, '-c', String(CH), file, full], { stdio: 'ignore' });
      p.on('error', () => { this.decoding = null; });
      p.on('close', (code) => {
        try { if (code === 0 && this.file === file) this.pcm = wavData(fs.readFileSync(full)); } catch {}
        try { fs.unlinkSync(full); } catch {}
        this.decoding = null;
      });
      this.decoding = p;
    }
  }

  /** A WAV of the song from `from` seconds, for afplay. Returns its path or null. */
  slice(from) {
    if (!this.pcm && this.tools.ffmpeg) {
      // not decoded yet: cut just this once
      const r = spawnSync(this.tools.ffmpeg, ['-v', 'error', '-y', '-ss', String(from), '-i', this.file,
        '-ac', String(CH), '-ar', String(SR), '-c:a', 'pcm_s16le', this.tmp]);
      return r.status === 0 ? this.tmp : null;
    }
    if (!this.pcm) return null;
    const start = Math.min(this.pcm.length, Math.round(from * SR) * CH * 2);
    const data = this.pcm.subarray(start);
    const fd = fs.openSync(this.tmp, 'w');
    fs.writeSync(fd, wavHeader(data.length));
    fs.writeSync(fd, data);
    fs.closeSync(fd);
    return this.tmp;
  }

  start(from = 0) {
    this.stop();
    this.paused = false;
    from = Math.max(0, from);
    let args = null, cmd = null;
    const kind = this.kind;
    if (kind === 'ffplay') { cmd = this.tools.ffplay; args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-ss', String(from), this.file]; }
    else if (kind === 'mpv') { cmd = this.tools.mpv; args = ['--no-video', '--really-quiet', `--start=${from}`, this.file]; }
    else if (kind === 'afplay') {
      const f = from > 0.02 ? this.slice(from) : this.file;
      if (f) { cmd = this.tools.afplay; args = [f]; }
    }
    if (cmd) {
      const proc = spawn(cmd, args, { stdio: 'ignore' });
      const startedAt = performance.now();
      this.proc = proc;
      proc.on('error', () => { if (this.proc === proc) this.proc = null; });
      proc.on('exit', (code) => {
        if (this.proc !== proc) return;
        this.proc = null;
        // the player gave up at once (e.g. it cannot decode this file): try the next copy of the song
        if (code && performance.now() - startedAt < 1500 && this.fallbacks.length) {
          this.failed = this.file;
          this.file = this.fallbacks.shift();
          this.pcm = null;
          if (this.kind === 'afplay') this.decode();
          this.start(from);
        }
      });
    }
    const lat = cmd ? LATENCY[kind] ?? 0.1 : 0;
    this.t0 = performance.now() + lat * 1000 - from * 1000;
  }

  /** Song time in seconds. */
  now() {
    if (this.paused) return this.pos + this.offset;
    return (performance.now() - this.t0) / 1000 + this.offset;
  }

  togglePause() {
    if (!this.paused) {
      this.pos = Math.max(0, (performance.now() - this.t0) / 1000);
      this.stop();
      this.paused = true;
    } else {
      this.start(this.pos);
    }
  }

  /** Jump to song time t (as now() reports it). */
  seek(t) {
    if (!this.canSeek) return false;
    const pos = Math.max(0, t - this.offset);
    if (this.paused) { this.pos = pos; return true; }
    if (this.kind === 'silent') { this.t0 = performance.now() - pos * 1000; return true; }
    this.start(pos);
    return true;
  }

  stop() {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch {}
      this.proc = null;
    }
  }

  /** Stop and remove temporary files (on exit). */
  close() {
    this.stop();
    if (this.decoding) try { this.decoding.kill(); } catch {}
    try { fs.unlinkSync(this.tmp); } catch {}
  }
}
