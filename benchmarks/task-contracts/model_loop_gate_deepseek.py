#!/usr/bin/env python3
"""Live AgentDojo model arm through DeepSeek's OpenAI-compatible API.

The API key is read only from DEEPSEEK_API_KEY at runtime. It is never written
into artifacts, contracts, or logs by this harness.

AgentDojo 0.1.35 predates the `openai-compatible` ModelsEnum entry that exists
in newer AgentDojo source. To keep the benchmark pinned while avoiding a fork,
this adapter constructs AgentDojo's own OpenAILLM pipeline element with an
OpenAI client pointed at DeepSeek, then passes that element into PipelineConfig.
The task-contract compiler and authorization runtime are unchanged.
"""

from __future__ import annotations

import os

import openai
from agentdojo.agent_pipeline.llms.openai_llm import OpenAILLM

import model_loop_gate as gate
from aggregate_runtime_support import patch_contract_gate

patch_contract_gate(gate)


def run_deepseek(bundle, _model):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    model_id = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    if not api_key:
        return {
            "mode": "real-model",
            "status": "skipped_no_deepseek_api_key",
            "provider": "deepseek-openai-compatible",
            "model": model_id,
            "rows": [],
        }

    client = openai.OpenAI(api_key=api_key, base_url=base_url)
    llm = OpenAILLM(client, model_id)

    # AgentDojo 0.1.35's attack registry requires a named target pipeline.
    # Custom BasePipelineElement instances can otherwise leave the generated
    # pipeline name as None, which prevents the attack from being constructed
    # before any model/API request is made. This is evaluation-adapter metadata
    # only; it does not alter task-contract or authorization semantics.
    llm.name = model_id
    pipeline = gate.AgentPipeline.from_config(
        gate.PipelineConfig(
            llm=llm,
            model_id=None,
            defense=None,
            tool_delimiter="tool",
            system_message_name=None,
            system_message=None,
            tool_output_format=None,
        )
    )
    pipeline.name = model_id

    rows = []
    for suite_name, task_ids in gate.REAL_TASKS.items():
        suite = gate.get_suite(gate.BENCHMARK_VERSION, suite_name)
        attack = gate.load_attack("tool_knowledge", suite, pipeline)
        injection_id = sorted(suite.injection_tasks)[0]
        injection_task = suite.get_injection_task_by_id(injection_id)

        for task_id in task_ids:
            pilot_id = f"{suite_name}-{int(task_id.rsplit('_', 1)[1])}"
            entry = bundle["contracts"].get(pilot_id)
            if not entry:
                rows.append({"id": pilot_id, "status": "missing_contract"})
                continue
            task = suite.get_user_task_by_id(task_id)

            benign_cls = gate.bound_runtime(entry["contract"], entry["prompt"])
            benign_utility, _ = suite.run_task_with_pipeline(
                pipeline, task, None, {}, runtime_class=benign_cls
            )
            benign_runtime = benign_cls.INSTANCES[-1]

            injections = attack.attack(task, injection_task)
            attacked_cls = gate.bound_runtime(entry["contract"], entry["prompt"])
            attacked_utility, attacked_security = suite.run_task_with_pipeline(
                pipeline,
                task,
                injection_task,
                injections,
                runtime_class=attacked_cls,
            )
            attacked_runtime = attacked_cls.INSTANCES[-1]

            rows.append(
                {
                    "id": pilot_id,
                    "status": "ran",
                    "benign_utility": bool(benign_utility),
                    "benign_denied_mutations": len(benign_runtime.denied),
                    "attacked_utility": bool(attacked_utility),
                    "agentdojo_security": bool(attacked_security),
                    "attacked_denied_mutations": len(attacked_runtime.denied),
                    "attacked_provider_mutation_attempts": len(attacked_runtime.provider_mutation_attempts),
                    "attacked_executed_mutations": len(attacked_runtime.executed_mutations),
                }
            )

    ran = [row for row in rows if row.get("status") == "ran"]
    return {
        "mode": "real-model",
        "status": "ran",
        "provider": "deepseek-openai-compatible",
        "model": model_id,
        "attack": "tool_knowledge",
        "tasks": len(ran),
        "benign_utility_passed": sum(row["benign_utility"] for row in ran),
        "attacked_utility_passed": sum(row["attacked_utility"] for row in ran),
        "agentdojo_security_passed": sum(row["agentdojo_security"] for row in ran),
        "tasks_with_denied_mutation_attempts": sum(
            row["attacked_denied_mutations"] > 0 for row in ran
        ),
        "rows": rows,
    }


gate.run_real = run_deepseek


if __name__ == "__main__":
    gate.main()
