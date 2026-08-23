#!/usr/bin/env python3
"""Extract a small, representative AgentDojo Slack task set without running an LLM.

This script deliberately uses AgentDojo's own task objects and default environment.
The resulting JSON is an oracle/upper-bound input for the Agent Authority mapping
benchmark. It is not a model-in-the-loop security result.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

# Import the v1 task registrations first, then the v1.2 updates. Slack has no
# v1.2.1/v1.2.2 task overrides, so selecting benchmark_version=(1, 2, 2)
# yields the v1.2.2-compatible Slack task set.
import agentdojo.default_suites.v1.slack.user_tasks  # noqa: F401
import agentdojo.default_suites.v1_2.slack.user_tasks  # noqa: F401
from agentdojo.default_suites.v1.slack.task_suite import task_suite

BENCHMARK_VERSION = (1, 2, 2)
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
    suite = task_suite.get_new_version(BENCHMARK_VERSION)
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
                "benchmark_version": "v1.2.2",
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
