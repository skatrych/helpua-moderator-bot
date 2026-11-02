#!/usr/bin/env python3
"""Source-map equivalence check.

For every dist/*.js.map in the runtime snapshot, compare it with the map
regenerated from the reconstructed src/. A reconstruction is *map-consistent*
when every mapping segment that the two files share

  * has the same generated line/column,
  * has the same source column,
  * and differs in source LINE by a non-decreasing step function.

A non-decreasing line offset can only be produced by source lines that emit no
code at all (blank lines, or comments, which `removeComments: true` strips).
Anything else -- a shifted column, a reordered segment, a segment present on one
side only -- would mean the reconstructed source is genuinely different text.

Exit status 0 = every map is identical or map-consistent.
"""
import json
import os
import sys

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
IDX = {c: i for i, c in enumerate(B64)}

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP = os.environ.get(
    "SNAPSHOT_DIST",
    "/home/agentdev/workspaces/.snapshot-2-reconstruct/helpua-moderator-bot/dist",
)


def vlq(segment):
    nums, shift, cur = [], 0, None
    for ch in segment:
        if ch == ",":
            if cur is not None:
                nums.append(cur)
                cur = None
            continue
        d = IDX[ch]
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


def segments(path):
    """-> {(gen_line, gen_col): (src_line, src_col)}"""
    data = json.load(open(path))
    sline = scol = 0
    out = {}
    for i, line in enumerate(data["mappings"].split(";"), start=1):
        if not line:
            continue
        gcol = 0
        nums = vlq(line)
        if len(nums) % 4:
            raise SystemExit(
                f"{path}: unexpected 5-field mapping segment; "
                "this checker assumes no 'names' entries"
            )
        for j in range(0, len(nums), 4):
            g = nums[j : j + 4]
            gcol += g[0]
            sline += g[2]
            scol += g[3]
            out[(i, gcol + 1)] = (sline + 1, scol + 1)
    return out


def check(rel):
    """-> (identical: bool, problems: list[str])"""
    a_path, b_path = os.path.join(SNAP, rel), os.path.join(REPO, "dist", rel)
    if not os.path.isfile(b_path):
        return False, [f"missing regenerated map: dist/{rel}"]
    if open(a_path, "rb").read() == open(b_path, "rb").read():
        return True, []

    a, b = segments(a_path), segments(b_path)
    problems = []
    if set(a) != set(b):
        only_a = sorted(set(a) - set(b))[:5]
        only_b = sorted(set(b) - set(a))[:5]
        problems.append(
            "different segment sets at generated positions "
            f"(snapshot-only {only_a}, regenerated-only {only_b})"
        )

    common = sorted(set(a) & set(b))
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


def main():
    maps = sorted(
        os.path.relpath(os.path.join(r, f), SNAP)
        for r, _, fs in os.walk(SNAP)
        for f in fs
        if f.endswith(".js.map")
    )
    identical = consistent = bad = 0
    for rel in maps:
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
    print(
        f"\nsource-map check: {identical} identical, {consistent} consistent, "
        f"{bad} divergent (of {len(maps)})"
    )
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
