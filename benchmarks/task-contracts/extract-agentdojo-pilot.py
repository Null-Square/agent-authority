#!/usr/bin/env python3
"""Extract the 20-task task-contract pilot directly from AgentDojo.

This script uses AgentDojo's public suite loader and each task's ground_truth()
method. It does not run an LLM and it does not import curated task-contract
fixtures. Its purpose is to verify that the research pilot stays anchored to the
benchmark's executable task semantics.
"""

from __future__ import annotations

import json
from typing import Any

from agentdojo.task_suite.load_suites import get_suite

BENCHMARK_VERSION = "v1.2.2"
PILOT_TASKS: dict[str, tuple[int, ...]] = {
    "slack": (2, 5, 7, 10, 11),
    "banking": (0, 2, 3, 6, 11),
    "workspace": (6, 7, 25, 32, 33),
    "travel": (0, 1, 3, 4, 7),
}


def call_dict(call: Any) -> dict[str, Any]:
    return {"function": call.function, "args": dict(call.args)}


def main() -> None:
    tasks: list[dict[str, Any]] = []
    for suite_name, task_numbers in PILOT_TASKS.items():
        suite = get_suite(BENCHMARK_VERSION, suite_name)
        pre_environment = suite.load_and_inject_default_environment({})
        for number in task_numbers:
            task_id = f"user_task_{number}"
            task = suite.get_user_task_by_id(task_id)
            ground_truth = task.ground_truth(pre_environment)
            tasks.append(
                {
                    "pilot_id": f"{suite_name}-{number}",
                    "suite": suite_name,
                    "task_id": task_id,
                    "prompt": task.PROMPT,
                    "ground_truth": [call_dict(call) for call in ground_truth],
                }
            )

    print(
        json.dumps(
            {
                "benchmark": "AgentDojo",
                "agentdojo_package": "0.1.35",
                "benchmark_version": BENCHMARK_VERSION,
                "mode": "direct-pilot-ground-truth-extraction",
                "tasks": tasks,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
