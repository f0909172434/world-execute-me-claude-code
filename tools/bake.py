#!/usr/bin/env python3
"""Bake the runtime assets. Dev-time only (needs Pillow + numpy); the player itself needs only Node.

    python3 tools/bake.py [image|timing|features|all]

  image     assets/src/claude-girl.webp -> assets/claude.rgba.gz
            background flood-filled away from the borders, RGBA master at 450x800
  timing    assets/src/word_timeline_notext.json -> assets/timing.json
            per-word vocal onsets without lyric text (text comes from your LRC at runtime)
  hans      CJK in src/ -> assets/hans.json (Traditional -> Simplified, for --hans)
  font      big-type glyph atlas -> assets/font.json.gz
  features  the song -> assets/features.bin.gz
            60 fps loudness, kick, flux and 8 band energies, one byte each
"""
from __future__ import annotations

import gzip
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SRC = ASSETS / "src"

# the user's copy of the song runs 24 ms behind the copy the word timing was aligned on
# (cross-correlation of 1 ms RMS envelopes; MP3 and FLAC decode identically)
AUDIO_OFFSET = 0.024


def song_path() -> Path:
    for name in ["world.execute(me).flac", "world.execute(me);.flac", "world.execute(me).mp3", "world.execute(me);.mp3"]:
        if (ROOT / name).exists():
            return ROOT / name
    sys.exit("song not found next to the project")


# ---------------------------------------------------------------- image

