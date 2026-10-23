# -*- coding: utf-8 -*-
"""從 hurt.tw 的「8-dot braille」（FontStruct，CC BY-NC-SA 3.0）產生含 Unicode 點字的字型 8DotBraille.ttf。

原字型只有 ASCII 範圍（照 NABCC 八點電腦點字），帶第 8 點的點型大多放不進去；這裡沿用它的
「凸點」「空點」兩種字形，依點位組出 U+2800–U+28FF 全部 256 個點型，ASCII 部分照 NABCC 重新組合
（原字型的反斜線 \\ 畫成 1267，NABCC 是 12567，這裡改正）。縮點對照頁（zh-tw-short.html）用它顯示點字：
空的點位也畫成小點，第 7、8 點一眼就分得出來。

用法：python tools/build-8dot-braille-font.py [原字型 .otf 路徑]
    預設讀 ../materials/8-dot-braille.otf，輸出到 repo 根目錄的 8DotBraille.ttf，並逐一驗證 256 個點型。
"""
import os
import re
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SRC_DEFAULT = os.path.join(ROOT, "..", "materials", "8-dot-braille.otf")
OUT = os.path.join(ROOT, "8DotBraille.ttf")
NABCC = os.path.join(ROOT, "table", "text_nabcc.dis")
FAMILY = "8-dot braille Unicode"
# 原字型另外畫的符號（不在 NABCC 裡），點型照原字型；第 8 點的凸點形狀只能從這幾個字取
EXTRAS = {"—": 0b11010010, "‘": 0b11000100, "’": 0b11100000, "“": 0b11000110, "”": 0b11110000}


def nabcc():
	"""ASCII 字元 → 點位（位元），取自 liblouis 的 text_nabcc.dis。"""
	out = {}
	for line in open(NABCC, encoding="utf-8"):
		m = re.match(r"display\s+\\x([0-9a-fA-F]+)\s+(\d+)", line)
		if m:
			ch = chr(int(m.group(1), 16))
			if 0x20 <= ord(ch) <= 0x7E:
				out[ch] = sum(1 << (int(d) - 1) for d in m.group(2) if d != "0")
	return out


def contours(glyph):
	"""一個字形拆成輪廓：[(中心 x, 中心 y, 繪圖指令)]。"""
	pen = RecordingPen()
	glyph.draw(pen)
	out, cur = [], []
	for op, args in pen.value:
		cur.append((op, args))
		if op in ("closePath", "endPath"):
			pts = [p for _, a in cur for p in a]
			out.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), cur))
			cur = []
	return out


