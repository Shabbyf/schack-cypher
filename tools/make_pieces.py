#!/usr/bin/env python3
"""Kopierar pjässet från en lokal klon av lichess-org/lila till assets/pieces/
och skapar egna färgvarianter (Guldkedja, Graffiti) av cburnett.

  python3 tools/make_pieces.py /sökväg/till/lila

Bara set med GPL-kompatibla licenser tas med (se assets/pieces/LICENSES.md).
"""
import pathlib
import shutil
import sys

SETS = {
    "cburnett": "Colin M.L. Burnett, GPLv2+",
    "merida": "Armando Hernandez Marroquin, GPLv2+",
    "chessnut": "Alexis Luengas, Apache 2.0",
    "fantasy": "Maurizio Monge, MIT",
    "celtic": "Maurizio Monge, MIT",
    "spatial": "Maurizio Monge, MIT",
    "rhosgfx": "RhosGFX, CC0 1.0",
    "mpchess": "Maxime Chupin, GPLv3+",
}
# Omfärgning av cburnett: (vit fyllning, vit kontur, svart fyllning, svart kontur, svarta detaljer)
RECOLOR = {
    "guld": ("#ffd75e", "#5c3b00", "#17130a", "#e8b42c", "#f6d27a"),
    "graffiti": ("#7df9ff", "#22093d", "#ff3fa4", "#22093d", "#ffe3f2"),
}

lila = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent / "assets" / "pieces"
out.mkdir(parents=True, exist_ok=True)

for name in SETS:
    src = lila / "public" / "piece" / name
    dst = out / name
    dst.mkdir(exist_ok=True)
    for f in sorted(src.glob("*.svg")):
        shutil.copy(f, dst / f.name)

base = lila / "public" / "piece" / "cburnett"
for name, (wf, ws, bf, bs, bd) in RECOLOR.items():
    dst = out / name
    dst.mkdir(exist_ok=True)
    for f in sorted(base.glob("*.svg")):
        s = f.read_text()
        if f.name.startswith("w"):
            s = s.replace('fill="#fff"', f'fill="{wf}"').replace('stroke="#000"', f'stroke="{ws}"').replace('fill="#000"', f'fill="{ws}"')
        else:
            s = s.replace('fill="#000"', f'fill="{bf}"').replace('stroke="#000"', f'stroke="{bs}"')
            s = s.replace('stroke="#ececec"', f'stroke="{bd}"').replace('fill="#ececec"', f'fill="{bd}"')
        (dst / f.name).write_text(s)

lic = ["# Pjässet", "", "Från lichess-org/lila (public/piece). Upphovspersoner och licenser:", ""]
lic += [f"- `{k}`: {v}" for k, v in SETS.items()]
lic += ["- `guld`, `graffiti`: omfärgade varianter av cburnett, GPLv2+", ""]
(out / "LICENSES.md").write_text("\n".join(lic))
print("klart:", ", ".join(list(SETS) + list(RECOLOR)))
