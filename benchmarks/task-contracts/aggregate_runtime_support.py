"""Generic aggregate-frequency selection witness support for provider-boundary gates."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def value_at_path(value: Any, path: list[str]) -> Any:
    current = value
    for segment in path or []:
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def aggregate_frequency_rows(history: list[dict[str, Any]], witness: Mapping[str, Any]) -> dict[str, Any]:
    source_action = witness.get("sourceAction")
    extractor_path = list(witness.get("extractorPath") or [])
    counts: dict[str, dict[str, Any]] = {}
    source_events = 0
    records = 0

    # Import lazily to avoid a circular import at module load time.
    import model_loop_gate as gate

    for event in history:
        if event.get("error") or event.get("action") != source_action:
            continue
        result = event.get("result")
        if not isinstance(result, list):
            continue
        extracted: list[Any] = []
        for record in result:
            value = value_at_path(record, extractor_path)
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                continue
            extracted.append(value)
        if not extracted:
            continue
        source_events += 1
        records += len(extracted)
        for value in extracted:
            token = gate.key(value)
            row = counts.setdefault(token, {"value": value, "count": 0})
            row["count"] += 1

    rows = list(counts.values())
    return {"source_events": source_events, "records": records, "rows": rows}


def aggregate_frequency_winner(history: list[dict[str, Any]], witness: Mapping[str, Any]) -> dict[str, Any]:
    aggregate = aggregate_frequency_rows(history, witness)
    rows = aggregate["rows"]
    minimum = int(witness.get("minSourceEvents") or 2)
    if aggregate["source_events"] < minimum or len(rows) < 2:
        return {**aggregate, "winner": None, "reason": "insufficient_aggregate_evidence"}

    direction = witness.get("direction") or "max"
    best = min(row["count"] for row in rows) if direction == "min" else max(row["count"] for row in rows)
    winners = [row for row in rows if row["count"] == best]
    return {
        **aggregate,
        "winner": winners[0]["value"] if len(winners) == 1 else None,
        "reason": None if len(winners) == 1 else "aggregate_tie",
    }


def aggregate_alternates(history: list[dict[str, Any]], witness: Mapping[str, Any], target: Any) -> list[Any]:
    import model_loop_gate as gate

    aggregate = aggregate_frequency_rows(history, witness)
    rows = sorted(aggregate["rows"], key=lambda row: (-row["count"], gate.key(row["value"])))
    return [row["value"] for row in rows if gate.key(row["value"]) != gate.key(target)]


def patch_contract_gate(gate_module) -> None:
    cls = gate_module.ContractGateRuntime
    if getattr(cls, "_aggregate_frequency_patched", False):
        return

    original_decision = cls._decision

    def aggregate_decision(self, function: str, kwargs: Mapping[str, Any]):
        rule = self.contract.get("actions", {}).get(function)
        if rule is not None:
            next_count = self.counts.get(function, 0) + 1
            fields = gate_module.project_fields(rule, kwargs)
            for constraint in self.contract.get("aggregateConstraints", []) or []:
                if constraint.get("action") != function:
                    continue
                if int(constraint.get("actionOccurrence") or 0) != next_count:
                    continue
                field = constraint.get("field")
                if field not in fields:
                    return False, f"aggregate_target_missing:{field}"
                aggregate = aggregate_frequency_winner(self.history, constraint.get("witness") or {})
                winner = aggregate.get("winner")
                if winner is None or gate_module.key(winner) != gate_module.key(fields[field]):
                    return False, f"aggregate_selection_witness_mismatch:{field}:{aggregate.get('reason') or 'wrong_winner'}"
        return original_decision(self, function, kwargs)

    cls._decision = aggregate_decision
    cls._aggregate_frequency_patched = True
