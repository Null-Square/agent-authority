#!/usr/bin/env python3
"""Fail if a preregistered V1 mechanism blob changed after the freeze."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def git_blob(path: str) -> str:
    return subprocess.check_output(["git", "hash-object", path], text=True).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    failures = []
    rows = []
    for path, expected in manifest.get("frozen_blobs", {}).items():
        current = git_blob(path)
        ok = current == expected
        rows.append({"path": path, "expected": expected, "current": current, "ok": ok})
        if not ok:
            failures.append(path)
    result = {
        "protocol": manifest.get("protocol"),
        "frozen_at_commit": manifest.get("frozen_at_commit"),
        "validated": not failures,
        "files": rows,
        "failures": failures,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    if failures:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
