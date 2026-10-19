#!/usr/bin/env bash
# Rebuilds the downloadable agent (public/tally-agent/fynhelp-tally-agent.zip)
# from tools/tally-agent. Run after changing anything under tools/tally-agent.
set -euo pipefail
cd "$(dirname "$0")/.."
out="public/tally-agent/fynhelp-tally-agent.zip"
rm -f "$out"
(cd tools/tally-agent && zip -q -X "../../$out" agent.mjs lib.mjs install.ps1 README.txt)
echo "Built $out"