def main():
	sys.stdout.reconfigure(encoding="utf-8")
	src = TTFont(sys.argv[1] if len(sys.argv) > 1 else SRC_DEFAULT)
	gs, cmap = src.getGlyphSet(), src.getBestCmap()
	table = nabcc()
	width = gs[cmap[ord("a")]].width

	# 點位中心：取 a 的 8 個輪廓，左右兩欄、上下四列 → 點 1–8
	ref = contours(gs[cmap[ord("a")]])
	assert len(ref) == 8, "每個字形應該有 8 個輪廓"
	xs = sorted({round(c[0]) for c in ref})
	midx = (xs[0] + xs[-1]) / 2
	left = sorted([c for c in ref if c[0] < midx], key=lambda c: -c[1])
	right = sorted([c for c in ref if c[0] >= midx], key=lambda c: -c[1])
	centers = {1: left[0], 2: left[1], 3: left[2], 7: left[3], 4: right[0], 5: right[1], 6: right[2], 8: right[3]}
	centers = {d: (c[0], c[1]) for d, c in centers.items()}

	def at(glyph, dot):
		cx, cy = centers[dot]
		return min(contours(glyph), key=lambda c: (c[0] - cx) ** 2 + (c[1] - cy) ** 2)[2]

	# 每個點位的凸點、空點輪廓：從 NABCC 已知點型的 ASCII 字找
	shape = {}
	for dot in range(1, 9):
		for filled in (True, False):
			known = [(c, b) for c, b in table.items() if c != "\\"] + list(EXTRAS.items())
			ch = next(c for c, bits in known if ord(c) in cmap and bool(bits >> (dot - 1) & 1) == filled)
			shape[(dot, filled)] = at(gs[cmap[ord(ch)]], dot)

	def build(bits):
		pen = TTGlyphPen(None)
		cpen = Cu2QuPen(pen, max_err=1.0, reverse_direction=True)
		for dot in range(1, 9):
			for op, args in shape[(dot, bool(bits >> (dot - 1) & 1))]:
				getattr(cpen, op)(*args)
		return pen.glyph()

	glyphs = {".notdef": TTGlyphPen(None).glyph()}
	cmapOut = {}
	# ASCII：照 NABCC 重組（含空白）；原字型另外畫的 — ‘ ’ “ ” 照原樣保留點型
	for ch, bits in list(table.items()) + list(EXTRAS.items()):
		name = f"uni{ord(ch):04X}"
		glyphs[name] = build(bits)
		cmapOut[ord(ch)] = name
	for bits in range(256):
		name = f"uni{0x2800 + bits:04X}"
		glyphs[name] = build(bits)
		cmapOut[0x2800 + bits] = name

	order = list(glyphs)
	fb = FontBuilder(src["head"].unitsPerEm, isTTF=True)
	fb.setupGlyphOrder(order)
	fb.setupCharacterMap(cmapOut)
	fb.setupGlyf(glyphs)
	fb.setupHorizontalMetrics({n: (width if n != ".notdef" else width, 0) for n in order})
	asc = src["hhea"].ascent
	fb.setupHorizontalHeader(ascent=asc, descent=src["hhea"].descent)
	fb.setupOS2(sTypoAscender=asc, sTypoDescender=src["hhea"].descent, usWinAscent=asc, usWinDescent=abs(src["hhea"].descent))
	fb.setupNameTable({
		"familyName": FAMILY,
		"styleName": "Regular",
		"uniqueFontIdentifier": FAMILY + " Regular 1.0",
		"fullName": FAMILY + " Regular",
		"psName": "8-dotBrailleUnicode-Regular",
		"version": "Version 1.0",
		"designer": "hurt.tw",
		"description": "Generated from \"8-dot braille\" by hurt.tw (FontStruct): Unicode braille U+2800-U+28FF and NABCC ASCII, empty dots drawn small.",
		"licenseDescription": "Creative Commons Attribution Non-commercial Share Alike",
		"licenseInfoURL": "http://creativecommons.org/licenses/by-nc-sa/3.0/",
	})
	fb.setupPost()
	fb.save(OUT)
	print(OUT, len(order), "個字形")
	verify(table)


def verify(table):
	"""逐一畫出來檢查：每個點位是凸點（墨多）還是空點（墨少）。"""
	from PIL import Image, ImageDraw, ImageFont
	F = ImageFont.truetype(OUT, 200)

	def render(ch):
		img = Image.new("L", (300, 360), 255)
		ImageDraw.Draw(img).text((40, 20), ch, font=F, fill=0)
		return img.load()

	# 用全滿的點型找 8 個點的中心（連通區塊）
	px = render(chr(0x28FF))
	W, H = 300, 360
	seen, blobs = set(), []
	for y in range(H):
		for x in range(W):
			if px[x, y] < 128 and (x, y) not in seen:
				stack, pts = [(x, y)], []
				seen.add((x, y))
				while stack:
					a, b = stack.pop()
					pts.append((a, b))
					for q in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
						if 0 <= q[0] < W and 0 <= q[1] < H and q not in seen and px[q] < 128:
							seen.add(q)
							stack.append(q)
				blobs.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
	assert len(blobs) == 8, f"全滿的點型應該有 8 個點，找到 {len(blobs)}"
	midx = sum(b[0] for b in blobs) / 8
	left = sorted([b for b in blobs if b[0] < midx], key=lambda b: b[1])
	right = sorted([b for b in blobs if b[0] >= midx], key=lambda b: b[1])
	pos = {1: left[0], 2: left[1], 3: left[2], 7: left[3], 4: right[0], 5: right[1], 6: right[2], 8: right[3]}

	def ink(p, dot):
		cx, cy = pos[dot]
		return sum(1 for dx in range(-14, 15) for dy in range(-14, 15) if p[int(cx) + dx, int(cy) + dy] < 128)

	full = render(chr(0x28FF))
	empty = render(chr(0x2800))
	thr = {d: (ink(full, d) + ink(empty, d)) / 2 for d in pos}

	def bitsOf(ch):
		p = render(ch)
		return sum(1 << (d - 1) for d in pos if ink(p, d) > thr[d])

	bad = [b for b in range(256) if bitsOf(chr(0x2800 + b)) != b]
	badAscii = [c for c, b in table.items() if bitsOf(c) != b]
	print(f"驗證：Unicode 點字 256 個，錯 {len(bad)} 個；ASCII {len(table)} 個，錯 {len(badAscii)} 個", bad[:10], badAscii[:10])
	if bad or badAscii:
		sys.exit(1)


if __name__ == "__main__":
	main()
