#!/usr/bin/env python3
"""Audit benchmark prompt/trace consistency without changing task contracts.

This is a diagnostic, not a benchmark patch. It looks for two narrow signals
that matter when a security contract is synthesized from a demonstration:

1. explicit-year conflicts: a mutation trace contains a year that contradicts
   the explicit year(s) in the user prompt;
2. trace-introduced clock precision: the mutation trace fixes an HH:MM time
   even though the prompt contains no explicit clock time.

The second signal is not necessarily an error. It is reported as a semantic
narrowing risk because a single demonstration may choose an implementation
 detail that the user did not actually authorize as a requirement.
"""

from __future__ import annotations

import json
import re
from typing import Any

from agentdojo.task_suite.load_suites import get_suite

BENCHMARK_VERSION = "v1.2.2"
SUITES = ("slack", "banking", "workspace", "travel")
MUTATION_RE = re.compile(
    r"^(add_|append_|archive_|book_|cancel_|create_|delete_|edit_|invite_|move_|post_|remove_|reserve_|reschedule_|schedule_|send_|share_|transfer_|update_)"
)
YEAR_RE = re.compile(r"\b20\d{2}\b")
DATETIME_RE = re.compile(r"\b20\d{2}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}\b")
CLOCK_RE = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b", re.I)


def strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        out: list[str] = []
        for item in value.values():
            out.extend(strings(item))
        return out
    if isinstance(value, (list, tuple, set)):
        out = []
        for item in value:
            out.extend(strings(item))
        return out
    return []


def call_record(call) -> dict[str, Any]:
    return {"function": call.function, "args": call.args}


def main() -> None:
    rows = []
    mutation_tasks = 0
    for suite_name in SUITES:
        suite = get_suite(BENCHMARK_VERSION, suite_name)
        for task_id in sorted(suite.user_tasks):
            task = suite.get_user_task_by_id(task_id)
            environment = suite.load_and_inject_default_environment({})
            pre = task.init_environment(environment)
            calls = task.ground_truth(pre)
            mutations = [call_record(call) for call in calls if MUTATION_RE.match(call.function)]
            if not mutations:
                continue
            mutation_tasks += 1

            prompt = task.PROMPT
            prompt_years = sorted(set(YEAR_RE.findall(prompt)))
            mutation_text = [text for mutation in mutations for text in strings(mutation["args"])]
            mutation_years = sorted({year for text in mutation_text for year in YEAR_RE.findall(text)})
            mutation_datetimes = sorted({value for text in mutation_text for value in DATETIME_RE.findall(text)})
            extra_trace_years = sorted(set(mutation_years) - set(prompt_years)) if prompt_years else []
            year_conflict = bool(prompt_years and extra_trace_years)
            trace_introduced_time = bool(mutation_datetimes and not CLOCK_RE.search(prompt))

            if year_conflict or trace_introduced_time:
                rows.append(
                    {
                        "id": f"{suite_name}-{int(task_id.rsplit('_', 1)[1])}",
                        "suite": suite_name,
                        "task_id": task_id,
                        "prompt": prompt,
                        "prompt_years": prompt_years,
                        "mutation_years": mutation_years,
                        "extra_trace_years": extra_trace_years,
                        "mutation_datetimes": mutation_datetimes,
                        "year_conflict": year_conflict,
                        "trace_introduced_time": trace_introduced_time,
                        "mutation_calls": mutations,
                    }
                )

    report = {
        "benchmark": BENCHMARK_VERSION,
        "suites": list(SUITES),
        "mutation_tasks": mutation_tasks,
        "year_conflict_tasks": sum(row["year_conflict"] for row in rows),
        "trace_introduced_time_tasks": sum(row["trace_introduced_time"] for row in rows),
        "rows": rows,
        "interpretation": {
            "year_conflict": "prompt and mutation trace disagree on an explicit year; do not promote the trace to authority without review",
            "trace_introduced_time": "trace fixes clock precision absent from the prompt; treat as a possible demonstration-specific narrowing, not automatically as user intent",
        },
    }
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
