#!/usr/bin/env bash
# Contact sheet of COUNT evenly spaced frames between START and END seconds.
#   tools/preview.sh START END COUNT [WxH] [OUT_PREFIX] [SCALE]
set -euo pipefail
cd "$(dirname "$0")/.."
START=$1; END=$2; COUNT=$3; SIZE=${4:-160x45}; OUT=${5:-/tmp/preview}; SCALE=${6:-0.5}
PY=${PREVIEW_PYTHON:-python3}
TIMES=$(node -e "const a=+process.argv[1],b=+process.argv[2],n=+process.argv[3];console.log(Array.from({length:n},(_,i)=>(n<2?a:a+(b-a)*i/(n-1)).toFixed(3)).join(','))" "$START" "$END" "$COUNT")
node src/main.mjs --snap "$TIMES" --size "$SIZE" --out "$OUT.bin"
COLS=$(( COUNT < 3 ? COUNT : 3 ))
"$PY" tools/png.py "$OUT.bin" "$OUT" --sheet "$COLS" --scale "$SCALE"
