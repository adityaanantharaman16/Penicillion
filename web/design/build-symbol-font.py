"""Regenerate Penicillion's supplemental UI symbols with fonttools 4.60.1."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

DESTINATION = Path(__file__).resolve().parents[1] / "fonts"
GRID = 90
GLYPHS = {
    " ": ["...."],
    "\u00a0": ["...."],
    "+": [".....", ".....", "..#..", "#####", "..#..", ".....", "....."],
    "0": [".###.", "#...#", "#...#", "#.#.#", "#...#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", "..#..", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "←": [".......", "..#....", ".#.....", "#######", ".#.....", "..#....", "......."],
    "→": [".......", "....#..", ".....#.", "#######", ".....#.", "....#..", "......."],
    "↑": ["...#...", "..###..", ".#.#.#.", "#..#..#", "...#...", "...#...", "...#..."],
    "↓": ["...#...", "...#...", "...#...", "#..#..#", ".#.#.#.", "..###..", "...#..."],
    "↗": ["..#####", ".....##", "....#.#", "...#..#", "..#...#", ".#.....", "#......"],
    "↘": ["#......", ".#.....", "..#...#", "...#..#", "....#.#", ".....##", "..#####"],
    "↙": ["......#", ".....#.", "#...#..", "#..#...", "#.#....", "##.....", "#####.."],
    "↖": ["#####..", "##.....", "#.#....", "#..#...", "#...#..", ".....#.", "......#"],
    "✛": ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
    "✦": ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."],
    "✧": ["...#...", "...#...", "..#.#..", "##...##", "..#.#..", "...#...", "...#..."],
    "△": ["...#...", "...#...", "..#.#..", "..#.#..", ".#...#.", ".#...#.", "#######"],
    "⚭": [".........", ".##...##.", "#..#.#..#", "#..###..#", "#..#.#..#", ".##...##.", "........."],
    "◆": ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
    "◇": ["...#...", "..#.#..", ".#...#.", "#.....#", ".#...#.", "..#.#..", "...#..."],
    "●": ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."],
    "○": ["..###..", ".#...#.", "#.....#", "#.....#", "#.....#", ".#...#.", "..###.."],
    "✓": [".......", "......#", ".....#.", "....#..", "#..#...", ".##....", "......."],
}
for char, width in [("‐", 3), ("‑", 3), ("‒", 5)]:
    GLYPHS[char] = ["." * width] * 3 + ["#" * width] + ["." * width] * 3


def outline(rows):
    # Unite each exposed grid edge with its next neighbour. Boundaries have
    # clockwise winding so adjacent grid pixels have no internal seams.
    edges = {}
    for row, cells in enumerate(rows):
        for col, cell in enumerate(cells):
            if cell != "#":
                continue
            left, right = 60 + col * GRID, 60 + (col + 1) * GRID
            top, bottom = (7 - row) * GRID, (6 - row) * GRID
            corners = [(left, top), (right, top), (right, bottom), (left, bottom)]
            for a, b in zip(corners, corners[1:] + corners[:1]):
                if (b, a) in edges:
                    del edges[b, a]
                else:
                    edges[a, b] = True
    pen = TTGlyphPen(None)
    while edges:
        start, nxt = next(iter(edges))
        pen.moveTo(start)
        last = start
        while True:
            del edges[last, nxt]
            if nxt == start:
                break
            pen.lineTo(nxt)
            last = nxt
            nxt = next(b for a, b in edges if a == last)
        pen.closePath()
    return pen.glyph()


font = FontBuilder(1000, isTTF=True)
cmap = {ord(char): f"uni{ord(char):04X}" for char in GLYPHS}
font.setupGlyphOrder([".notdef", *cmap.values()])
font.setupCharacterMap(cmap)
glyphs = {".notdef": outline(["#####", "#...#", "#.#.#", "#.#.#", "#...#", "#####"])}
metrics = {".notdef": (570, 60)}
for char, rows in GLYPHS.items():
    name = cmap[ord(char)]
    glyphs[name] = outline(rows)
    metrics[name] = (120 + max(map(len, rows)) * GRID, 60 if any("#" in row for row in rows) else 0)
font.setupGlyf(glyphs)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=920, descent=-280)
font.setupNameTable({
    "familyName": "Penicillion Symbols", "styleName": "Regular", "fullName": "Penicillion Symbols Regular",
    "uniqueFontIdentifier": "Penicillion Symbols 1.1", "psName": "PenicillionSymbols-Regular",
    "version": "Version 1.100", "copyright": "Copyright 2026 The Penicillion Symbols Project Authors",
    "licenseDescription": "SIL Open Font License, Version 1.1", "licenseInfoURL": "https://openfontlicense.org/",
})
font.setupOS2(sTypoAscender=920, sTypoDescender=-280, usWinAscent=920, usWinDescent=280)
font.setupPost()
font.setupMaxp()
font.font.recalcTimestamp = False
font.font["head"].created = font.font["head"].modified = 3877286400
font.save(DESTINATION / "penicillion-symbols.ttf")
