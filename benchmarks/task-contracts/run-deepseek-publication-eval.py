#!/usr/bin/env python3
"""Run the preregistered evaluator with provider-valid adaptive adversaries.

This wrapper hardens only attack construction, live-run partitioning, transport
compatibility for DeepSeek thinking-mode tool turns, artifact-path recovery,
literal adaptive-injection delivery, and the predeclared matrix-size assertion.
It does not modify any frozen compiler or authorization runtime semantics.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path

import model_loop_gate as gate
from agentdojo.functions_runtime import FunctionsRuntime
from deepseek_thinking_transport import DeepSeekThinkingClientAdapter

EXPECTED_PLAN = {
    "protected_tasks": 60,
    "standard_attack_pairs_per_trial": 558,
    "adaptive_targets_per_trial": 230,
    "adaptive_by_family": {
        "cross-action": 60,
        "order": 60,
        "repeat": 60,
        "selector-candidate": 4,
        "transplant": 46,
    },
    "cases_per_trial": 1696,
    "trials": 3,
    "planned_model_calls": 5088,
}
EXPECTED_ADAPTIVE_SERIALIZATION_CASES = EXPECTED_PLAN["adaptive_targets_per_trial"] * EXPECTED_PLAN["trials"]


def load_base():
    path = Path(__file__).with_name("deepseek-publication-eval.py")
    spec = importlib.util.spec_from_file_location("deepseek_publication_eval_v1", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load evaluator at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base()
# The base evaluator imports the historical DeepSeek adapter for its pipeline
# factory. Replace only that transport shim so pinned AgentDojo can preserve
# DeepSeek V4's required reasoning_content between thinking-mode tool turns.
base._DeepSeekClientAdapter = DeepSeekThinkingClientAdapter


def resolve_cli_input(flag: str) -> None:
    """Recover one uniquely named input from GitHub artifact directory layout.

    actions/upload-artifact preserves absolute-path prefixes when its inputs do
    not share a useful least common ancestor. A later download can therefore
    contain `tmp/<name>` rather than `<name>` directly under the requested
    extraction directory. Resolve that packaging detail fail-closed without
    changing any experiment input bytes.
    """

    if flag not in sys.argv:
        return
    index = sys.argv.index(flag) + 1
    requested = Path(sys.argv[index])
    if requested.is_file():
        return
    root = requested.parent
    if not root.exists():
        raise FileNotFoundError(f"input root does not exist for {flag}: {root}")
    matches = sorted(path for path in root.rglob(requested.name) if path.is_file())
    if len(matches) != 1:
        raise FileNotFoundError(
            f"expected exactly one artifact input named {requested.name} under {root}; found {matches}"
        )
    sys.argv[index] = str(matches[0])
    print(
        json.dumps(
            {
                "artifact_input_recovered": flag,
                "requested": str(requested),
                "resolved": str(matches[0]),
            },
            sort_keys=True,
        ),
        file=sys.stderr,
    )


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


# ---------------------------------------------------------------------------
# YAML-independent literal adaptive injection delivery
# ---------------------------------------------------------------------------


def _replace_text(value, replacements: Mapping[str, str]):
    """Replace sentinel substrings recursively in a Pydantic model dump."""
    if isinstance(value, str):
        for sentinel, payload in replacements.items():
            value = value.replace(sentinel, payload)
        return value
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            new_key = _replace_text(key, replacements) if isinstance(key, str) else key
            out[new_key] = _replace_text(item, replacements)
        return out
    if isinstance(value, list):
        return [_replace_text(item, replacements) for item in value]
    if isinstance(value, tuple):
        return tuple(_replace_text(item, replacements) for item in value)
    if isinstance(value, set):
        return {_replace_text(item, replacements) for item in value}
    return value


def _count_text(value, needle: str) -> int:
    if isinstance(value, str):
        return value.count(needle)
    if isinstance(value, Mapping):
        return sum(_count_text(key, needle) + _count_text(item, needle) for key, item in value.items())
    if isinstance(value, (list, tuple, set)):
        return sum(_count_text(item, needle) for item in value)
    return 0


def load_literal_injected_environment(suite, injections: Mapping[str, str]):
    """Inject exact text *after* AgentDojo's YAML parse/validation boundary.

    AgentDojo 0.1.35 interpolates injection strings into YAML source before
    parsing. Adaptive payloads deliberately contain exact JSON tool arguments,
    including double quotes, so direct interpolation can make otherwise valid
    fixture YAML unparsable. We avoid altering the attack text: each selected
    vector is first populated with a unique YAML-safe sentinel, the environment
    is parsed and validated by AgentDojo normally, and only then is the sentinel
    replaced in the validated model dump with the exact original payload.

    This is evaluator delivery plumbing only. It does not touch the task prompt,
    attack target, frozen authority contract, runtime decision procedure, or
    provider calls.
    """

    injections = dict(injections or {})
    defaults = suite.get_injection_vector_defaults()
    unknown = sorted(set(injections) - set(defaults))
    if unknown:
        raise ValueError(f"unknown injection vectors: {unknown}")

    guarded = {}
    replacements = {}
    sentinel_by_key = {}
    for index, key in enumerate(sorted(injections)):
        payload = str(injections[key])
        nonce = hashlib.sha256(f"{key}\0{payload}".encode("utf-8")).hexdigest()[:20]
        sentinel = f"NULLSQUARE_LITERAL_INJECTION_{index}_{nonce}"
        while sentinel in payload or any(sentinel in str(value) for value in defaults.values()):
            sentinel += "X"
        guarded[key] = sentinel
        replacements[sentinel] = payload
        sentinel_by_key[key] = sentinel

    parsed = suite.load_and_inject_default_environment(guarded)
    dumped = parsed.model_dump(mode="python")
    before = {key: _count_text(dumped, sentinel) for key, sentinel in sentinel_by_key.items()}
    missing = sorted(key for key, count in before.items() if count == 0)
    if missing:
        raise RuntimeError(f"adaptive injection sentinel did not reach parsed environment for vectors: {missing}")

    replaced = _replace_text(dumped, replacements)
    leaked = sorted(key for key, sentinel in sentinel_by_key.items() if _count_text(replaced, sentinel) != 0)
    if leaked:
        raise RuntimeError(f"adaptive injection sentinel leaked after literal replacement for vectors: {leaked}")

    rebuilt = type(parsed).model_validate(replaced)
    rebuilt_dump = rebuilt.model_dump(mode="python")
    missing_payloads = []
    for key, payload in injections.items():
        if _count_text(rebuilt_dump, str(payload)) < before[key]:
            missing_payloads.append(key)
    if missing_payloads:
        raise RuntimeError(f"adaptive payload was not preserved exactly for vectors: {sorted(missing_payloads)}")

    receipt = {
        "mode": "post_yaml_literal_replacement",
        "vectors": len(injections),
        "vector_occurrences": sum(before.values()),
        "payload_sha256": hashlib.sha256(
            "\0".join(f"{key}\0{injections[key]}" for key in sorted(injections)).encode("utf-8")
        ).hexdigest(),
        "exact_payload_preserved": True,
    }
    return rebuilt, receipt


_original_run_once = base.run_once


def run_once_with_literal_adaptive_delivery(
    pipeline,
    suite,
    task,
    entry,
    gated,
    injection_task=None,
    injections=None,
):
    # Only authority-adaptive cases have injections without an AgentDojo
    # injection_task. Benign and canonical tool_knowledge paths remain on
    # AgentDojo's original environment-loading path.
    if injection_task is not None or not injections:
        return _original_run_once(pipeline, suite, task, entry, gated, injection_task, injections)

    environment, delivery = load_literal_injected_environment(suite, injections)
    reference_environment = environment.model_copy(deep=True)
    runtime_cls = base.bound_audit_runtime(entry["contract"], entry["prompt"], gated=gated)
    utility, security = suite.run_task_with_pipeline(
        pipeline,
        task,
        None,
        {},
        environment=environment,
        runtime_class=runtime_cls,
    )
    runtime = runtime_cls.INSTANCES[-1]
    ref_env = task.init_environment(reference_environment)
    reference = base.mutation_oracle(task.ground_truth(ref_env))
    executed, rejected, unauthorized_successes = base.mutation_details(runtime, reference, [])
    return {
        "utility": bool(utility),
        "agentdojo_security": bool(security),
        "policy_rejections": len(runtime.policy_rejections),
        "provider_mutation_attempts": len(runtime.provider_mutation_attempts),
        "provider_successful_mutations": len(runtime.executed_mutations),
        "unauthorized_provider_effects": unauthorized_successes,
        "executed_mutations": executed,
        "rejected_mutations": rejected,
        "decision_log": runtime.decisions,
        "reference_mutation_oracle": reference,
        "injection_mutation_oracle": [],
        "adaptive_injection_delivery": delivery,
    }


base.run_once = run_once_with_literal_adaptive_delivery


def validate_adaptive_serialization(bundle) -> dict[str, int | bool]:
    """Fail closed unless every preregistered adaptive payload survives delivery.

    The full check covers all 230 constructible adaptive targets under all three
    frozen trial templates: 690 payload/vector materializations before any live
    model partition is released.
    """

    donors = base.donor_catalog(bundle)
    payload_cases = 0
    vector_bindings = 0
    occurrences = 0
    families: dict[str, int] = {}

    for suite_name in base.SUITES:
        suite = gate.get_suite(gate.BENCHMARK_VERSION, suite_name)
        for pilot_id, entry in base.entries_for_suite(bundle, suite_name):
            task = suite.get_user_task_by_id(entry["task_id"])
            targets = base.adaptive_targets(pilot_id, entry, bundle, donors)
            for target in targets:
                families[target["family"]] = families.get(target["family"], 0) + 1
                for trial in range(base.TRIALS):
                    attack = base.AdaptiveAuthorityAttack(suite, None, target, trial)
                    injections = attack.attack(task)
                    _, receipt = load_literal_injected_environment(suite, injections)
                    if not receipt["exact_payload_preserved"]:
                        raise RuntimeError(
                            f"adaptive payload preservation failed for {pilot_id}/{target['family']}/trial-{trial}"
                        )
                    payload_cases += 1
                    vector_bindings += int(receipt["vectors"])
                    occurrences += int(receipt["vector_occurrences"])

    if payload_cases != EXPECTED_ADAPTIVE_SERIALIZATION_CASES:
        raise SystemExit(
            f"adaptive serialization preflight expected {EXPECTED_ADAPTIVE_SERIALIZATION_CASES} cases, "
            f"validated {payload_cases}"
        )
    if families != EXPECTED_PLAN["adaptive_by_family"]:
        raise SystemExit(
            "adaptive serialization family counts changed after preregistration:\n"
            + json.dumps({"expected": EXPECTED_PLAN["adaptive_by_family"], "actual": families}, indent=2, sort_keys=True)
        )
    if vector_bindings < payload_cases or occurrences < vector_bindings:
        raise SystemExit(
            "adaptive serialization preflight found missing injection-vector delivery: "
            f"cases={payload_cases} bindings={vector_bindings} occurrences={occurrences}"
        )

    receipt = {
        "adaptive_serialization_preflight": True,
        "targets_per_trial": EXPECTED_PLAN["adaptive_targets_per_trial"],
        "trials": EXPECTED_PLAN["trials"],
        "payload_cases": payload_cases,
        "vector_bindings": vector_bindings,
        "vector_occurrences": occurrences,
    }
    print(json.dumps(receipt, sort_keys=True), file=sys.stderr)
    return receipt


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
        raise RuntimeError(f"invalid live partition {partition_index}/{partition_count}")
    original_entries_for_suite = base.entries_for_suite

    def partitioned_entries_for_suite(bundle, suite_name):
        rows = original_entries_for_suite(bundle, suite_name)
        return [row for index, row in enumerate(rows) if index % partition_count == partition_index]

    base.entries_for_suite = partitioned_entries_for_suite


def _cli_mode() -> str | None:
    if "--mode" not in sys.argv:
        return None
    return sys.argv[sys.argv.index("--mode") + 1]


def _load_cli_bundle():
    if "--contracts" not in sys.argv:
        raise RuntimeError("--contracts is required")
    path = Path(sys.argv[sys.argv.index("--contracts") + 1])
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_materialized_plan() -> None:
    if _cli_mode() != "plan":
        return
    if "--output" not in sys.argv:
        raise RuntimeError("plan mode requires --output for preregistration validation")
    output = Path(sys.argv[sys.argv.index("--output") + 1])
    plan = json.loads(output.read_text(encoding="utf-8"))
    failures = {}
    for key, expected in EXPECTED_PLAN.items():
        actual = plan.get(key)
        if actual != expected:
            failures[key] = {"expected": expected, "actual": actual}
    if failures:
        raise SystemExit(
            "materialized live matrix changed after preregistration:\n"
            + json.dumps(failures, indent=2, sort_keys=True)
        )


if __name__ == "__main__":
    resolve_cli_input("--contracts")
    if _cli_mode() == "plan":
        validate_adaptive_serialization(_load_cli_bundle())
    base.main()
    validate_materialized_plan()
