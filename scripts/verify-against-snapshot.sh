#!/usr/bin/env bash
# Verification harness: compile the reconstructed src/ and compare emitted
# artefacts byte-for-byte against the runtime snapshot dist/.
#
# Usage: ./scripts/verify-against-snapshot.sh [tsc-args...]
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="${SNAPSHOT_DIST:-/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist}"
OUT="$REPO/dist"

cd "$REPO" || exit 2
rm -rf "$OUT"
./node_modules/.bin/tsc -p tsconfig.build.json "$@" > /tmp/tsc-out.txt 2>&1
TSC_RC=$?
if [ "$TSC_RC" -ne 0 ]; then
  echo "!! tsc exited $TSC_RC"
  cat /tmp/tsc-out.txt
fi

js_ok=0;  js_bad=0
dts_ok=0; dts_bad=0
map_ok=0; map_bad=0
missing=0

check() { # <subpath> <kind>
  local rel="$1" kind="$2"
  if [ ! -f "$OUT/$rel" ]; then echo "MISSING generated: $rel"; missing=$((missing+1)); return; fi
  if cmp -s "$OUT/$rel" "$SNAP/$rel"; then
    case $kind in js) js_ok=$((js_ok+1));; d.ts) dts_ok=$((dts_ok+1));; map) map_ok=$((map_ok+1));; esac
  else
    case $kind in js) js_bad=$((js_bad+1));; d.ts) dts_bad=$((dts_bad+1));; map) map_bad=$((map_bad+1));; esac
    echo "DIFF: $rel"
    diff -u "$SNAP/$rel" "$OUT/$rel" | head -40
  fi
}

for f in $(cd "$SNAP" && find . -name '*.js' | sed 's|^\./||' | sort); do
  [ "$f" = "main.js" ] || true
  check "$f" js
done
for f in $(cd "$SNAP" && find . -name '*.d.ts' | sed 's|^\./||' | sort); do
  check "$f" d.ts
done
for f in $(cd "$SNAP" && find . -name '*.js.map' | sed 's|^\./||' | sort); do
  check "$f" map
done

# extra generated files not present in the snapshot
for f in $(cd "$OUT" 2>/dev/null && find . -name '*.js' -o -name '*.d.ts' | sed 's|^\./||' | sort); do
  [ -f "$SNAP/$f" ] || echo "EXTRA (not in snapshot): $f"
done

echo
echo "== summary (tsc rc=$TSC_RC) =="
printf '  .js      identical : %d   differing: %d   missing: %d\n' "$js_ok" "$js_bad" "$missing"
printf '  .d.ts    identical : %d   differing: %d\n' "$dts_ok" "$dts_bad"
printf '  .js.map  identical : %d   differing: %d\n' "$map_ok" "$map_bad"
