#!/usr/bin/env python3
"""Génère les icônes de l'app (app/icons/) : fond uni + glyphe « itinéraire » (deux points reliés).

  python3 tools/make_icons.py                      # couleurs du thème (crème / vermillon)
  python3 tools/make_icons.py --accent "#2f5d8a"   # autre couleur d'accent
  python3 tools/make_icons.py --bg "#101418" --accent "#f2c94c"

Dépendance : Pillow (pip install pillow).
"""
import argparse, os, sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow manquant : pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "icons")


def bezier(p0, p1, p2, p3, n=60):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0]
        y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]
        pts.append((x, y))
    return pts


def draw(size, bg, accent, maskable):
    S = 4  # supersampling
    W = size * S
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, W, W], fill=bg)
        pad = W * 0.22
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=W * 0.22, fill=bg)
        pad = W * 0.2
    a, b = pad, W - pad                      # zone utile
    r = (b - a) * 0.12                       # rayon des points
    stroke = int((b - a) * 0.085)
    p0, p3 = (a + r, b - r), (b - r, a + r)  # bas-gauche → haut-droite
    c1, c2 = (a + r + (b - a) * 0.55, b - r), (b - r - (b - a) * 0.55, a + r)
    for x, y in bezier(p0, c1, c2, p3, n=400):   # disques successifs : trait lisse sans artefact de jointure
        d.ellipse([x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2], fill=accent)
    for (x, y), hollow in ((p0, True), (p3, False)):
        d.ellipse([x - r, y - r, x + r, y + r], fill=accent)
        if hollow:
            d.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45], fill=bg)
    return im.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bg", default="#f6f1e7")
    ap.add_argument("--accent", default="#b8321f")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for name, size, maskable in (("icon-180.png", 180, True), ("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-512-maskable.png", 512, True)):
        draw(size, a.bg, a.accent, maskable).save(os.path.join(a.out, name), optimize=True)
        print("ok", os.path.join(a.out, name))


if __name__ == "__main__":
    main()