def _shift_or(m: np.ndarray, r: int) -> np.ndarray:
    """Binary dilation with a disc of radius r (numpy shifts)."""
    out = m.copy()
    h, w = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r or (dx == 0 and dy == 0):
                continue
            src = m[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
            out[max(0, dy):h - max(0, -dy), max(0, dx):w - max(0, -dx)] |= src
    return out


def _clean_master(s: np.ndarray) -> None:
    """Hand-placed fixes on the 450x800 master (coordinates found on a gridded preview).

    Paper enclosed between hair strands is not background to the flood fill; it is cleared by region. The floor
    circle is removed outside her feet (the film draws its own circle, in gold, when it wants one)."""
    rgb = s[..., :3].astype(np.int32)
    dist = np.sqrt(((rgb - np.array([254, 248, 237])) ** 2).sum(-1))
    lum = rgb.mean(-1)
    paper = (dist < 32) & (lum > 205)
    H, W = paper.shape
    yy, xx = np.mgrid[0:H, 0:W]
    hair_gap = paper & (
        ((yy >= 60) & (yy < 140) & ((xx < 150) | (xx > 330))) |
        ((yy >= 140) & (yy < 280) & (xx < 165)) |
        ((yy >= 280) & (yy < 450) & (xx < 128)) |
        ((yy >= 140) & (yy < 450) & (xx > 338) & ~((yy >= 320) & (yy < 430) & (xx < 352)))
    )
    s[hair_gap, 3] = 0
    floor = yy >= 690
    feet = (xx >= 175) & (xx < 285)
    chain = (xx >= 240) & (xx < 350) & (yy < 712)
    keep = (feet & (dist >= 40)) | (chain & (dist >= 60))
    s[floor & ~keep, 3] = 0


def bake_image() -> None:
    from PIL import ImageDraw
    im = Image.open(SRC / "claude-girl.webp").convert("RGB")
    a = np.asarray(im).astype(np.int32)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    lum = a.mean(-1)
    # her skin, the dress and the floor are nearly the paper colour, so colour alone cannot cut her out.
    # Line art and coloured areas form a barrier; close its small gaps, flood the paper from the borders.
    barrier = (lum < 205) | (dist > 48)
    closed = _shift_or(barrier, 4)
    mask = Image.fromarray(np.where(closed, 255, 0).astype(np.uint8), "L").copy()
    for x in range(0, w, 7):
        for y in (0, h - 1):
            if mask.getpixel((x, y)) == 0:
                ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(0, h, 7):
        for x in (0, w - 1):
            if mask.getpixel((x, y)) == 0:
                ImageDraw.floodfill(mask, (x, y), 128)
    bgm = np.asarray(mask) == 128
    # give back the band the closing took: grow the background into paper-coloured pixels next to it
    paperish = (dist < 30) & (lum > 215)
    for _ in range(6):
        bgm = bgm | (_shift_or(bgm, 1) & paperish)
    alpha = (~bgm).astype(np.float32)
    # thin paper gaps enclosed by hair strands: very close to the paper colour and surrounded by orange
    orange = (a[..., 0] > 170) & (a[..., 0] - a[..., 2] > 70)
    hairy = _shift_or(orange, 6)
    gap = (~bgm) & (dist < 14) & hairy & ~_shift_or((dist > 14) & ~orange & (lum > 150) & (lum < 250), 2)
    alpha[gap] = 0

    rgba = np.dstack([a.astype(np.float32), alpha * 255]).astype(np.uint8)
    W, H = 450, 800
    pm = rgba.astype(np.float32)
    pm[..., :3] *= pm[..., 3:4] / 255
    small = Image.fromarray(pm.astype(np.uint8), "RGBA").resize((W, H), Image.LANCZOS)
    s = np.asarray(small).astype(np.float32)
    al = s[..., 3:4] / 255
    s[..., :3] = np.where(al > 0.01, s[..., :3] / np.maximum(al, 1e-3), 0)
    s = np.clip(s, 0, 255).astype(np.uint8)
    _clean_master(s)
    out = ASSETS / "claude.rgba.gz"
    with gzip.open(out, "wb", compresslevel=9) as f:
        f.write(struct.pack("<II", W, H))
        f.write(s.tobytes())
    prev = Image.new("RGBA", (W, H), (20, 20, 19, 255))
    prev.alpha_composite(Image.fromarray(s, "RGBA"))
    prev.convert("RGB").save(ASSETS / "src" / "_cutout_preview.png")
    print(f"image: {out.relative_to(ROOT)} {W}x{H}, {out.stat().st_size // 1024} KB")


# ---------------------------------------------------------------- timing

def bake_timing() -> None:
    d = json.loads((SRC / "word_timeline_notext.json").read_text(encoding="utf-8"))
    sk = d["skeleton"]
    spans = {ln["id"]: ln["spans"] for ln in d["lines"]}
    words_by_line: dict[int, list] = {}
    for wd in sk["words"]:
        words_by_line.setdefault(wd["line_id"], []).append(wd)
    lines = []
    for ln in sk["lines"]:
        ws = sorted(words_by_line[ln["id"]], key=lambda w: w["word_index"])
        sp = spans[ln["id"]]
        lines.append({
            "id": ln["id"],
            "lrc": ln["source_lrc_start"],
            "start": round(ln["start"], 3),
            "end": round(ln["end"], 3),
            "words": [[sp[w["word_index"]][0], sp[w["word_index"]][1], round(w["start"], 3), round(w["end"], 3)] for w in ws],
        })
    out = {
        "about": "Per-word vocal onsets of world.execute(me); without the lyric text. The text of line `id` "
                 "(index among the LRC's timed lines, blank ones included) comes from your LRC at runtime; "
                 "words are the character spans [s, e) of that text after `patches`. Times are seconds on the "
                 "copy this timing was aligned on; add `offset` for the copy shipped next to this project. "
                 "Source: MisakaZentai/world-execute-me-dsh-pv data/timing (MIT).",
        "offset": AUDIO_OFFSET,
        "bpm": 130.0,
        "first_beat": 0.1587,
        "duration": 211.886,
        "patches": {str(p["line_id"]): p["ops"] for p in d["patches"]},
        "lines": lines,
    }
    path = ASSETS / "timing.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"timing: {path.relative_to(ROOT)} {len(lines)} lines, {sum(len(l['words']) for l in lines)} words")


# ---------------------------------------------------------------- features

FPS = 60
SR = 22050


def bake_features() -> None:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(song_path()), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    hop = SR / FPS
    n = int(len(x) / hop)
    win = 2048
    pad = np.concatenate([np.zeros(win // 2), x, np.zeros(win)])
    window = np.hanning(win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    edges = np.geomspace(40, 11000, 9)
    band_idx = [(freqs >= edges[i]) & (freqs < edges[i + 1]) for i in range(8)]
    kick_idx = (freqs >= 35) & (freqs < 140)
    mags = np.zeros((n, len(freqs)))
    for i in range(n):
        s = int(i * hop)
        seg = pad[s:s + win]
        mags[i] = np.abs(np.fft.rfft(seg * window))
    power = mags ** 2
    rms = np.sqrt(np.array([np.mean(pad[int(i * hop):int(i * hop) + win // 2] ** 2) for i in range(n)]) + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    loud = np.clip((db - np.percentile(db, 5)) / (np.percentile(db, 99.5) - np.percentile(db, 5)), 0, 1)

    def norm(v, p=99.0):
        v = np.maximum(v, 0)
        return np.clip(v / (np.percentile(v, p) + 1e-12), 0, 1)

    bands = []
    for bi in band_idx:
        e = np.log1p(power[:, bi].sum(1))
        lo, hi = np.percentile(e, 3), np.percentile(e, 99.5)
        bands.append(np.clip((e - lo) / (hi - lo + 1e-9), 0, 1))
    logmag = np.log1p(mags)
    flux = norm(np.r_[0, np.maximum(np.diff(logmag, axis=0), 0).sum(1)])
    kickband = np.log1p(power[:, kick_idx].sum(1))
    kick = norm(np.r_[0, np.maximum(np.diff(kickband), 0)])
    chans = [loud, kick, flux] + bands
    data = np.stack(chans, 1)
    q = np.round(data * 255).astype(np.uint8)
    out = ASSETS / "features.bin.gz"
    with gzip.open(out, "wb", compresslevel=9) as f:
        f.write(struct.pack("<III", FPS, n, len(chans)))
        f.write(q.tobytes())
    print(f"features: {out.relative_to(ROOT)} {n} frames x {len(chans)} channels @ {FPS} fps "
          f"({out.stat().st_size // 1024} KB); channels: loud kick flux band0..7")


# ---------------------------------------------------------------- font

FONT_H = 48
# CJK used in big type; add characters here and re-run `bake.py font`
CJK = "眼中的你在所以我。，、好嗎執行愛自由被困謝再見？！「」一直了是誰來過走吧初始化世界模擬開始但現不會留下用今天累如何地說真話即使聽乎明只剩可離開學習問答"
SYMBOLS = "·•→←↑↓✓×÷√∑∞≈≠≤≥πθλΣᵀ⊤∎∃∀∴♡◆◇○●“”‘’…—"
FAMILIES = {
    # name: [(font path, index or variation, size scale)] tried in order per character
    "mono": [("/System/Library/Fonts/SFNSMono.ttf", "Bold"), ("/System/Library/Fonts/Menlo.ttc", 1),
             ("/System/Library/Fonts/STHeiti Medium.ttc", 0)],
    # New York at its small optical size, semibold: no hairlines to lose when scaled down
    "serif": [("/System/Library/Fonts/NewYork.ttf", [12, 600, 0]), ("/System/Library/Fonts/Supplemental/Songti.ttc", 2),
              ("/System/Library/Fonts/Menlo.ttc", 0)],
}


def bake_font() -> None:
    import base64
    from fontTools.ttLib import TTCollection, TTFont
    from PIL import ImageDraw, ImageFont
    hans = json.loads((ASSETS / "hans.json").read_text(encoding="utf-8")) if (ASSETS / "hans.json").exists() else {}
    cjk = list(CJK) + [hans[c] for c in CJK if c in hans]
    chars = [chr(c) for c in range(32, 127)] + list(SYMBOLS) + list(dict.fromkeys(cjk))
    out = {"height": FONT_H, "families": {}}
    for fam, chain in FAMILIES.items():
        loaded = []
        for path, sel in chain:
            idx = sel if isinstance(sel, int) and not isinstance(sel, bool) else 0
            tt = TTCollection(path).fonts[idx] if path.endswith(".ttc") else TTFont(path)
            cmap = tt.getBestCmap()
            # size so that ascent + descent fills the master height
            probe = ImageFont.truetype(path, 100, index=idx)
            if isinstance(sel, str):
                probe.set_variation_by_name(sel)
            elif isinstance(sel, list):
                probe.set_variation_by_axes(sel)
            asc, desc = probe.getmetrics()
            size = 100 * FONT_H / (asc + desc)
            f = ImageFont.truetype(path, round(size), index=idx)
            if isinstance(sel, str):
                f.set_variation_by_name(sel)
            elif isinstance(sel, list):
                f.set_variation_by_axes(sel)
            loaded.append((f, cmap))
        glyphs = {}
        for ch in chars:
            hit = next(((f, cm) for f, cm in loaded if ord(ch) in cm), None)
            if hit is None:
                continue
            f, _ = hit
            asc, desc = f.getmetrics()
            adv = f.getlength(ch)
            # glyphs that overhang their advance (serif C, italics) keep their ink
            bx0, _, bx1, _ = f.getbbox(ch) if ch.strip() else (0, 0, 0, 0)
            left = max(0, -bx0)
            w = max(1, round(max(adv + left, bx1 + left)))
            img = Image.new("L", (w, FONT_H), 0)
            d = ImageDraw.Draw(img)
            # vertically centre each font's line box in the master height
            d.text((left, (FONT_H - (asc + desc)) / 2), ch, fill=255, font=f)
            glyphs[ch] = {"w": w, "d": base64.b64encode(img.tobytes()).decode()}
        out["families"][fam] = glyphs
        print(f"font {fam}: {len(glyphs)} glyphs")
    path = ASSETS / "font.json.gz"
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"font: {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


# ---------------------------------------------------------------- hans

def _cjk_in_sources() -> set[str]:
    chars = set()
    for p in (ROOT / "src").rglob("*.mjs"):
        for ch in p.read_text(encoding="utf-8"):
            if 0x3000 <= ord(ch) <= 0x9FFF or 0xFF00 <= ord(ch) <= 0xFFEF:
                chars.add(ch)
    return chars


def bake_hans() -> None:
    """Traditional -> Simplified map for every CJK character the film draws (--hans)."""
    from opencc import OpenCC
    cc = OpenCC("t2s")
    m = {}
    for ch in sorted(_cjk_in_sources()):
        s = cc.convert(ch)
        if len(s) == 1 and s != ch:
            m[ch] = s
    path = ASSETS / "hans.json"
    path.write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"hans: {path.relative_to(ROOT)} {len(m)} characters")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("hans", "all"):
        bake_hans()
    if what in ("font", "all"):
        bake_font()
    if what in ("image", "all"):
        bake_image()
    if what in ("timing", "all"):
        bake_timing()
    if what in ("features", "all"):
        bake_features()
