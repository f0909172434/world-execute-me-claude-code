#!/usr/bin/env python3
"""Rasterise frames dumped by `node src/main.mjs --snap T1,T2,... --size WxH --out snap.bin` to PNG.

    python3 tools/png.py snap.bin out_prefix [--cell 8x16] [--sheet COLS] [--scale 0.5]

Writes out_prefix_<t>.png per frame, or one contact sheet with --sheet. Dev-time only (Pillow + fontTools).
Block elements and braille are drawn as shapes so they look the way a terminal draws them.
"""
from __future__ import annotations

import struct
import sys

import numpy as np
from fontTools.ttLib import TTCollection, TTFont
from PIL import Image, ImageDraw, ImageFont

FONTS = [("/System/Library/Fonts/Menlo.ttc", 0), ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
         ("/System/Library/Fonts/Apple Symbols.ttf", 0), ("/System/Library/Fonts/Supplemental/Songti.ttc", 7)]
BOLD = ("/System/Library/Fonts/Menlo.ttc", 1)
ITALIC = ("/System/Library/Fonts/Menlo.ttc", 2)


def load_frames(path):
    raw = open(path, "rb").read()
    off, frames = 0, []
    while off < len(raw):
        w, h = struct.unpack_from("<II", raw, off)
        t = struct.unpack_from("<f", raw, off + 8)[0]
        off += 16
        n = w * h
        ch = np.frombuffer(raw, np.uint32, n, off); off += 4 * n
        fg = np.frombuffer(raw, np.uint32, n, off); off += 4 * n
        bg = np.frombuffer(raw, np.uint32, n, off); off += 4 * n
        at = np.frombuffer(raw, np.uint8, n, off); off += n
        frames.append((t, w, h, ch.reshape(h, w), fg.reshape(h, w), bg.reshape(h, w), at.reshape(h, w)))
    return frames


class Fonts:
    def __init__(self, cw, chh):
        size = cw / 0.602
        self.cw, self.ch = cw, chh
        self.fonts, self.cmaps = [], []
        for p, i in FONTS:
            self.fonts.append(ImageFont.truetype(p, round(size if "Menlo" in p else size * 1.18), index=i))
            tt = TTCollection(p).fonts[i] if p.endswith(".ttc") else TTFont(p)
            self.cmaps.append(set(tt.getBestCmap().keys()))
        self.bold = ImageFont.truetype(BOLD[0], round(size), index=BOLD[1])
        self.italic = ImageFont.truetype(ITALIC[0], round(size), index=ITALIC[1])

    def pick(self, cp, at):
        if cp in self.cmaps[0]:
            if at & 1:
                return self.bold
            if at & 4:
                return self.italic
            return self.fonts[0]
        for f, cm in zip(self.fonts[1:], self.cmaps[1:]):
            if cp in cm:
                return f
        return self.fonts[0]


def rgb(c):
    c = int(c)
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


QUAD = {0x2596: "0010", 0x2597: "0001", 0x2598: "1000", 0x2599: "1011", 0x259A: "1001", 0x259B: "1110",
        0x259C: "1101", 0x259D: "0100", 0x259E: "0110", 0x259F: "0111"}


