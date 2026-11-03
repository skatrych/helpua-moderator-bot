#!/usr/bin/env bash
#
# Verification harness: compile the reconstructed src/ and compare the emitted
# artefacts byte-for-byte against the runtime snapshot's dist/.
#
# Usage:
#   SNAPSHOT_DIST=/path/to/snapshot/dist ./scripts/verify-against-snapshot.sh
#   ./scripts/verify-against-snapshot.sh [extra tsc args...]
#
# Exit status is meaningful and DISCRIMINATING, so that callers (and the
# self-test) can tell a broken check from a genuine finding:
#
#   0  the build reproduces the runtime snapshot
#   1  the check ran and found a real problem (tsc diagnostic, differing or
#      missing/extra artefact, divergent source map)
#   2  the check could not run at all (bad SNAPSHOT_DIST, missing compiler,
#      snapshot with nothing to compare)
#
# It is never 0 on an empty comparison.
#
# `.js.map` files are compared too, but a byte difference there is NOT by itself
# a failure: 4 of the 15 maps legitimately differ because the recovered source
# has a different number of comment/blank lines. Those are accepted only after
# scripts/check-sourcemap-equivalence.py has *proven* the difference is an
# offset that never changes direction and never moves a column. Any divergent
# map, and any missing or extra map, is a hard failure.
#
# See docs/RECONSTRUCTION.md sections 3 and 4.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# `-$`, not `:-$`: an explicitly EMPTY SNAPSHOT_DIST must be rejected rather
# than silently falling back to the default and comparing the wrong tree.
SNAP="${SNAPSHOT_DIST-/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist}"
OUT="$REPO/dist"
TSC="$REPO/node_modules/.bin/tsc"

