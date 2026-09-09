"""One-shot logo cleanup for docs/01-product/large.png.

The file carries scattered semi-transparent gray watermark text tiles over a
flat light-gray background. The art is a saturated blue glyph and a dark ink
wordmark. This script:

1. Builds a mask of watermark pixels: neutral gray in the 190..237 band that
   has no dark ink within a 2px guard radius (so wordmark antialiasing is
   protected) and no saturated art nearby (art edges are non-neutral anyway).
2. Restores masked pixels to the flat background color.
3. Emits public/logo.png with the background made transparent and the clean
   art untouched.

Run: python3 scripts/clean-logo.py
"""

from PIL import Image

SRC = "docs/01-product/large.png"
OUT_OPAQUE = "docs/01-product/large-clean.png"
OUT_TRANSPARENT = "public/logo.png"
BG = (240, 240, 240)

im = Image.open(SRC).convert("RGBA")
w, h = im.size
px = im.load()

def is_neutral(r, g, b, tol=14):
    return abs(r - g) <= tol and abs(g - b) <= tol and abs(r - b) <= tol

def is_dark(r, g, b):
    return max(r, g, b) < 160

def is_watermark_band(r, g, b):
    return is_neutral(r, g, b) and 190 <= min(r, g, b) <= 237

# Pass 1: collect watermark-band pixels and dark ink locations.
dark_pixels = set()
band_pixels = []
for y in range(h):
    for x in range(w):
        r, g, b, _ = px[x, y]
        if is_dark(r, g, b):
            dark_pixels.add((x, y))
        elif is_watermark_band(r, g, b):
            band_pixels.append((x, y))

# Pass 2: keep only band pixels with a clean neighborhood (guard 2px).
def has_dark_neighbor(x, y, radius=2):
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if (x + dx, y + dy) in dark_pixels:
                return True
    return False

mask = [(x, y) for (x, y) in band_pixels if not has_dark_neighbor(x, y)]

# Pass 3: restore masked pixels to the flat background.
for x, y in mask:
    px[x, y] = (*BG, 255)

im.save(OUT_OPAQUE)

# Pass 4: transparent asset. Background and any residue in the bg band become
# alpha 0; saturated art and dark ink stay opaque. Desaturated halo pixels
# directly around kept art are blended toward transparent for smooth edges.
logo = Image.open(OUT_OPAQUE).convert("RGBA")
lpx = logo.load()
kept_dark = set()
for y in range(h):
    for x in range(w):
        r, g, b, _ = lpx[x, y]
        if is_dark(r, g, b) or not is_neutral(r, g, b, tol=40):
            kept_dark.add((x, y))

def near_kept(x, y, radius=1):
    return any((x + dx, y + dy) in kept_dark for dy in range(-radius, radius + 1) for dx in range(-radius, radius + 1))

for y in range(h):
    for x in range(w):
        r, g, b, _ = lpx[x, y]
        if is_neutral(r, g, b, tol=12) and r >= 234:
            if near_kept(x, y):
                lpx[x, y] = (*BG, 90)  # soften halo against dark or blue edges
            else:
                lpx[x, y] = (0, 0, 0, 0)

logo.save(OUT_TRANSPARENT)
print(f"watermark pixels restored: {len(mask)}")
print(f"wrote {OUT_OPAQUE} and {OUT_TRANSPARENT} ({w}x{h})")
