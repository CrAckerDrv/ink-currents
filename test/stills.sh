#!/bin/bash
# 逐个色板渲染「减少动效」下的静态图，并统计墨迹覆盖率。
# 用法：bash test/stills.sh          （在仓库任意位置跑都行）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

EDGE="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
if [ ! -x "$EDGE" ]; then
  echo "找不到浏览器：$EDGE" >&2
  echo "用 EDGE=/path/to/chrome bash test/stills.sh 指定" >&2
  exit 1
fi

PY="${PY:-python}"
URL="file://$(cd "$ROOT" && pwd | sed 's|^/\([A-Za-z]\)/|\1:/|')/index.html"

for p in abyss canyon garden sumi aurora; do
  out="$HERE/st_$p.png"
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,800 \
    --virtual-time-budget=14000 --screenshot="$out" \
    "$URL?seed=20251107&palette=$p" 2>/dev/null
  printf "%-7s " "$p"
  "$PY" "$HERE/inkstat.py" "$out" 2>&1 | tr '\n' ' '
  echo
done
