#!/usr/bin/env bash
# Download the open-licensed (SIL OFL 1.1) fonts tools/bake.py renders the big-type atlas from.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl
get() { [ -s "fonts/$2" ] || curl -fsSL "$BASE/$1" -o "fonts/$2"; echo "fonts/$2"; }
get 'jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf' JetBrainsMono.ttf
get 'sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf' SourceSerif4.ttf
get 'notosanstc/NotoSansTC%5Bwght%5D.ttf' NotoSansTC.ttf
get 'notoseriftc/NotoSerifTC%5Bwght%5D.ttf' NotoSerifTC.ttf
get 'notosanssc/NotoSansSC%5Bwght%5D.ttf' NotoSansSC.ttf     # simplified forms for --hans
get 'notoserifsc/NotoSerifSC%5Bwght%5D.ttf' NotoSerifSC.ttf
