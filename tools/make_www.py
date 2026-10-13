#!/usr/bin/env python3
"""Bygger www/index.html från src/app.html.

src/app.html är skriven som en Claude-artifact (utan <html>/<head>).
Här läggs dokumentskalet till och chess.js pekas om till den lokala kopian,
så att appen fungerar utan internet på TV-boxen.
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "src" / "app.html").read_text(encoding="utf-8")

src = re.sub(
    r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/chess\.js/[^"]+"></script>',
    '<script src="chess.js"></script>',
    src,
)

head = """<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
"""

# Allt fram till första <style> hör hemma i <head>.
cut = src.index("</style>") + len("</style>")
out = head + src[:cut] + "\n</head>\n<body>\n" + src[cut:] + "\n</body>\n</html>\n"
(root / "www" / "index.html").write_text(out, encoding="utf-8")
print("www/index.html skriven,", len(out), "tecken")
