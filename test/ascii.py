import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("L").resize((64, 24))
px = list(im.getdata())
ch = " .:-=+*#%@"
for y in range(24):
    row = "".join(ch[min(9, px[y*64+x] * 10 // 256)] for x in range(64))
    print(row)

