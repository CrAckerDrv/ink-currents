import sys
from PIL import Image

path = sys.argv[1]
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()

# 众数亮度当作"纸"的亮度（避开四角暗角带来的误判）
hist = [0] * 256
for y in range(0, H, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        hist[(r * 299 + g * 587 + b * 114) // 1000] += 1
paper = max(range(256), key=lambda i: hist[i])

# 只看画布区域，排除顶部控件条与底部状态条
top = int(H * 0.14)
bot = int(H * 0.86)
ink = 0
deep = 0
total = 0
for y in range(top, bot, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        lum = (r * 299 + g * 587 + b * 114) // 1000
        total += 1
        d = paper - lum if paper > 128 else lum - paper
        if d > 18:
            ink += 1
        if d > 60:
            deep += 1

print("SIZE %dx%d PAPER %d" % (W, H, paper))
print("INK_RATIO %.4f" % (ink / total))
print("DEEP_RATIO %.4f" % (deep / total))
