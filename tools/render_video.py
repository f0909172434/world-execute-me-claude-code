#!/usr/bin/env python3
"""Render the film to a video with the song: `node src/main.mjs --frames` -> rasterise cells -> ffmpeg.

    python3 tools/render_video.py OUT.mp4 [--size 160x45] [--cell 12x24] [--fps 30] [--audio FILE]
                                          [--from S] [--to S] [--hans] [--crf 16]

Every frame is a pure function of song time, so the picture lands on the music exactly (no screen recording).
The terminal look is drawn with macOS fonts (Menlo, with Apple Symbols / STIX / Heiti as fallbacks); block
elements, braille and the ⏺ dot are drawn as shapes. Dev-time only: needs Pillow, numpy, fontTools and ffmpeg.
"""
from __future__ import annotations

import argparse
import struct
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTCollection, TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CHAIN = [("/System/Library/Fonts/Menlo.ttc", 0), ("/System/Library/Fonts/Apple Symbols.ttf", 0),
         ("/System/Library/Fonts/Supplemental/STIXTwoMath.otf", 0), ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
         ("/System/Library/Fonts/Supplemental/Songti.ttc", 7)]
MENLO_STYLE = {0: 0, 1: 1, 4: 2, 5: 3}            # attrs bold/italic -> Menlo face index
QUAD = {0x2596: "0010", 0x2597: "0001", 0x2598: "1000", 0x2599: "1011", 0x259A: "1001", 0x259B: "1110",
        0x259C: "1101", 0x259D: "0100", 0x259E: "0110", 0x259F: "0111"}


def wide(cp: int) -> bool:
    return (0x1100 <= cp <= 0x115F or 0x2E80 <= cp <= 0x303E or 0x3041 <= cp <= 0x33FF or 0x3400 <= cp <= 0x4DBF
            or 0x4E00 <= cp <= 0x9FFF or 0xA000 <= cp <= 0xA4CF or 0xAC00 <= cp <= 0xD7A3 or 0xF900 <= cp <= 0xFAFF
            or 0xFE30 <= cp <= 0xFE4F or 0xFF00 <= cp <= 0xFF60 or 0xFFE0 <= cp <= 0xFFE6)


