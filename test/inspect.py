import sys
from PIL import Image

path = sys.argv[1]
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()

corners = [px[0, 0], px[W - 1, 0], px[0, H - 1], px[W - 1, H - 1]]
bg = [sum(c[i] for c in corners) // 4 for i in range(3)]

hit = 0
tot = 0
rows = []
COLS = 78
CW = W / COLS
CH = H / 30
for r in range(30):
    line = ""
    for c in range(COLS):
        x = int(c * CW + CW / 2)
        y = int(r * CH + CH / 2)
        p = px[x, y]
        d = max(abs(p[i] - bg[i]) for i in range(3))
        tot += 1
        if d > 8:
            hit += 1
        line += " .:-=+*#%@"[min(9, d // 12)]
    rows.append(line)

# 全图像素覆盖率（采样）
cover = 0
sample = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        p = px[x, y]
        sample += 1
        if max(abs(p[i] - bg[i]) for i in range(3)) > 8:
            cover += 1

print("SIZE %dx%d BG %s" % (W, H, bg))
print("COVER %.4f" % (cover / sample))
print("GRIDHIT %.3f" % (hit / tot))
for line in rows:
    print("|" + line + "|")

