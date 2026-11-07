#!/bin/bash
# 逐色板截图 + 墨迹统计（固定种子，便于对比）
cd "$(dirname "$0")/../.." || exit 1
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PAGE="file:///C:/Users/Administrator/Desktop/%E8%81%94%E5%8A%A8%E6%B5%8B%E8%AF%95/art/index.html"
OUT="art/test"

for p in abyss canyon garden sumi aurora; do
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,800 \
    --virtual-time-budget=14000 \
    --screenshot="$(pwd)/${OUT}/s_${p}.png" \
    "${PAGE}?seed=20251107&palette=${p}&motion=on" >/dev/null 2>&1
  printf '%-7s ' "$p"
  python "${OUT}/inkstat.py" "${OUT}/s_${p}.png" 2>&1 | tr '\n' ' '
  echo
done
