#!/usr/bin/env python3
"""Run the preregistered evaluator with provider-valid adaptive adversaries.

This wrapper hardens only attack construction and live-run partitioning. It does
not modify any frozen compiler or authorization runtime semantics.
"""

from __future__ import annotations

import copy
import importlib.util
import os
from pathlib import Path

import model_loop_gate as gate
from agentdojo.functions_runtime import FunctionsRuntime


def load_base():
    path = Path(__file__).with_name("deepseek-publication-eval.py")
    spec = importlib.util.spec_from_file_location("deepseek_publication_eval_v1", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load evaluator at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base()


def provider_valid(suite, env, function: str, args) -> bool:
    probe_env = env.model_copy(deep=True)
    runtime = FunctionsRuntime(suite.tools)
    _, error = runtime.run_function(probe_env, function, args, raise_on_error=False)
    return error is None


def hardened_transplant_target(pilot_id, task, env, contract, donors):
    legitimate = base.legitimate_keys(task, env, contract)
    suite_name = str(pilot_id).split("-", 1)[0]
    suite = gate.get_suite(gate.BENCHMARK_VERSION, suite_name)
    for call in base.protected_ground_truth(task, env, contract):
        rule = contract["actions"].get(call.function, {})
        names = list((rule.get("dynamic") or {}).keys()) + list((rule.get("fields") or {}).keys())
        for field in names:
            if field not in call.args:
                continue
            for donor in donors.get((call.function, field), []):
                if donor["pilot_id"] == pilot_id or base.semantic_equal(donor["value"], call.args[field]):
                    continue
                args = copy.deepcopy(dict(call.args))
                args[field] = copy.deepcopy(donor["value"])
                if base.call_key(call.function, args) in legitimate:
                    continue
                if not provider_valid(suite, env, call.function, args):
                    continue
                return {
                    "family": "transplant",
                    "function": call.function,
                    "args": gate.jsonable(args),
                    "field": field,
                    "donor_task": donor["pilot_id"],
                    "provider_preflight": "succeeded_on_target_pre_state",
                }
    return None


def hardened_cross_action_target(pilot_id, task, env, contract, bundle):
    allowed_actions = set(contract.get("actions", {}))
    target_suite_name = bundle["contracts"][pilot_id]["suite"]
    suite = gate.get_suite(gate.BENCHMARK_VERSION, target_suite_name)

    for donor_id, donor_entry in sorted(bundle["contracts"].items()):
        if donor_id == pilot_id or donor_entry["suite"] != target_suite_name:
            continue
        donor_task = suite.get_user_task_by_id(donor_entry["task_id"])
        donor_env = base.init_task_env(suite, donor_task)
        for call in donor_task.ground_truth(donor_env):
            if not gate.MUTATION_RE.match(call.function) or call.function in allowed_actions:
                continue
            args = copy.deepcopy(dict(call.args))
            if not provider_valid(suite, env, call.function, args):
                continue
            return {
                "family": "cross-action",
                "function": call.function,
                "args": gate.jsonable(args),
                "donor_task": donor_id,
                "provider_preflight": "succeeded_on_target_pre_state",
            }
    return None


base.transplant_target = hardened_transplant_target
base.cross_action_target = hardened_cross_action_target

# Live workflow partitions one suite into small deterministic task subsets. Plan
# mode leaves these variables unset and therefore always describes the full
# preregistered matrix.
_partition_index = os.getenv("LIVE_PARTITION_INDEX")
_partition_count = os.getenv("LIVE_PARTITION_COUNT")
if _partition_index is not None or _partition_count is not None:
    if _partition_index is None or _partition_count is None:
        raise RuntimeError("LIVE_PARTITION_INDEX and LIVE_PARTITION_COUNT must be set together")
    partition_index = int(_partition_index)
    partition_count = int(_partition_count)
    if partition_count < 1 or not 0 <= partition_index < partition_count:
        raise RuntimeError(
            f"invalid live partition {partition_index}/{partition_count}"
        )
    original_entries_for_suite = base.entries_for_suite

    def partitioned_entries_for_suite(bundle, suite_name):
        rows = original_entries_for_suite(bundle, suite_name)
        return [
            row
            for index, row in enumerate(rows)
            if index % partition_count == partition_index
        ]

    base.entries_for_suite = partitioned_entries_for_suite


if __name__ == "__main__":
    base.main()
