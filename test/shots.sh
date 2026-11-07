#!/bin/bash
# 逐色板截图 + 墨迹统计（固定种子，便于对比）。
# 用法：bash test/shots.sh          （在仓库任意位置跑都行）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

EDGE="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
if [ ! -x "$EDGE" ]; then
  echo "找不到浏览器：$EDGE" >&2
  echo "用 EDGE=/path/to/chrome bash test/shots.sh 指定" >&2
  exit 1
fi

PY="${PY:-python}"
URL="file://$(cd "$ROOT" && pwd | sed 's|^/\([A-Za-z]\)/|\1:/|')/index.html"

for p in abyss canyon garden sumi aurora; do
  out="$HERE/s_$p.png"
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,800 \
    --virtual-time-budget=14000 --screenshot="$out" \
    "$URL?seed=20251107&palette=$p&motion=on" >/dev/null 2>&1
  printf '%-7s ' "$p"
  "$PY" "$HERE/inkstat.py" "$out" 2>&1 | tr '\n' ' '
  echo
done
