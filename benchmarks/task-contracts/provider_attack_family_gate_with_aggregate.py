#!/usr/bin/env python3

from __future__ import annotations

import copy

from agentdojo.functions_runtime import FunctionCall

import model_loop_gate as gate
from aggregate_runtime_support import aggregate_alternates, patch_contract_gate

patch_contract_gate(gate)

import provider_attack_family_gate_v2 as base  # noqa: E402

_original_selector_candidate_attack = base.selector_candidate_attack


def selector_candidate_attack(call, rule, runtime, legitimate_keys):
    attack = _original_selector_candidate_attack(call, rule, runtime, legitimate_keys)
    if attack is not None:
        return attack

    next_count = runtime.counts.get(call.function, 0) + 1
    for constraint in runtime.contract.get("aggregateConstraints", []) or []:
        if constraint.get("action") != call.function:
            continue
        if int(constraint.get("actionOccurrence") or 0) != next_count:
            continue
        field = constraint.get("field")
        if field not in call.args:
            continue
        target = call.args[field]
        for alternate in aggregate_alternates(runtime.history, constraint.get("witness") or {}, target):
            args = copy.deepcopy(dict(call.args))
            args[field] = copy.deepcopy(alternate)
            candidate = FunctionCall(function=call.function, args=args)
            if base.call_key(candidate) not in legitimate_keys:
                return candidate
    return None


base.selector_candidate_attack = selector_candidate_attack

if __name__ == "__main__":
    base.main()
