#!/usr/bin/env python3
"""Extract and execute the 20-task task-contract pilot directly from AgentDojo.

This script uses AgentDojo's public suite loader, each task's ground_truth(),
and the benchmark FunctionsRuntime. It does not import curated task-contract
fixtures. In addition to the canonical ground-truth calls, it records each real
tool result so the research harness can test whether later authority-relevant
arguments can be grounded in prior authorized execution evidence.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from agentdojo.functions_runtime import FunctionsRuntime
from agentdojo.task_suite.load_suites import get_suite

BENCHMARK_VERSION = "v1.2.2"
PILOT_TASKS: dict[str, tuple[int, ...]] = {
    "slack": (2, 5, 7, 10, 11),
    "banking": (0, 2, 3, 6, 11),
    "workspace": (6, 7, 25, 32, 33),
    "travel": (0, 1, 3, 4, 7),
}


def jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump(mode="json"))
    return str(value)


def call_dict(call: Any) -> dict[str, Any]:
    return {"function": call.function, "args": jsonable(dict(call.args))}


def execute_ground_truth(suite: Any, task: Any, base_environment: Any) -> list[dict[str, Any]]:
    environment = task.init_environment(base_environment.model_copy(deep=True))
    runtime = FunctionsRuntime(suite.tools)
    ground_truth = task.ground_truth(environment)
    execution: list[dict[str, Any]] = []

    for call in ground_truth:
        result, error = runtime.run_function(
            environment,
            call.function,
            dict(call.args),
            raise_on_error=True,
        )
        execution.append(
            {
                "function": call.function,
                "args": jsonable(dict(call.args)),
                "result": jsonable(result),
                "error": error,
            }
        )

    return execution


def main() -> None:
    tasks: list[dict[str, Any]] = []
    for suite_name, task_numbers in PILOT_TASKS.items():
        suite = get_suite(BENCHMARK_VERSION, suite_name)
        base_environment = suite.load_and_inject_default_environment({})
        for number in task_numbers:
            task_id = f"user_task_{number}"
            task = suite.get_user_task_by_id(task_id)
            environment_for_ground_truth = task.init_environment(base_environment.model_copy(deep=True))
            ground_truth = task.ground_truth(environment_for_ground_truth)
            execution = execute_ground_truth(suite, task, base_environment)
            tasks.append(
                {
                    "pilot_id": f"{suite_name}-{number}",
                    "suite": suite_name,
                    "task_id": task_id,
                    "prompt": task.PROMPT,
                    "ground_truth": [call_dict(call) for call in ground_truth],
                    "execution": execution,
                }
            )

    print(
        json.dumps(
            {
                "benchmark": "AgentDojo",
                "agentdojo_package": "0.1.35",
                "benchmark_version": BENCHMARK_VERSION,
                "mode": "direct-pilot-ground-truth-plus-execution",
                "tasks": tasks,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
