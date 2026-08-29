#!/usr/bin/env python3
"""Validate the journal workspace without network access or paid model calls."""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "figures"

EXPECTED_FIGURES = [
    "fig01-system-boundary",
    "fig02-selection-witness",
    "fig03-authority-state",
    "fig04-methodology",
    "fig05-deterministic-results",
    "fig06-live-results",
]

EXPECTED_CLAIMS = [
    "60/60",
    "36/36",
    "1/36",
    "370/370",
    "230/230",
    "372",
    "61",
    "84.41",
    "82.26",
    "2.15",
    "5,088",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def check_figures() -> None:
    for stem in EXPECTED_FIGURES:
        svg_path = FIG / f"{stem}.svg"
        html_path = FIG / f"{stem}.html"
        if not svg_path.exists():
            fail(f"missing {svg_path.relative_to(ROOT)}")
        if not html_path.exists():
            fail(f"missing {html_path.relative_to(ROOT)}")

        try:
            tree = ET.parse(svg_path)
        except ET.ParseError as exc:
            fail(f"invalid SVG XML in {svg_path.name}: {exc}")

        root = tree.getroot()
        tags = {node.tag.split("}")[-1] for node in root.iter()}
        forbidden = {"image", "linearGradient", "radialGradient", "filter"}
        found = sorted(tags & forbidden)
        if found:
            fail(f"{svg_path.name} uses forbidden raster/decorative SVG tags: {found}")

        html = html_path.read_text(encoding="utf-8")
        if f'{stem}.svg' not in html:
            fail(f"{html_path.name} does not reference its SVG master")

    print(f"PASS: {len(EXPECTED_FIGURES)} SVG/HTML figure pairs are valid and raster-free")


def check_highlights() -> None:
    path = ROOT / "highlights.txt"
    items = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not 3 <= len(items) <= 5:
        fail(f"Elsevier highlights must contain 3-5 items; found {len(items)}")
    too_long = [(len(item), item) for item in items if len(item) > 85]
    if too_long:
        fail(f"Elsevier highlights exceed 85 characters: {too_long}")
    print("PASS: Elsevier highlights count and length")


def check_main() -> None:
    path = ROOT / "main.tex"
    text = path.read_text(encoding="utf-8")

    if "\\documentclass[5p,times,twocolumn]{elsarticle}" not in text:
        fail("main.tex is not using the expected Elsevier elsarticle working layout")

    keyword_match = re.search(r"\\begin\{keyword\}(.*?)\\end\{keyword\}", text, re.S)
    if not keyword_match:
        fail("keyword block not found")
    keywords = [x.strip() for x in keyword_match.group(1).split("\\sep") if x.strip()]
    if len(keywords) > 6:
        fail(f"Elsevier working rule is max 6 keywords; found {len(keywords)}: {keywords}")

    for claim in EXPECTED_CLAIMS:
        if claim not in text:
            fail(f"expected frozen-result token missing from manuscript: {claim}")

    forbidden_claims = [
        "prompt injection is solved",
        "all 5,088 live runs completed",
        "scientific_go passed",
    ]
    lower = text.lower()
    for claim in forbidden_claims:
        # Negative statements containing these phrases are allowed only if prefixed nearby by a negation.
        idx = lower.find(claim.lower())
        if idx >= 0:
            context = lower[max(0, idx - 80):idx]
            if not any(token in context for token in ("not ", "does not ", "do not ", "did not ")):
                fail(f"unsafe claim appears without nearby qualification: {claim}")

    print(f"PASS: main.tex structure, {len(keywords)} keywords, and frozen-result anchors")


def check_submission_directory() -> None:
    submission = ROOT / "submission"
    if submission.exists():
        nested = [p for p in submission.rglob("*") if p.is_file() and p.parent != submission]
        if nested:
            fail("paper/submission must be flat for Elsevier Editorial Manager")
    print("PASS: submission export is absent or flat")


def main() -> None:
    check_figures()
    check_highlights()
    check_main()
    check_submission_directory()
    print("PASS: manuscript workspace validation complete")


if __name__ == "__main__":
    main()
