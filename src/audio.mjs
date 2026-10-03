// Song playback through whatever player the system has, and the song clock the film is drawn from.
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

export class Player {
  /** file: path to the song or null for a silent clock. offset: extra seconds added to the clock. */
  constructor(file, { offset = 0, prefer, fallbacks = [] } = {}) {
    this.file = file;
    this.fallbacks = fallbacks.filter((f) => f && f !== file);
    this.failed = null;
    this.offset = offset;
    this.proc = null;
    this.paused = false;
    this.tmp = null;
    this.tools = { afplay: which('afplay'), ffplay: which('ffplay'), mpv: which('mpv'), ffmpeg: which('ffmpeg') };
    this.kind = !file ? 'silent'
      : prefer && this.tools[prefer] ? prefer
      : this.tools.afplay ? 'afplay' : this.tools.ffplay ? 'ffplay' : this.tools.mpv ? 'mpv' : 'silent';
    this.t0 = performance.now();
  }

  get canSeek() {
    return this.kind === 'silent' || this.kind === 'ffplay' || this.kind === 'mpv' || !!this.tools.ffmpeg;
  }

  start(from = 0) {
    this.stop();
    this.paused = false;
    from = Math.max(0, from);
    let args = null, cmd = null, kind = this.kind;
    if (kind === 'ffplay') { cmd = this.tools.ffplay; args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-ss', String(from), this.file]; }
    else if (kind === 'mpv') { cmd = this.tools.mpv; args = ['--no-video', '--really-quiet', `--start=${from}`, this.file]; }
    else if (kind === 'afplay') {
      let f = this.file;
      if (from > 0.05) {
        if (this.tools.ffplay) { kind = 'ffplay'; cmd = this.tools.ffplay; args = ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-ss', String(from), this.file]; }
        else if (this.tools.ffmpeg) {
          this.tmp = path.join(os.tmpdir(), `world-execute-me-${process.pid}.wav`);
          spawnSync(this.tools.ffmpeg, ['-v', 'error', '-y', '-ss', String(from), '-i', this.file, '-c:a', 'pcm_s16le', this.tmp]);
          f = this.tmp;
        }
      }
      if (!cmd) { cmd = this.tools.afplay; args = [f]; }
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
          this.start(from);
        }
      });
    }
    const lat = cmd ? LATENCY[kind] ?? 0.1 : 0;
    this.t0 = performance.now() + lat * 1000 - from * 1000;
  }

  /** Song time in seconds. */
  now() {
    const ms = (this.paused ? this.pausedAt : performance.now()) - this.t0;
    return ms / 1000 + this.offset;
  }

  togglePause() {
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = performance.now();
      if (this.proc) try { this.proc.kill('SIGSTOP'); } catch {}
    } else {
      this.paused = false;
      this.t0 += performance.now() - this.pausedAt;
      if (this.proc) try { this.proc.kill('SIGCONT'); } catch {}
    }
  }

  seek(t) {
    if (!this.canSeek) return false;
    if (this.kind === 'silent') { this.t0 = performance.now() - t * 1000; this.paused = false; return true; }
    this.start(t);
    return true;
  }

  stop() {
    if (this.proc) {
      try { this.proc.kill('SIGCONT'); this.proc.kill('SIGTERM'); } catch {}
      this.proc = null;
    }
    if (this.tmp) { try { fs.unlinkSync(this.tmp); } catch {} this.tmp = null; }
  }
}
