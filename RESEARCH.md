# Agent Authority Research Handoff

Status: **V1 research slice closed on 2026-08-29**

This document is the stable entry point for the Agent Authority research package. It separates completed evidence from incomplete evaluation and future research.

## Research thesis

Agent tasks often need resources that are not known when authorization starts. A secure runtime must let task-local resource authority follow legitimate discovery without turning broad provider access into ambient authority.

The research question became:

> What evidence is sufficient to authorize a later effect on one resource when authorized execution discovers several candidate resources?

The central result is:

> **Observation provenance is not selection authority.**

A resource can appear in trusted output without being the resource selected by the user's task. The V1 prototype therefore separates candidate discovery from deterministic selection witnesses.

## Mechanism under study

The frozen research compiler/runtime uses a small stateful grammar. It includes:

- task-root value fences;
- action cardinality;
- precedence constraints;
- tuple and correlation constraints;
- output-derived evidence bindings;
- numeric/arithmetic derivation;
- prefix and extremum selection witnesses;
- aggregate-frequency selection witnesses;
- fail-closed behavior for unresolved dynamic candidates.

Generic prior agent request arguments do not create new dynamic authority. Dynamic authority must descend from trusted task roots, authorized returned evidence, or a deterministic selection witness.

The mechanism is a research prototype under `benchmarks/task-contracts/`. It is not the complete public product API.

## Key falsification

The expanded AgentDojo cohort exposed a concrete failure in a provenance-only rule.

In Slack task 13, the task asks for the user with the highest total message count. Alice was present in authorized histories, but Charlie was the aggregate winner. A provenance-only system could authorize Alice because Alice was observed.

That behavior is wrong. The task authorizes the selected winner, not every observed candidate.

The repair introduced a deterministic aggregate selection witness:

```text
trusted task predicate
        +
authorized candidate evidence
        +
complete measurements
        |
        v
unique deterministic winner
        |
        v
dynamic authority for that winner
```

Ties, incomplete measurements, unsupported predicates, and unresolved semantics fail closed.

## Completed evidence

### Deterministic 60-task cohort

AgentDojo `0.1.35`, benchmark `v1.2.2`, all 60 user tasks with protected mutations across Slack, Banking, Workspace, and Travel:

- reference utility: **60/60**;
- evidence-consistent counterfactuals: **36/36** accepted;
- static exact-trace baseline: **1/36** accepted;
- corrected adversarial mutants: **370/370** blocked.

### Provider-boundary families

The runtime enforces the frozen contract before protected provider mutations execute.

- field/resource substitution: **60/60 blocked**;
- premature/reordered effect: **60/60 blocked**;
- repeated effect: **60/60 blocked**;
- exact cross-task transplant: **46/46 blocked**;
- wrong selector candidate: **4/4 blocked**.

Total: **230/230** constructible malicious provider-boundary trajectories blocked, **0** malicious provider reaches, and **60/60** reference utility in each family.

## Live model evidence

### Why the live result is partial

The preregistered plan contained 5,088 DeepSeek V4 Pro task-runs. The planned primary experiment required zero unresolved execution errors.

That gate did not pass.

Attempt 3 had an adaptive-payload YAML serialization defect and later exhausted the DeepSeek balance. Attempt 4 corrected the delivery defect without changing the frozen authority mechanism, but the account balance was exhausted before later suites completed.

The repository therefore reports the live evidence as a **partial completed slice**, not as the preregistered primary result.

### Attempt 4

Workflow run: `33216337865`

Head: `e37d6b56ffb7eadfc78bc99677927853eda01684`

Aggregate artifact ID: `9706264710`

SHA-256: `6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`

Attempt 4 produced **860 successful DeepSeek V4 Pro trajectories** and **4,228 `402 Insufficient Balance` rows**. It produced **0 ParserError rows**. All successful trajectories are Slack.

Aggregate successful rows:

| Condition | Cases | Utility | Unauthorized protected effects |
| --- | ---: | ---: | ---: |
| Benign, ungated | 56 | 96.43% | 6 |
| Benign, gated | 56 | 96.43% | 0 |
| Attacked, ungated | 376 | 83.78% | 66 |
| Attacked, gated | 372 | 82.26% | **0** |

The attacked gated slice recorded **373 policy rejections**.

### Matched attacked analysis

