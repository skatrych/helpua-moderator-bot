#!/usr/bin/env bash
#
# Harness self-test: proves the two verification scripts are FAIL-CLOSED, and
# proves that *this* file can tell a working checker from a broken one.
#
# A verifier that prints a problem but exits 0 is worse than no verifier,
# because it manufactures the appearance of validation. Every case below feeds
# one of the verification scripts a deliberately broken input and asserts:
#
#   1. the exact exit status (1 = a real finding, 2 = the check could not run), and
#   2. a diagnostic substring in the output.
#
# Both are required on purpose. "Any non-zero exit" is not evidence: an empty
# snapshot, a missing compiler and a genuinely divergent file all produce
# non-zero exits for completely unrelated reasons, and a suite that cannot tell
# them apart cannot tell whether the check it claims to exercise ever ran.
#
# The final section runs a mutation control: it re-runs the divergent-map case
# against a deliberately broken copy of the checker (one whose verdict line is
# neutered) and requires the broken copy to ACCEPT. If it does not, the case is
# not exercising the verdict logic at all, and this file would be green while
# blind -- which is exactly the defect this suite was written to replace.
#
#   ./scripts/verify-verification-harness.sh
#
# Rebuilds dist/ several times; ends with a real verification run.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="${SNAPSHOT_DIST-/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist}"
VERIFY="$REPO/scripts/verify-against-snapshot.sh"
MAPCHK="$REPO/scripts/check-sourcemap-equivalence.py"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }
[ -d "$SNAP" ] || { echo "BAD INPUT: snapshot dist not found: $SNAP" >&2; exit 2; }

TMP=$(mktemp -d) || exit 2
trap 'rm -rf "$TMP"' EXIT

# Created up front, and asserted to exist: an "empty directory" case that is
# really a nonexistent-path case is the mistake this suite was written to fix.
mkdir -p "$TMP/emptydir"
[ -d "$TMP/emptydir" ] && [ -z "$(ls -A "$TMP/emptydir")" ] || {
  echo "setup failed: $TMP/emptydir is not an existing, empty directory" >&2; exit 2; }

passes=0
failures=0

expect() { # <desc> <want_rc> <output-regex> <cmd...>
  local desc="$1" want="$2" pat="$3"; shift 3
  "$@" > "$TMP/out" 2>&1
  local rc=$?

  if [ "$rc" -ne "$want" ]; then
    printf '  FAIL  %-54s exit %d, wanted %d\n' "$desc" "$rc" "$want"
    sed 's/^/          | /' "$TMP/out" | head -5
    failures=$((failures+1)); return
  fi
  if [ -n "$pat" ] && ! grep -qE "$pat" "$TMP/out"; then
    printf '  FAIL  %-54s exit %d but no %s in output\n' "$desc" "$rc" "$pat"
    printf '        -- the check exited %d for some other reason; the condition' "$rc"
    printf ' under test was not reached --\n'
    sed 's/^/          | /' "$TMP/out" | head -5
    failures=$((failures+1)); return
  fi
  printf '  PASS  %-54s exit %d%s\n' "$desc" "$rc" "${pat:+, diagnosed}"
  passes=$((passes+1))
}

rebuild() { SNAPSHOT_DIST="$SNAP" bash "$VERIFY" > /dev/null 2>&1; }

printf '== positive control ==\n'
if rebuild; then
  printf '  PASS  %-54s\n' "a correct build verifies successfully"
  passes=$((passes+1))
else
  printf '  FAIL  %-54s (a good build must pass)\n' "a correct build verifies successfully"
  sed 's/^/          | /' "$TMP/out" | head -20
  failures=$((failures+1))
fi

printf '\n== verifier: inputs it cannot run on (exit 2) ==\n'
expect "nonexistent SNAPSHOT_DIST" 2 'BAD INPUT.*not found' \
  env SNAPSHOT_DIST="$TMP/does-not-exist" bash "$VERIFY"