class Glyphs:
    """Coverage masks (float32, CH x CW*cells) per code point and style."""

    def __init__(self, cw: int, ch: int):
        self.cw, self.ch = cw, ch
        size = cw / 0.602
        self.menlo = {k: ImageFont.truetype(CHAIN[0][0], round(size), index=i) for k, i in MENLO_STYLE.items()}
        self.fonts = []
        for path, idx in CHAIN[1:]:
            f = ImageFont.truetype(path, round(size * (1.15 if "Heiti" in path or "Songti" in path else 1.0)), index=idx)
            tt = TTCollection(path).fonts[idx] if path.endswith(".ttc") else TTFont(path)
            self.fonts.append((f, set(tt.getBestCmap())))
        self.menlo_cmap = set(TTCollection(CHAIN[0][0]).fonts[0].getBestCmap())
        self.cache = {}

    def mask(self, cp: int, style: int, cells: int) -> np.ndarray:
        key = (cp, style, cells)
        m = self.cache.get(key)
        if m is None:
            m = self._make(cp, style, cells)
            self.cache[key] = m
        return m

    def _make(self, cp: int, style: int, cells: int) -> np.ndarray:
        cw, ch = self.cw, self.ch
        W = cw * cells
        a = np.zeros((ch, W), np.float32)
        h2, w2 = ch // 2, cw // 2
        if cp == 0x2580: a[:h2] = 1
        elif cp == 0x2584: a[h2:] = 1
        elif cp == 0x2588: a[:] = 1
        elif cp == 0x258C: a[:, :w2] = 1
        elif cp == 0x2590: a[:, w2:] = 1
        elif cp in QUAD:
            for k, (qx, qy) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
                if QUAD[cp][k] == "1":
                    a[qy * h2:(qy + 1) * h2 if qy == 0 else ch, qx * w2:(qx + 1) * w2 if qx == 0 else cw] = 1
        elif 0x2589 <= cp <= 0x258F:                    # left eighths ▉ … ▏
            a[:, :max(1, round(cw * (0x2590 - cp) / 8))] = 1
        elif 0x2581 <= cp <= 0x2587:                    # lower eighths ▁ … ▇
            a[ch - max(1, round(ch * (cp - 0x2580) / 8)):] = 1
        elif 0x1FB00 <= cp <= 0x1FB3B:                  # sextants: 2 x 3
            m = cp - 0x1FB00 + 1
            m += 1 if m >= 21 else 0
            m += 1 if m >= 42 else 0
            ys = [round(ch * k / 3) for k in range(4)]
            for k in range(6):
                if m & (1 << k):
                    qx, qy = k % 2, k // 2
                    a[ys[qy]:ys[qy + 1], (0 if qx == 0 else w2):(w2 if qx == 0 else cw)] = 1
        elif cp in (0x2591, 0x2592, 0x2593):
            a[:] = {0x2591: 0.25, 0x2592: 0.5, 0x2593: 0.75}[cp]
        elif 0x2800 <= cp <= 0x28FF:
            img = Image.new("L", (W, ch), 0)
            d = ImageDraw.Draw(img)
            r = max(1.0, cw / 6.5)
            for k, (bx, by) in enumerate([(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (0, 3), (1, 3)]):
                if (cp - 0x2800) & (1 << k):
                    cx, cy = (bx * 2 + 1) * cw / 4, (by * 2 + 1) * ch / 8
                    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
            a = np.asarray(img, np.float32) / 255
        elif cp == 0x23FA:                              # ⏺ the way Claude Code's dot sits in the line
            img = Image.new("L", (W, ch), 0)
            r = cw * 0.34
            ImageDraw.Draw(img).ellipse([cw / 2 - r, ch / 2 - r, cw / 2 + r, ch / 2 + r], fill=255)
            a = np.asarray(img, np.float32) / 255
        else:
            if cp in self.menlo_cmap:
                f = self.menlo[style & 5]
            else:
                f = next((f for f, cm in self.fonts if cp in cm), self.menlo[0])
            img = Image.new("L", (W, ch), 0)
            d = ImageDraw.Draw(img)
            asc, desc = f.getmetrics()
            x = 0
            if cells == 1:
                adv = f.getlength(chr(cp))
                x = (W - adv) / 2 if adv > 0 else 0
            d.text((x, (ch - asc - desc) / 2), chr(cp), fill=255, font=f)
            a = np.asarray(img, np.float32) / 255
        return a


def rgb(c: np.ndarray) -> np.ndarray:
    return np.stack([(c >> 16) & 255, (c >> 8) & 255, c & 255], -1).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--size", default="160x45")
    ap.add_argument("--cell", default="12x24")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--audio", default=None)
    ap.add_argument("--from", dest="start", type=float, default=0)
    ap.add_argument("--to", type=float, default=214.5)
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--hans", action="store_true")
    a = ap.parse_args()
    cw, chh = map(int, a.cell.split("x"))
    audio = a.audio
    if audio is None:
        for name in ["world.execute(me).flac", "world.execute(me);.flac", "world.execute(me).mp3", "world.execute(me);.mp3"]:
            if (ROOT / name).exists():
                audio = str(ROOT / name)
                break
    node = ["node", str(ROOT / "src/main.mjs"), "--frames", "--size", a.size, "--fps", str(a.fps),
            "--from", str(a.start), "--to", str(a.to)] + (["--hans"] if a.hans else [])
    src = subprocess.Popen(node, stdout=subprocess.PIPE, bufsize=1 << 20)
    w, h, n = struct.unpack("<III", src.stdout.read(12))
    W, H = w * cw, h * chh
    dur = n / a.fps
    ff = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(a.fps), "-i", "-"]
    if audio:
        ff += ["-ss", str(a.start), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k", "-af", "apad"]
    ff += ["-c:v", "libx264", "-preset", "medium", "-tune", "animation", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
           "-t", f"{dur:.3f}", "-movflags", "+faststart", a.out]
    enc = subprocess.Popen(ff, stdin=subprocess.PIPE)
    G = Glyphs(cw, chh)
    tiles = {}
    cells = w * h
    t0 = time.time()
    for i in range(n):
        buf = src.stdout.read(cells * 13)
        if len(buf) < cells * 13:
            break
        ch = np.frombuffer(buf, np.uint32, cells, 0).reshape(h, w)
        fg = np.frombuffer(buf, np.uint32, cells, cells * 4).reshape(h, w)
        bg = np.frombuffer(buf, np.uint32, cells, cells * 8).reshape(h, w)
        at = np.frombuffer(buf, np.uint8, cells, cells * 12).reshape(h, w)
        frame = np.repeat(np.repeat(rgb(bg), chh, 0), cw, 1)
        ys, xs = np.nonzero((ch != 32) & (ch != 0))
        for y, x in zip(ys.tolist(), xs.tolist()):
            cp = int(ch[y, x])
            k = 2 if (wide(cp) and x + 1 < w and ch[y, x + 1] == 0) else 1
            key = (cp, int(fg[y, x]), int(bg[y, x]), int(at[y, x]), k)
            tile = tiles.get(key)
            if tile is None:
                f, b, s = key[1], key[2], key[3]
                if s & 32:
                    f, b = b, f
                fc = np.array([(f >> 16) & 255, (f >> 8) & 255, f & 255], np.float32)
                bc = np.array([(b >> 16) & 255, (b >> 8) & 255, b & 255], np.float32)
                if s & 2:
                    fc = fc * 0.55 + bc * 0.45
                m = G.mask(cp, s & 5, k)[..., None]
                t = bc * (1 - m) + fc * m
                if s & 8:
                    t[chh - 2] = fc
                if s & 16:
                    t[chh // 2] = fc
                tile = t.astype(np.uint8)
                if len(tiles) > 300000:
                    tiles.clear()
                tiles[key] = tile
            frame[y * chh:(y + 1) * chh, x * cw:x * cw + tile.shape[1]] = tile
        enc.stdin.write(frame.tobytes())
        if i % 300 == 0:
            el = time.time() - t0
            print(f"\r{i}/{n} frames  {el:.0f}s  ~{el / max(1, i) * (n - i):.0f}s left   ", end="", file=sys.stderr)
    enc.stdin.close()
    enc.wait()
    src.wait()
    print(f"\n{a.out}: {n} frames, {W}x{H} @ {a.fps:g} fps, {time.time() - t0:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
