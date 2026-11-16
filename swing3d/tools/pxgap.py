import sys
from PIL import Image
def gap(path):
    im = Image.open(path).convert('RGB'); W,H = im.size
    px = im.load()
    bg = px[W//2, 4]                      # 배경색 기준
    def empty(y):
        n = 0
        for x in range(8, W-8, 3):
            c = px[x,y]
            if max(abs(c[i]-bg[i]) for i in range(3)) > 10: n += 1
        return n <= 1                      # 사실상 아무것도 안 그려진 행
    best = cur = start = at = 0
    for y in range(H):
        if empty(y):
            if cur == 0: start = y
            cur += 1
            if cur > best: best, at = cur, start
        else: cur = 0
    return best, at, H
for f in sys.argv[1:]:
    g,at,H = gap(f)
    print(f"{f.split('/')[-1]:18s} 빈 띠 {g//2:4d}px ({g/H*100:4.1f}%)  y={at//2}")