def draw_frame(fr, F: Fonts):
    t, w, h, ch, fg, bg, at = fr
    cw, chh = F.cw, F.ch
    img = Image.new("RGB", (w * cw, h * chh))
    d = ImageDraw.Draw(img)
    for y in range(h):
        for x in range(w):
            b = rgb(bg[y, x])
            d.rectangle([x * cw, y * chh, x * cw + cw - 1, y * chh + chh - 1], fill=b)
    for y in range(h):
        x = 0
        while x < w:
            cp = int(ch[y, x])
            a = int(at[y, x])
            f, b = rgb(fg[y, x]), rgb(bg[y, x])
            if a & 32:
                f, b = b, f
            if a & 2:
                f = tuple(int(v * 0.6 + bb * 0.4) for v, bb in zip(f, b))
            X, Y = x * cw, y * chh
            wide = x + 1 < w and int(ch[y, x + 1]) == 0
            if cp in (0, 32):
                x += 1
                continue
            if cp == 0x2580:
                d.rectangle([X, Y, X + cw - 1, Y + chh // 2 - 1], fill=f)
            elif cp == 0x2584:
                d.rectangle([X, Y + chh // 2, X + cw - 1, Y + chh - 1], fill=f)
            elif cp == 0x2588:
                d.rectangle([X, Y, X + cw - 1, Y + chh - 1], fill=f)
            elif cp == 0x258C:
                d.rectangle([X, Y, X + cw // 2 - 1, Y + chh - 1], fill=f)
            elif cp == 0x2590:
                d.rectangle([X + cw // 2, Y, X + cw - 1, Y + chh - 1], fill=f)
            elif cp in QUAD:
                q = QUAD[cp]
                hw, hh = cw // 2, chh // 2
                for k, (qx, qy) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
                    if q[k] == "1":
                        d.rectangle([X + qx * hw, Y + qy * hh, X + qx * hw + hw - 1, Y + qy * hh + hh - 1], fill=f)
            elif 0x2589 <= cp <= 0x258F:
                d.rectangle([X, Y, X + max(1, round(cw * (0x2590 - cp) / 8)) - 1, Y + chh - 1], fill=f)
            elif 0x2581 <= cp <= 0x2587:
                d.rectangle([X, Y + chh - max(1, round(chh * (cp - 0x2580) / 8)), X + cw - 1, Y + chh - 1], fill=f)
            elif 0x1FB00 <= cp <= 0x1FB3B:
                m = cp - 0x1FB00 + 1
                m += 1 if m >= 21 else 0
                m += 1 if m >= 42 else 0
                ys = [round(chh * k / 3) for k in range(4)]
                hw = cw // 2
                for k in range(6):
                    if m & (1 << k):
                        qx, qy = k % 2, k // 2
                        x0 = X if qx == 0 else X + hw
                        x1 = X + hw - 1 if qx == 0 else X + cw - 1
                        d.rectangle([x0, Y + ys[qy], x1, Y + ys[qy + 1] - 1], fill=f)
            elif cp in (0x2591, 0x2592, 0x2593):
                k = {0x2591: 0.25, 0x2592: 0.5, 0x2593: 0.75}[cp]
                c2 = tuple(int(bb + (v - bb) * k) for v, bb in zip(f, b))
                d.rectangle([X, Y, X + cw - 1, Y + chh - 1], fill=c2)
            elif cp == 0x23FA:
                r = cw * 0.32
                cx, cy = X + cw / 2, Y + chh / 2
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=f)
            elif 0x2800 <= cp <= 0x28FF:
                bits = cp - 0x2800
                pos = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (0, 3), (1, 3)]
                for k, (bx, by) in enumerate(pos):
                    if bits & (1 << k):
                        cx = X + (bx * 2 + 1) * cw / 4
                        cy = Y + (by * 2 + 1) * chh / 8
                        r = max(1.0, cw / 7)
                        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=f)
            else:
                font = F.pick(cp, a)
                d.text((X, Y + chh * 0.05), chr(cp), fill=f, font=font)
            if a & 8:
                d.line([X, Y + chh - 2, X + cw * (2 if wide else 1), Y + chh - 2], fill=f)
            if a & 16:
                d.line([X, Y + chh // 2, X + cw * (2 if wide else 1), Y + chh // 2], fill=f)
            x += 2 if wide else 1
    return img


def main():
    args = sys.argv[1:]
    src, prefix = args[0], args[1]
    cell, sheet, scale = "8x16", 0, 1.0
    if "--cell" in args:
        cell = args[args.index("--cell") + 1]
    if "--sheet" in args:
        sheet = int(args[args.index("--sheet") + 1])
    if "--scale" in args:
        scale = float(args[args.index("--scale") + 1])
    cw, chh = map(int, cell.split("x"))
    F = Fonts(cw, chh)
    frames = load_frames(src)
    imgs = []
    for fr in frames:
        im = draw_frame(fr, F)
        if scale != 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        if not sheet:
            im.save(f"{prefix}_{fr[0]:07.2f}.png")
        imgs.append((fr[0], im))
    if sheet:
        W, H = imgs[0][1].size
        rows = (len(imgs) + sheet - 1) // sheet
        out = Image.new("RGB", (sheet * W + (sheet - 1) * 6, rows * (H + 18)), (60, 60, 60))
        d = ImageDraw.Draw(out)
        lab = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 13)
        for k, (t, im) in enumerate(imgs):
            X, Y = (k % sheet) * (W + 6), (k // sheet) * (H + 18)
            d.text((X + 4, Y + 1), f"t={t:.2f}", fill=(255, 200, 120), font=lab)
            out.paste(im, (X, Y + 18))
        out.save(f"{prefix}.png")
        print(f"{prefix}.png {out.size}")
    else:
        print(f"{len(imgs)} frames -> {prefix}_*.png")


if __name__ == "__main__":
    main()
