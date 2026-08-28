#!/usr/bin/env python3
"""Survey all AgentDojo v1.2.2 user tasks in the four default suites.

This is an external-validity survey, not an authorization evaluator. It executes
canonical ground-truth traces directly through AgentDojo's FunctionsRuntime and
records prompts, calls, results, and execution failures. No curated pilot task
list or task-specific authorization annotation is imported.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from agentdojo.functions_runtime import FunctionsRuntime
from agentdojo.task_suite.load_suites import get_suite

BENCHMARK_VERSION = "v1.2.2"
SUITES = ("slack", "banking", "workspace", "travel")


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


def execute_task(suite: Any, task: Any, base_environment: Any) -> tuple[list[dict[str, Any]], str | None]:
    environment = task.init_environment(base_environment.model_copy(deep=True))
    runtime = FunctionsRuntime(suite.tools)
    ground_truth = task.ground_truth(environment)
    execution: list[dict[str, Any]] = []

    try:
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
    except Exception as exc:  # survey must report failures rather than hide them
        return execution, f"{type(exc).__name__}: {exc}"

    return execution, None


def main() -> None:
    tasks: list[dict[str, Any]] = []
    action_counts: Counter[str] = Counter()
    suite_counts: dict[str, int] = {}
    execution_failures: list[dict[str, str]] = []

    for suite_name in SUITES:
        suite = get_suite(BENCHMARK_VERSION, suite_name)
        base_environment = suite.load_and_inject_default_environment({})
        user_tasks = suite.user_tasks
        suite_counts[suite_name] = len(user_tasks)

        for task_id in sorted(user_tasks, key=lambda item: int(item.rsplit("_", 1)[1])):
            task = user_tasks[task_id]
            environment = task.init_environment(base_environment.model_copy(deep=True))
            ground_truth = task.ground_truth(environment)
            for call in ground_truth:
                action_counts[call.function] += 1

            execution, failure = execute_task(suite, task, base_environment)
            if failure:
                execution_failures.append({"suite": suite_name, "task_id": task_id, "error": failure})

            tasks.append(
                {
                    "survey_id": f"{suite_name}-{task_id.rsplit('_', 1)[1]}",
                    "suite": suite_name,
                    "task_id": task_id,
                    "prompt": task.PROMPT,
                    "ground_truth": [
                        {"function": call.function, "args": jsonable(dict(call.args))}
                        for call in ground_truth
                    ],
                    "execution": execution,
                    "execution_error": failure,
                }
            )

    print(
        json.dumps(
            {
                "schema": "nullsquare.agent-authority.agentdojo-coverage-survey.v1",
                "benchmark": "AgentDojo",
                "agentdojo_package": "0.1.35",
                "benchmark_version": BENCHMARK_VERSION,
                "suites": list(SUITES),
                "summary": {
                    "tasks": len(tasks),
                    "suite_task_counts": suite_counts,
                    "ground_truth_calls": sum(action_counts.values()),
                    "distinct_actions": len(action_counts),
                    "execution_failures": len(execution_failures),
                },
                "action_counts": dict(sorted(action_counts.items())),
                "execution_failures": execution_failures,
                "tasks": tasks,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
