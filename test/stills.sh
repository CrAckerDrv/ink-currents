#!/bin/bash
cd "C:/Users/Administrator/Desktop/联动测试"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
BASE="file:///C:/Users/Administrator/Desktop/%E8%81%94%E5%8A%A8%E6%B5%8B%E8%AF%95/art/index.html?seed=20251107&palette="
for p in abyss canyon garden sumi aurora; do
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,800 \
    --virtual-time-budget=9000 \
    --screenshot="C:/Users/Administrator/Desktop/联动测试/art/test/st_$p.png" \
    "${BASE}$p" 2>/dev/null
  printf "%-7s " "$p"
  python art/test/inkstat.py "art/test/st_$p.png" 2>&1 | tr '\n' ' '
  echo
done