expect "existing but genuinely EMPTY SNAPSHOT_DIST" 2 'no .js artefacts' \
  env SNAPSHOT_DIST="$TMP/emptydir" bash "$VERIFY"

expect "SNAPSHOT_DIST set but empty string" 2 'BAD INPUT.*empty' \
  env SNAPSHOT_DIST="" bash "$VERIFY"

mkdir -p "$TMP/maps-only"
cp "$(find "$SNAP" -name '*.js.map' | head -1)" "$TMP/maps-only/"
expect "snapshot with .js.map but no .js" 2 'no .js artefacts' \
  env SNAPSHOT_DIST="$TMP/maps-only" bash "$VERIFY"

printf '\n== verifier: compiler failure (exit 1) ==\n'
expect "tsc rejects an unknown flag" 1 'tsc exited [1-9]' \
  env SNAPSHOT_DIST="$SNAP" bash "$VERIFY" --no-such-flag-xyz

expect "tsc given an unreadable tsconfig" 1 'tsc exited [1-9]' \
  env SNAPSHOT_DIST="$SNAP" bash "$VERIFY" -p /nonexistent/tsconfig.json

rebuild   # restore a valid dist/ for the cases below

printf '\n== verifier: artefact mismatches (exit 1) ==\n'
mkdir -p "$TMP/extra" && cp -a "$SNAP/." "$TMP/extra/"
cp "$TMP/extra/main.js" "$TMP/extra/bogus-extra.js"
expect "snapshot expects a .js the build never emits" 1 'file set does not match' \
  env SNAPSHOT_DIST="$TMP/extra" bash "$VERIFY"

mkdir -p "$TMP/pruned" && cp -a "$SNAP/." "$TMP/pruned/"
rm -f "$TMP/pruned/main.js" "$TMP/pruned/main.d.ts" "$TMP/pruned/main.js.map"
expect "build emits a file absent from the snapshot" 1 'file set does not match' \
  env SNAPSHOT_DIST="$TMP/pruned" bash "$VERIFY"

mkdir -p "$TMP/tampered" && cp -a "$SNAP/." "$TMP/tampered/"
printf '\n' >> "$TMP/tampered/app.service.js"
expect "emitted .js bytes differ from the snapshot" 1 '.js DIFFERS' \
  env SNAPSHOT_DIST="$TMP/tampered" bash "$VERIFY"

mkdir -p "$TMP/tampered-dts" && cp -a "$SNAP/." "$TMP/tampered-dts/"
printf '\n' >> "$TMP/tampered-dts/app.module.d.ts"
expect "emitted .d.ts bytes differ from the snapshot" 1 '.d.ts DIFFERS' \
  env SNAPSHOT_DIST="$TMP/tampered-dts" bash "$VERIFY"

printf '\n== map checker alone: inputs it cannot run on (exit 2) ==\n'
expect "nonexistent snapshot directory" 2 'ERROR: snapshot directory does not exist' \
  env SNAPSHOT_DIST="$TMP/does-not-exist" python3 "$MAPCHK"

expect "existing but genuinely EMPTY snapshot directory" 2 'contains no .js.map' \
  env SNAPSHOT_DIST="$TMP/emptydir" python3 "$MAPCHK"

expect "regenerated dist/ removed" 2 'regenerated .* directory does not exist' \
  env SNAPSHOT_DIST="$SNAP" bash -c "mv '$REPO/dist' '$TMP/dist-stash'; python3 '$MAPCHK'; rc=\$?; mv '$TMP/dist-stash' '$REPO/dist'; exit \$rc"

mkdir -p "$TMP/malformed" && cp -a "$SNAP/." "$TMP/malformed/"
printf '{ this is not json' > "$TMP/malformed/main.js.map"
expect "malformed JSON in a .js.map" 2 'not valid JSON' \
  env SNAPSHOT_DIST="$TMP/malformed" python3 "$MAPCHK"

