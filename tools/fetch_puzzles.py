#!/usr/bin/env python3
"""Bygger data/puzzles.json från Lichess pusseldatabas (CC0).

Läser CSV från stdin, t.ex.:
  curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | python3 tools/fetch_puzzles.py

Väljer populära och väl prövade pussel, jämnt fördelade över ratingnivåer,
för varje tema och för de vanligaste öppningarna. Resultatet är ett kompakt
paket som appen kan använda helt utan internet.
"""
import csv
import json
import pathlib
import random
import sys

THEMES = [
    "mix", "mateIn1", "mateIn2", "mateIn3", "fork", "pin", "skewer", "discoveredAttack",
    "doubleCheck", "hangingPiece", "backRankMate", "smotheredMate", "sacrifice", "deflection",
    "attraction", "trappedPiece", "promotion", "advancedPawn", "kingsideAttack", "exposedKing",
    "quietMove", "defensiveMove", "zugzwang", "xRayAttack", "interference", "intermezzo",
    "clearance", "capturingDefender", "enPassant", "opening", "middlegame", "endgame",
    "rookEndgame", "pawnEndgame", "queenEndgame", "bishopEndgame", "knightEndgame",
    "crushing", "equality", "short", "long", "veryLong",
]
BINS = list(range(500, 2900, 200))  # 500-699, 700-899, ... 2700-2899
PER_BIN = {"mix": 90}
DEFAULT_PER_BIN = 12
TOP_OPENINGS = 24
PER_OPENING_BIN = 6

rng = random.Random(20261026)
samples = {}   # (key, bin) -> [count, list]
openings = {}  # family -> count


def offer(key, b, row, cap):
    slot = samples.setdefault((key, b), [0, []])
    slot[0] += 1
    if len(slot[1]) < cap:
        slot[1].append(row)
    else:
        j = rng.randrange(slot[0])
        if j < cap:
            slot[1][j] = row


reader = csv.reader(sys.stdin)
header = next(reader)
col = {name: i for i, name in enumerate(header)}
n = 0
for r in reader:
    n += 1
    try:
        rating = int(r[col["Rating"]])
        rd = int(r[col["RatingDeviation"]])
        pop = int(r[col["Popularity"]])
        plays = int(r[col["NbPlays"]])
    except ValueError:
        continue
    if rd > 90 or pop < 80 or plays < 300:
        continue
    bi = (rating - BINS[0]) // 200
    if bi < 0 or bi >= len(BINS):
        continue
    themes = r[col["Themes"]].split()
    row = (r[col["PuzzleId"]], r[col["FEN"]], r[col["Moves"]], rating, themes,
           r[col["OpeningTags"]].split() if "OpeningTags" in col else [])
    offer("mix", bi, row, PER_BIN["mix"])
    for t in themes:
        if t in THEMES:
            offer(t, bi, row, PER_BIN.get(t, DEFAULT_PER_BIN))
    if row[5]:
        fam = row[5][0]
        openings[fam] = openings.get(fam, 0) + 1
        offer("op:" + fam, bi, row, PER_OPENING_BIN)

top = [f for f, _ in sorted(openings.items(), key=lambda kv: -kv[1])[:TOP_OPENINGS]]

puzzles = {}
index = {}
for (key, b), (_, rows) in samples.items():
    if key.startswith("op:") and key[3:] not in top:
        continue
    for row in rows:
        puzzles[row[0]] = row
        index.setdefault(key, []).append(row[0])

theme_list = sorted({t for row in puzzles.values() for t in row[4] if t in THEMES})
tid = {t: i for i, t in enumerate(theme_list)}
ids = sorted(puzzles)
pos = {pid: i for i, pid in enumerate(ids)}
out = {
    "source": "Lichess puzzle database (CC0), https://database.lichess.org/#puzzles",
    "themes": theme_list,
    "openings": top,
    "puzzles": [[p[0], p[1], p[2], p[3], [tid[t] for t in p[4] if t in tid]] for p in (puzzles[i] for i in ids)],
    "index": {k: sorted(pos[i] for i in v) for k, v in index.items()},
}
dest = pathlib.Path(__file__).resolve().parent.parent / "data" / "puzzles.json"
dest.parent.mkdir(exist_ok=True)
dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print(f"läste {n} rader, sparade {len(ids)} pussel, {len(index)} grupper, {dest.stat().st_size // 1024} kB")
