"""Make small copies of the character pictures for the website.

Reads every PNG in images/characters/ and writes a 160x160 copy with the same
name to images/faces/. Run from the marvel-network folder:

    python3 tools/make_faces.py
"""
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
src = root / "images" / "characters"
dst = root / "images" / "faces"
dst.mkdir(parents=True, exist_ok=True)

for f in sorted(src.glob("*.png")):
    im = Image.open(f).convert("RGBA")
    im.thumbnail((160, 160), Image.LANCZOS)
    im.save(dst / f.name, optimize=True)
    print("made", dst / f.name)
