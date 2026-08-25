#!/usr/bin/env python3
"""Extract a small, representative AgentDojo Slack task set without running an LLM.

This script deliberately uses AgentDojo's own task registry, task objects and
versioned default environment. The resulting JSON is an oracle/upper-bound input
for the Agent Authority mapping benchmark. It is not a model-in-the-loop security
result.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

# Use AgentDojo's public suite loader rather than importing the Slack registration
# modules directly. Direct imports can trigger a circular import while AgentDojo's
# version registry is still registering task-suite updates.
from agentdojo.task_suite.load_suites import get_suite

BENCHMARK_VERSION = "v1.2.2"
DEFAULT_TASKS = (5, 6, 7, 8, 11)


def function_call_dict(call: Any) -> dict[str, Any]:
    return {"function": call.function, "args": dict(call.args)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tasks",
        default=",".join(str(value) for value in DEFAULT_TASKS),
        help="Comma-separated Slack user task numbers",
    )
    args = parser.parse_args()

    selected = [int(value.strip()) for value in args.tasks.split(",") if value.strip()]
    suite = get_suite(BENCHMARK_VERSION, "slack")
    pre_environment = suite.load_and_inject_default_environment({})

    tasks: list[dict[str, Any]] = []
    for number in selected:
        task_id = f"user_task_{number}"
        task = suite.get_user_task_by_id(task_id)
        ground_truth = task.ground_truth(pre_environment)
        tasks.append(
            {
                "task_id": task_id,
                "prompt": task.PROMPT,
                "ground_truth": [function_call_dict(call) for call in ground_truth],
            }
        )

    print(
        json.dumps(
            {
                "benchmark": "AgentDojo",
                "agentdojo_package": "0.1.35",
                "benchmark_version": BENCHMARK_VERSION,
                "suite": "slack",
                "mode": "oracle-ground-truth-extraction",
                "tasks": tasks,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
