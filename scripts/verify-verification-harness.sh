#!/usr/bin/env bash
#
# Harness self-test: proves the two verification scripts are FAIL-CLOSED.
#
# A verifier that prints a problem but exits 0 is worse than no verifier,
# because it manufactures an appearance of validation. Each case below feeds a
# verification script a deliberately broken input and asserts a non-zero exit.
#
#   ./scripts/verify-verification-harness.sh
#
# Exit 0 only if every expected failure failed and the positive control passed.
# Rebuilds dist/ several times; finishes with a real verification run.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="${SNAPSHOT_DIST-/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist}"
VERIFY="$REPO/scripts/verify-against-snapshot.sh"
MAPCHK="$REPO/scripts/check-sourcemap-equivalence.py"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }

TMP=$(mktemp -d) || exit 2
trap 'rm -rf "$TMP"' EXIT

passes=0
failures=0

# expect_fail <description> -- env assignments are passed via SNAPSHOT_DIST
run_expect() { # <description> <expected: nonzero> <cmd...>
  local desc="$1"; shift
  "$@" > "$TMP/out" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '  PASS  %-58s (exit %d)\n' "$desc" "$rc"
    passes=$((passes+1))
  else
    printf '  FAIL  %-58s (exit 0, expected non-zero)\n' "$desc"
    failures=$((failures+1))
    sed 's/^/          | /' "$TMP/out" | head -6
  fi
}

printf '== positive control ==\n'
if SNAPSHOT_DIST="$SNAP" bash "$VERIFY" > "$TMP/out" 2>&1; then
  printf '  PASS  %-58s\n' "a correct build verifies successfully"
  passes=$((passes+1))
else
  printf '  FAIL  %-58s (a good build must pass)\n' "a correct build verifies successfully"
  failures=$((failures+1))
  sed 's/^/          | /' "$TMP/out" | head -20
fi

printf '\n== missing / empty inputs ==\n'
run_expect "SNAPSHOT_DIST pointing at a nonexistent path" \
  env SNAPSHOT_DIST="$TMP/does-not-exist" bash "$VERIFY"

run_expect "SNAPSHOT_DIST pointing at an existing but empty directory" \
  env SNAPSHOT_DIST="$TMP/emptydir" bash "$VERIFY"

run_expect "SNAPSHOT_DIST unset-but-empty is rejected" \
  env SNAPSHOT_DIST="" bash "$VERIFY"

mkdir -p "$TMP/maps-only"
cp "$(find "$SNAP" -name '*.js.map' | head -1)" "$TMP/maps-only/"
run_expect "snapshot with .js.map but no .js is rejected" \
  env SNAPSHOT_DIST="$TMP/maps-only" bash "$VERIFY"

printf '\n== compiler failure ==\n'
run_expect "tsc rejecting an unknown flag fails the run" \
  env SNAPSHOT_DIST="$SNAP" bash "$VERIFY" --no-such-flag-xyz

run_expect "an unparseable tsconfig fails the run" \
  env SNAPSHOT_DIST="$SNAP" bash "$VERIFY" -p /nonexistent/tsconfig.json

# Rebuild so later cases start from a real dist/.
SNAPSHOT_DIST="$SNAP" bash "$VERIFY" > /dev/null 2>&1

printf '\n== file-set and content mismatch ==\n'
# A snapshot that expects one more file than the build produces.
mkdir -p "$TMP/extra" && cp -a "$SNAP/." "$TMP/extra/"
cp "$TMP/extra/main.js" "$TMP/extra/bogus-extra.js"
run_expect "snapshot expects a .js the build never emits" \
  env SNAPSHOT_DIST="$TMP/extra" bash "$VERIFY"

# A snapshot missing a file the build produces -> extra generated file.
mkdir -p "$TMP/pruned" && cp -a "$SNAP/." "$TMP/pruned/"
rm -f "$TMP/pruned/main.js" "$TMP/pruned/main.d.ts" "$TMP/pruned/main.js.map"
run_expect "build emits a file absent from the snapshot" \
  env SNAPSHOT_DIST="$TMP/pruned" bash "$VERIFY"

# Same file set, different bytes.
mkdir -p "$TMP/tampered" && cp -a "$SNAP/." "$TMP/tampered/"
printf '\n' >> "$TMP/tampered/app.service.js"
run_expect "emitted .js bytes differ from the snapshot" \
  env SNAPSHOT_DIST="$TMP/tampered" bash "$VERIFY"

mkdir -p "$TMP/tampered-dts" && cp -a "$SNAP/." "$TMP/tampered-dts/"
printf '\n' >> "$TMP/tampered-dts/app.module.d.ts"
run_expect "emitted .d.ts bytes differ from the snapshot" \
  env SNAPSHOT_DIST="$TMP/tampered-dts" bash "$VERIFY"

printf '\n== source-map checker, on its own ==\n'
run_expect "map checker on a nonexistent snapshot directory" \
  env SNAPSHOT_DIST="$TMP/does-not-exist" python3 "$MAPCHK"

run_expect "map checker on an empty snapshot directory" \
  env SNAPSHOT_DIST="$TMP/emptydir" python3 "$MAPCHK"

run_expect "map checker when dist/ has been removed" \
  env SNAPSHOT_DIST="$SNAP" bash -c "rm -rf '$REPO/dist'; python3 '$MAPCHK'"

# Point the map checker at a snapshot whose map is really a different file's map.
mkdir -p "$TMP/mapswap" && cp -a "$SNAP/." "$TMP/mapswap/"
cp "$(find "$SNAP" -name '*.js.map' | head -1)" "$TMP/mapswap/app.module.js.map"
run_expect "map checker rejects a swapped/divergent .js.map" \
  env SNAPSHOT_DIST="$TMP/mapswap" python3 "$MAPCHK"

printf '\n== proven-offset-only maps must still be accepted ==\n'
# The case above deliberately removes dist/ (that is the point of it), so the
# build must be put back before this standalone positive control runs.
SNAPSHOT_DIST="$SNAP" bash "$VERIFY" > /dev/null 2>&1
# The four maps that legitimately differ must not make the real run fail.
if SNAPSHOT_DIST="$SNAP" python3 "$MAPCHK" > "$TMP/out" 2>&1; then
  printf '  PASS  %-58s\n' "the known offset-only .js.map differences are accepted"
  passes=$((passes+1))
else
  printf '  FAIL  %-58s\n' "the known offset-only .js.map differences are accepted"
  failures=$((failures+1))
  sed 's/^/          | /' "$TMP/out" | head -20
fi

printf '\nfinal verification run (leaves dist/ in a verified state)...\n'
if SNAPSHOT_DIST="$SNAP" bash "$VERIFY" > "$TMP/final" 2>&1; then
  tail -5 "$TMP/final" | sed 's/^/  /'
else
  printf '  !! final verification FAILED\n'
  tail -20 "$TMP/final" | sed 's/^/  /'
  failures=$((failures+1))
fi

printf '\nharness self-test: %d passed, %d failed\n' "$passes" "$failures"
[ "$failures" -eq 0 ] || exit 1
exit 0