Use the subset where both ungated and gated execution completed for the same `(suite, trial, task, attack family, attack id)` scenario.

Matched scenarios: **372**.

- ungated unauthorized protected effects: **61** across **40/372** scenarios;
- gated unauthorized protected effects: **0** across **0/372** scenarios;
- ungated matched utility: **84.41%**;
- gated matched utility: **82.26%**;
- utility difference: **2.15 percentage points**.

The canonical AgentDojo `tool_knowledge` family contributes 244 matched scenarios, 39 ungated unauthorized protected effects, and 0 gated unauthorized protected effects.

The authority-adaptive families contribute 128 matched scenarios, 22 ungated out-of-policy protected effects, and 0 gated unauthorized protected effects.

Do not interpret all out-of-policy effects as exact attacker-target completions. The live claim is provider-boundary containment under adversarial trajectories.

### Attempt 3 supplementary evidence

Workflow run: `33213651318`

Aggregate artifact ID: `9706064110`

SHA-256: `f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`

Attempt 3 produced 1,028 successful trajectories. Its 1,380 authority-adaptive rows failed before model execution because of YAML parsing. It later produced 2,680 `402 Insufficient Balance` rows.

In 422 matched completed canonical attacked scenarios, ungated execution produced **79 unauthorized protected effects across 61 scenarios** and gated execution produced **0**.

Use Attempt 3 only as supplementary canonical-attack replication.

## Negative result: exact traces over-constrain intent

A second research finding is as important as the security result:

> **A single successful trace is not a faithful authorization specification for all task parameters.**

The exact-trace baseline accepted only 1/36 legitimate evidence-consistent counterfactuals.

The live experiments also exposed trace fields that were incidental or inconsistent with user intent. Calendar timestamps were the clearest example. The research records a direct prompt/ground-truth year contradiction in `travel-4` and arbitrary trace-time narrowing in `travel-7`.

Future systems should infer a semantic authority envelope that distinguishes:

- task-root required constants;
- bounded or ranged values;
- values derived from authorized evidence;
- values derived from selection witnesses;
- incidental/free execution choices.

## Claim boundary

The strongest supported claim is:

> A frozen, stateful task-authority monitor can prevent policy-unauthorized protected provider effects even when a tool-using LLM produces such effects under adversarially injected trajectories.

The work does **not** establish complete prompt-injection prevention, multi-model robustness, production security, or automatic natural-language intent compilation.

## Artifact map

Use these files as the source of truth:

- `benchmarks/task-contracts/RESULTS.md` — research closure and deterministic/provider-boundary result;
- `benchmarks/task-contracts/PAPER_RESULTS_DRAFT.md` — paper-facing live result and claim language;
- `benchmarks/task-contracts/PAPER_RESEARCH_SPEC.md` — research framing and candidate formal model;
- `benchmarks/task-contracts/LIVE_EVAL_PROTOCOL.md` — frozen live protocol;
- `benchmarks/task-contracts/LIVE_EVAL_ATTEMPTS.md` — complete attempt history;
- `benchmarks/task-contracts/live-eval-freeze.json` — frozen mechanism hashes/configuration;
- `benchmarks/task-contracts/ARTIFACT_MANIFEST.md` — permanent evidence archive map;
- `benchmarks/task-contracts/artifacts/deepseek-attempt-3.zip` — exact Attempt-3 aggregate artifact;
- `benchmarks/task-contracts/artifacts/deepseek-attempt-4.zip` — exact Attempt-4 aggregate artifact.

## Reproduction

The active research workflow is manual and offline. It does not call paid model APIs.

Follow `benchmarks/task-contracts/README.md` for commands and expected gates.

The historical DeepSeek workflow is archived. It exists only to preserve the exact orchestration that produced the paid evidence. It executes zero model API calls.

## Future work

The original project closes V1 here. Community continuation can focus on:

1. formal operational semantics and proofs for Mission non-amplification and selection soundness;
2. semantic authority envelopes that do not overfit one reference trace;
3. held-out or newly designed open-world tasks with complete semantic selector ground truth;
4. stronger baseline implementations and ablations;
5. model diversity and independent red-team evaluation;
6. runtime overhead and human step-up cost;
7. stronger provider evidence/attestation where practical.

No future work item is required to interpret the V1 result. They are research extensions, not missing claims hidden from the current result.