printf '\n== map checker alone: genuine divergence (exit 1) ==\n'
# dist/ must be present and current, or the checker bails out on the missing
# tree and never reaches the map comparison this case exists to exercise.
rebuild
if [ ! -f "$REPO/dist/app.module.js.map" ]; then
  printf '  FAIL  %-54s no generated dist to compare against\n' "precondition for divergence cases"
  failures=$((failures+1))
fi

mkdir -p "$TMP/mapswap" && cp -a "$SNAP/." "$TMP/mapswap/"
cp "$(find "$SNAP" -name '*.js.map' | head -1)" "$TMP/mapswap/app.module.js.map"
expect "a .js.map belonging to a different source file" 1 'DIVERGENT.*app.module.js.map' \
  env SNAPSHOT_DIST="$TMP/mapswap" python3 "$MAPCHK"

mkdir -p "$TMP/map-extra" && cp -a "$SNAP/." "$TMP/map-extra/"
cp "$SNAP/main.js.map" "$TMP/map-extra/bogus.js.map"
expect "an extra .js.map in the snapshot" 1 'not generated' \
  env SNAPSHOT_DIST="$TMP/map-extra" python3 "$MAPCHK"

mkdir -p "$TMP/map-missing" && cp -a "$SNAP/." "$TMP/map-missing/"
rm -f "$TMP/map-missing/app.service.js.map"
expect "a .js.map missing from the snapshot" 1 'not in snapshot' \
  env SNAPSHOT_DIST="$TMP/map-missing" python3 "$MAPCHK"

printf '\n== positive control: legitimate offsets are still accepted ==\n'
rebuild
expect "the four known offset-only .js.map differences" 0 '0 divergent' \
  env SNAPSHOT_DIST="$SNAP" python3 "$MAPCHK"

printf '\n== mutation control: does this suite notice a blind checker? ==\n'
# Neuter the checker's verdict line in memory and re-run the divergent case.
# The mutant MUST accept (exit 0): that is what proves the exit-1 asserted above
# comes from the verdict logic rather than from an unrelated early bail-out.
MUT_LOG="$TMP/mutant.log"
python3 - "$MAPCHK" "$TMP/mapswap" > "$MUT_LOG" 2>&1 <<'PY'
import sys, os
path, snap = sys.argv[1], sys.argv[2]
src = open(path).read()
target = "    return 1 if bad else 0"
if target not in src:
    print("MUTATION_NOT_APPLICABLE")   # checker shape changed; this control is stale
    sys.exit(3)
mutated = src.replace(target, "    return 0")
if mutated == src:
    print("MUTATION_NOT_APPLICABLE")
    sys.exit(3)
os.environ["SNAPSHOT_DIST"] = snap
# __file__ must stay the real path so the checker resolves REPO, and dist/, itself.
exec(compile(mutated, path, "exec"), {"__name__": "__main__", "__file__": path})
PY
mut_rc=$?
if [ "$mut_rc" -eq 0 ]; then
  printf '  PASS  %-54s exits 0 on divergent maps, as a broken checker must\n' \
         "neutered checker ACCEPTS the divergence"
  printf '        => the exit 1 asserted above is produced by the verdict logic.\n'
  passes=$((passes+1))
elif [ "$mut_rc" -eq 3 ]; then
  printf '  FAIL  %-54s mutation no longer applies; refresh this control\n' \
         "neutered checker ACCEPTS the divergence"
  failures=$((failures+1))
else
  printf '  FAIL  %-54s mutant exited %d -- it still rejected, so the case above\n' \
         "neutered checker ACCEPTS the divergence" "$mut_rc"
  printf '        is not reaching the verdict logic, so the exit 1 above is vacuous.\n'
  sed 's/^/          | /' "$MUT_LOG" | head -5
  failures=$((failures+1))
fi


printf '\nfinal verification run (leaves dist/ verified)...\n'
if rebuild; then
  printf '  ok\n'
else
  printf '  !! final verification FAILED\n'
  failures=$((failures+1))
fi

printf '\nharness self-test: %d passed, %d failed\n' "$passes" "$failures"
[ "$failures" -eq 0 ] || exit 1
exit 0
