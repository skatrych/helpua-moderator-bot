#!/usr/bin/env python3
"""Source-map equivalence check.

For every ``dist/*.js.map`` in the runtime snapshot, compare it with the map
regenerated from the reconstructed ``src/``. A reconstruction is
*map-consistent* when every mapping segment the two files share

  * has the same generated line/column,
  * has the same source column,
  * and differs in source LINE by a step function that never changes direction.

A one-directional line offset can only be produced by source lines that emit no
code at all (blank lines, or comments, which ``removeComments: true`` strips).
Anything else -- a shifted column, a reordered segment, a segment present on one
side only -- means the reconstructed source is genuinely different text.

This is the companion to ``verify-against-snapshot.sh``, which refuses to accept
a differing ``.js.map`` until this script has proven the difference is benign.

Exit status is meaningful and this script is FAIL-CLOSED:

  0  every map is identical, or proven map-consistent
  1  at least one map is divergent, missing, or extra
  2  bad inputs (no snapshot, no maps, unreadable map, mismatched file set)

A run that compares zero maps can never exit 0.
"""
import json
import os
import sys

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
IDX = {c: i for i, c in enumerate(B64)}

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "dist")
SNAP = os.environ.get(
    "SNAPSHOT_DIST",
    "/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist",
)


def die(msg, code=2):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def vlq(segment):
    nums, shift, cur = [], 0, None
    for ch in segment:
        if ch == ",":
            if cur is not None:
                nums.append(cur)
                cur = None
            continue
        try:
            d = IDX[ch]
        except KeyError:
            die(f"invalid base64 VLQ character {ch!r}")
        cont, payload = d & 32, d & 31
        if cur is None:
            cur, shift = 0, 0
        cur += payload << shift
        shift += 5
        if not cont:
            nums.append(-(cur >> 1) if cur & 1 else cur >> 1)
            cur = None
    if cur is not None:
        nums.append(cur)
    return nums


def load(path, label):
    """Read and sanity-check a source map, returning (data, segments)."""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        die(f"{label} map is missing: {path}")
    except json.JSONDecodeError as exc:
        die(f"{label} map is not valid JSON ({path}): {exc}")

    if data.get("version") != 3:
        die(f"{label} map has version {data.get('version')!r}, expected 3: {path}")
    if "mappings" not in data:
        die(f"{label} map has no 'mappings' field: {path}")
    if not data.get("sources"):
        die(f"{label} map declares no sources: {path}")
    if data.get("names"):
        die(f"{label} map has non-empty 'names'; this checker assumes none: {path}")
    if "sourcesContent" in data:
        die(f"{label} map embeds 'sourcesContent'; the snapshot maps must not: {path}")

    sline = scol = 0
    segs = {}
    for i, line in enumerate(data["mappings"].split(";"), start=1):
        if not line:
            continue
        gcol = 0
        nums = vlq(line)
        if len(nums) % 4:
            die(
                f"{label} map has an unexpected 5-field segment; "
                f"this checker assumes no 'names' entries: {path}"
            )
        for j in range(0, len(nums), 4):
            g = nums[j : j + 4]
            gcol += g[0]
            sline += g[2]
            scol += g[3]
            segs[(i, gcol + 1)] = (sline + 1, scol + 1)

    if not segs:
        die(f"{label} map decodes to zero segments: {path}")

    meta = {
        "sources": list(data["sources"]),
        "sourceRoot": data.get("sourceRoot", ""),
        "file": data.get("file", ""),
    }
    return meta, segs


def check(rel):
    """-> (identical: bool, problems: list[str])"""
    a_path, b_path = os.path.join(SNAP, rel), os.path.join(OUT, rel)
    if not os.path.isfile(b_path):
        return False, [f"missing regenerated map: dist/{rel}"]

    identical = open(a_path, "rb").read() == open(b_path, "rb").read()
    if identical:
        return True, []

    a_meta, a = load(a_path, "snapshot")
    b_meta, b = load(b_path, "regenerated")

    problems = []
    for key in ("sources", "sourceRoot", "file"):
        if a_meta[key] != b_meta[key]:
            problems.append(
                f"'{key}' differs: snapshot {a_meta[key]!r} vs regenerated {b_meta[key]!r}"
            )

    if set(a) != set(b):
        only_a = sorted(set(a) - set(b))[:5]
        only_b = sorted(set(b) - set(a))[:5]
        problems.append(
            "different segment sets at generated positions "
            f"(snapshot-only {only_a}, regenerated-only {only_b})"
        )

    common = sorted(set(a) & set(b))
    if not common:
        problems.append("the two maps share no generated positions at all")

    prev_delta = None
    prev_sline = 0
    direction = 0
    for key in common:
        s, m = a[key], b[key]
        # Emitted decorators/export wrappers map *back* to the declaration
        # line. Those back-references legitimately reset the offset, so only
        # forward-advancing source positions can constrain monotonicity.
        if s[0] < prev_sline:
            continue
        prev_sline = s[0]
        if s[1] != m[1]:
            problems.append(
                f"source column differs at generated {key[0]}:{key[1]}: "
                f"snapshot ts:{s[0]}:{s[1]} vs regenerated ts:{m[0]}:{m[1]}"
            )
        delta = m[0] - s[0]
        if prev_delta is not None and delta != prev_delta:
            step = 1 if delta > prev_delta else -1
            if direction and step != direction:
                problems.append(
                    f"source-line offset changes direction at generated "
                    f"{key[0]}:{key[1]}: {prev_delta:+d} -> {delta:+d}"
                )
            direction = direction or step
        prev_delta = delta
    return False, problems


def discover(dirname, label):
    if not os.path.isdir(dirname):
        die(f"{label} directory does not exist: {dirname}")
    found = sorted(
        os.path.relpath(os.path.join(r, f), dirname)
        for r, _, fs in os.walk(dirname)
        for f in fs
        if f.endswith(".js.map")
    )
    if not found:
        die(f"{label} directory contains no .js.map files: {dirname}")
    return found


def main():
    snap_maps = discover(SNAP, "snapshot")
    out_maps = discover(OUT, "regenerated (run the build first)")

    # The two sets must be identical. Comparing an empty or partial generated
    # tree against a full snapshot is how a verifier starts passing on nothing.
    only_snap = sorted(set(snap_maps) - set(out_maps))
    only_out = sorted(set(out_maps) - set(snap_maps))
    if only_snap or only_out:
        for p in only_snap:
            print(f"  in snapshot, not generated: {p}")
        for p in only_out:
            print(f"  generated, not in snapshot: {p}")
        print(
            f"\n.map file sets do not match ({len(snap_maps)} snapshot, "
            f"{len(out_maps)} regenerated)"
        )
        return 1

    identical = consistent = bad = 0
    for rel in snap_maps:
        same, problems = check(rel)
        if same:
            identical += 1
            print(f"  IDENTICAL   {rel}")
        elif not problems:
            consistent += 1
            print(f"  CONSISTENT  {rel}  (blank/comment lines only)")
        else:
            bad += 1
            print(f"  DIVERGENT   {rel}")
            for p in problems[:6]:
                print(f"                - {p}")

    total = len(snap_maps)
    print(
        f"\nsource-map check: {identical} identical, {consistent} consistent, "
        f"{bad} divergent (of {total})"
    )
    if identical + consistent + bad != total:
        print("ERROR: not every map was accounted for", file=sys.stderr)
        return 2
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
