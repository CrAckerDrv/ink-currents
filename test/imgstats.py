import sys
try:
    from PIL import Image
except ImportError:
    print("NOPIL")
    sys.exit(0)

path = sys.argv[1]
im = Image.open(path).convert("RGB")
w, h = im.size
px = list(im.getdata())
n = len(px)

# 背景色（四角平均）
corners = [px[0], px[w - 1], px[(h - 1) * w], px[h * w - 1]]
bg = [sum(c[i] for c in corners) // 4 for i in range(3)]

distinct = set()
bright = 0
total_lum = 0
for p in px[::7]:
    distinct.add(p)
    lum = (p[0] * 299 + p[1] * 587 + p[2] * 114) // 1000
    total_lum += lum
    if lum > 60:
        bright += 1

sampled = len(px[::7])
print("SIZE %dx%d" % (w, h))
print("BG %s" % (bg,))
print("DISTINCT_COLORS %d" % len(distinct))
print("BRIGHT_RATIO %.3f" % (bright / sampled))
print("MEAN_LUM %.1f" % (total_lum / sampled))