fail()     { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
badinput() { printf 'BAD INPUT: %s\n' "$*" >&2; exit 2; }

# ── 1. Inputs must exist and be non-empty ───────────────────────────────────
[ -n "$SNAP" ]                 || badinput "SNAPSHOT_DIST is set but empty (unset it to use the default location)"
[ -d "$SNAP" ]                 || badinput "snapshot dist directory not found: $SNAP"
[ -x "$TSC" ]                  || badinput "compiler not found: $TSC (run 'npm ci' first)"

snap_js=$(find "$SNAP" -name '*.js'   -type f | sed "s|^$SNAP/||" | sort)
snap_dts=$(find "$SNAP" -name '*.d.ts' -type f | sed "s|^$SNAP/||" | sort)
snap_map=$(find "$SNAP" -name '*.js.map' -type f | sed "s|^$SNAP/||" | sort)

count() { [ -z "$1" ] && echo 0 || printf '%s\n' "$1" | wc -l | tr -d ' '; }

n_js=$(count "$snap_js"); n_dts=$(count "$snap_dts"); n_map=$(count "$snap_map")

# A snapshot with nothing to compare against proves nothing — that is exactly
# how a silently-passing verifier gets written.
[ "$n_js"  -gt 0 ] || badinput "snapshot has no .js artefacts: $SNAP"
[ "$n_dts" -gt 0 ] || badinput "snapshot has no .d.ts artefacts: $SNAP"
[ "$n_map" -gt 0 ] || badinput "snapshot has no .js.map artefacts: $SNAP"

# ── 2. Compile ─────────────────────────────────────────────────────────────
cd "$REPO" || badinput "cannot enter $REPO"
rm -rf "$OUT"

tsc_log=$(mktemp) || badinput "cannot create temp file"
trap 'rm -f "$tsc_log"' EXIT

"$TSC" -p tsconfig.build.json "$@" > "$tsc_log" 2>&1
tsc_rc=$?
if [ "$tsc_rc" -ne 0 ]; then
  cat "$tsc_log" >&2
  fail "tsc exited $tsc_rc (see diagnostics above). Note: with 'npm ci --ignore-scripts' the Prisma client is never generated and the build cannot succeed; run 'npx prisma generate'."
fi

# ── 3. File sets must match exactly, in both directions ─────────────────────
# An empty generated set would otherwise look like "0 files differ".
[ -d "$OUT" ] || fail "compiler produced no output directory: $OUT"

out_js=$(find "$OUT" -name '*.js'   -type f | sed "s|^$OUT/||" | sort)
out_dts=$(find "$OUT" -name '*.d.ts' -type f | sed "s|^$OUT/||" | sort)
out_map=$(find "$OUT" -name '*.js.map' -type f | sed "s|^$OUT/||" | sort)

[ -n "$out_js" ]  || fail "no .js generated into $OUT"
[ -n "$out_dts" ] || fail "no .d.ts generated into $OUT"
[ -n "$out_map" ] || fail "no .js.map generated into $OUT"

setstatus() { # <label> <snapshot-list> <generated-list>
  local label="$1" a="$2" b="$3"
  local only_snap only_out
  only_snap=$(comm -23 <(printf '%s\n' "$a") <(printf '%s\n' "$b"))
  only_out=$(comm -13 <(printf '%s\n' "$a") <(printf '%s\n' "$b"))
  if [ -n "$only_snap" ] || [ -n "$only_out" ]; then
    printf '%s\n' "$only_snap" | sed '/^$/d; s|^|  in snapshot, not generated: |' >&2
    printf '%s\n' "$only_out"  | sed '/^$/d; s|^|  generated, not in snapshot: |' >&2
    fail "$label file set does not match the snapshot"
  fi
}

setstatus ".js"    "$snap_js"  "$out_js"
setstatus ".d.ts"  "$snap_dts" "$out_dts"
setstatus ".js.map" "$snap_map" "$out_map"

# ── 4. Byte-for-byte comparison ────────────────────────────────────────────
js_bad=0;  dts_bad=0;  map_bad=0

for rel in $snap_js; do
  cmp -s "$SNAP/$rel" "$OUT/$rel" || { echo "  .js DIFFERS: $rel" >&2; js_bad=$((js_bad+1)); }
done
for rel in $snap_dts; do
  cmp -s "$SNAP/$rel" "$OUT/$rel" || { echo "  .d.ts DIFFERS: $rel" >&2; dts_bad=$((dts_bad+1)); }
done
for rel in $snap_map; do
  cmp -s "$SNAP/$rel" "$OUT/$rel" || map_bad=$((map_bad+1))
done

printf '== summary (tsc rc=%d, snapshot %s) ==\n' "$tsc_rc" "$SNAP"
printf '  .js      %d/%d identical, %d differing\n'   "$((n_js - js_bad))"   "$n_js"  "$js_bad"
printf '  .d.ts    %d/%d identical, %d differing\n'   "$((n_dts - dts_bad))" "$n_dts" "$dts_bad"
printf '  .js.map  %d/%d identical, %d differing (offset-only differences are adjudicated separately)\n' \
       "$((n_map - map_bad))" "$n_map" "$map_bad"

[ "$js_bad"  -eq 0 ] || fail "$js_bad .js file(s) differ from the runtime snapshot"
[ "$dts_bad" -eq 0 ] || fail "$dts_bad .d.ts file(s) differ from the runtime snapshot"

# ── 5. Source maps: differing bytes are allowed only when proven offset-only ─
if [ "$map_bad" -ne 0 ]; then
  echo
  echo "adjudicating $map_bad differing .js.map file(s)..."
  SNAPSHOT_DIST="$SNAP" python3 "$REPO/scripts/check-sourcemap-equivalence.py"
  map_rc=$?
  # Propagate, do not collapse: the checker's 1 (divergent) and 2 (could not
  # run) mean different things, and must stay distinguishable here too.
  [ "$map_rc" -eq 0 ] || { printf 'source-map checker rejected the build\n' >&2; exit "$map_rc"; }
  echo "OK: every .js.map difference is proven to be a non-semantic source-line offset."
else
  echo
  echo "all .js.map files byte-identical"
fi

echo "PASS: the build reproduces the runtime snapshot."
