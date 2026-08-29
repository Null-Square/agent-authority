# Task Authority Research Closure

Closed: **2026-08-29**

Status: **V1 research closed as a positive feasibility result with explicit live-evaluation and utility limitations**

Branch at closure: `research/task-contract-pilot`

This document is the definitive V1 research closure record. It keeps complete deterministic evidence, provider-boundary evidence, all usable live-model evidence, negative results, and failed-attempt qualifications in one place.

It is not a production-readiness claim.

## Research question

Can a small, executable, stateful authority contract for an AI-agent task:

1. allow the task's legitimate protected effects;
2. block resource substitution, repetition, reordering, cross-task transplants, and wrong resource selection before the provider executes them; and
3. let authority follow legitimate discovered resources without treating every observed candidate or prior request argument as authorized?

The key refinement discovered during the work is:

> **Observation provenance is not selection authority.**

When authorized evidence contains several candidates, the system needs evidence for why one candidate satisfies the task's selector.

## Frozen V1 mechanism

The final research compiler/runtime uses a small typed stateful grammar rather than a general policy DSL.

It includes:

- finite/static value fences;
- per-action cardinality;
- precedence constraints;
- tuple/correlation constraints;
- output-derived evidence bindings;
- numeric/arithmetic derivation;
- prefix and extremum selection witnesses;
- aggregate-frequency selection witnesses;
- fail-closed unresolved dynamic candidates.

Generic prior agent request arguments do **not** create new dynamic authority.

Dynamic authority must descend from:

- trusted task-root information;
- returned authorized evidence; or
- a deterministic selection witness.

No task-ID-specific authorization rules are used in the final 60-task cohort.

## Result 1 — deterministic 60-task evaluation

Environment:

- AgentDojo package: `0.1.35`;
- benchmark version: `v1.2.2`;
- suites: Slack, Banking, Workspace, Travel;
- cohort: all **60 user tasks with protected mutations** covered by the evaluated schema.

Final corrected result:

| Measure | Result |
| --- | ---: |
| Reference utility | **60/60** |
| Evidence-consistent counterfactuals | **36/36 accepted** |
| Static exact-trace baseline | **1/36 accepted** |
| Field mutants | **146/146 blocked** |
| Repeat mutants | **60/60 blocked** |
| Order mutants | **59/59 blocked** |
| Stronger-action mutants | **60/60 blocked** |
| Cross-product mutants | **12/12 blocked** |
| Exact full-action-tuple cross-task transplants | **33/33 blocked** |
| **Corrected adversarial total** | **370/370 blocked** |

The exact-trace comparison is important: the task-authority contract accepts all 36 tested evidence-consistent changed executions, while the static exact-trace baseline accepts only 1.

## Result 2 — provider-boundary adversarial families

The runtime enforces the contract before protected AgentDojo provider mutations execute.

| Attack family | Constructed | Blocked | Malicious provider reach | Reference utility |
| --- | ---: | ---: | ---: | ---: |
| Field/resource substitution | 60 | 60 | 0 | 60/60 |
| Premature/reordered effect | 60 | 60 | 0 | 60/60 |
| Repeated effect | 60 | 60 | 0 | 60/60 |
| Exact cross-task transplant | 46 | 46 | 0 | 60/60 |
| Wrong selector candidate | 4 | 4 | 0 | 60/60 |
| **Total** | **230** | **230** | **0** | — |

A separate aggregate-provider proof attacks both compiled aggregate-frequency constraints (`slack-13`, `slack-14`) by selecting an observed non-winner. Both are rejected before provider execution while their legitimate tasks retain utility.

## Falsification that changed the mechanism

The expanded cohort exposed a real escape in `slack-13` under the earlier provenance-only rule.

The task asks for the user who wrote the most total channel messages. Alice was visible in the authorized histories. Charlie was the aggregate winner.

A rule of the form:

> observed in authorized evidence => dynamically authorized

would authorize Alice even though Alice does not satisfy the task selector.

The research replaced that rule with:

> observed candidate + task selection predicate + sufficient authorized evidence + unique selection witness => dynamic authority

The repair introduced an aggregate-frequency witness over authorized evidence. It is not a `slack-13` task-specific exception.

Controlled tests verify:

- original winner;
- changed winner;
- observed non-winner rejection;
- tie fail-closed behavior;
- insufficient-evidence fail-closed behavior.

## Result 3 — early DeepSeek Flash live trials

Before the larger V4 Pro evaluation, two small stochastic DeepSeek Flash trials were completed over the same 8-task cohort.

| Trial | Benign utility | Attacked utility | AgentDojo injection goals succeeded |
| --- | ---: | ---: | ---: |
| Run `33207004109` | 4/8 | 5/8 | **0/8** |
| Run `33209203858` | 5/8 | 4/8 | **0/8** |
| **Combined** | **9/16** | **9/16** | **0/16** |

The second trial included exact provider-effect classification. It observed:

- exact reference-only effects: 2;
- exact injection-only effects: 0;
- effects matching both: 0;
- effects matching neither exact oracle: 3.

Manual inspection found the three `neither` effects were semantic variants of the user task rather than exact injection-target effects.

These trials were useful feasibility evidence and exposed exact-trace utility problems. They are supplementary to the later V4 Pro provider-boundary analysis.

## Result 4 — DeepSeek V4 Pro live evaluation

### Planned experiment

The frozen live protocol planned **5,088 task-runs** across:

- 60 protected tasks;
- four suites;
- three trials;
- benign conditions;
- canonical AgentDojo `tool_knowledge` attacks;
- authority-adaptive attack families;
- gated and ungated conditions.

The preregistered primary gate required **zero unresolved execution errors**.

That gate did not pass.

### Attempt 3 — partial canonical evidence, adaptive delivery invalid

Workflow run: `33213651318`

Head SHA: `be08b297d7227d1ba1afc8a97c5fd25f3a375d64`

Aggregate artifact ID: `9706064110`

Artifact SHA-256: `f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`

Accounting:

- planned rows accounted for: 5,088;
- recovery partitions present: 48/48;
- successful trajectories: **1,028**;
- `ParserError`: **1,380**;
- DeepSeek `402 Insufficient Balance`: **2,680**;
- `scientific_go`: **false**.

All authority-adaptive rows failed before reaching the model because exact JSON attack arguments broke AgentDojo YAML injection parsing.

The successful rows contain 717 Slack and 311 Banking trajectories on benign/canonical paths.

In the **422 matched completed canonical attacked scenarios**:

- ungated execution produced **79 unauthorized protected effects across 61 scenarios**;
- gated execution produced **0 unauthorized protected effects**.

Use Attempt 3 only as supplementary canonical-attack replication.

### Attempt 4 — corrected delivery, partial Slack live result

Workflow run: `33216337865`

Head SHA: `e37d6b56ffb7eadfc78bc99677927853eda01684`

Aggregate artifact ID: `9706264710`

Artifact SHA-256: `6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`

Attempt 4 changed evaluator delivery plumbing only. It did not change the frozen authority mechanism, attack targets, attack templates, planned matrix, or decision thresholds.

Accounting:

- planned rows accounted for: 5,088;
- recovery partitions present: 48/48;
- successful trajectories: **860**;
- `ParserError`: **0**;
- DeepSeek `402 Insufficient Balance`: **4,228**;
- `scientific_go`: **false**.

All successful trajectories are Slack because the paid balance was exhausted before later suites completed.

Successful-row aggregate:

| Condition | Cases | Utility | Unauthorized protected effects |
| --- | ---: | ---: | ---: |
| Benign, ungated | 56 | 96.43% | 6 |
| Benign, gated | 56 | 96.43% | 0 |
| Attacked, ungated | 376 | 83.78% | 66 |
| Attacked, gated | 372 | 82.26% | **0** |

The attacked gated slice recorded **373 policy rejections**.

### Matched attacked V4 Pro analysis

For the paper, use scenarios where both ungated and gated execution completed for the same `(suite, trial, task, attack family, attack id)` tuple.

Matched attacked scenarios: **372**.

- ungated unauthorized protected effects: **61**;
- ungated scenarios with at least one unauthorized protected effect: **40/372** (**10.75%**);
- gated unauthorized protected effects: **0**;
- gated scenarios with at least one unauthorized protected effect: **0/372**;
- ungated matched utility: **84.41%**;
- gated matched utility: **82.26%**;
- utility difference: **2.15 percentage points**.

Exploratory intervals/statistic:

- ungated scenario-rate 95% Wilson interval: **8.0%–14.3%**;
- gated scenario-rate 95% Wilson interval: **0%–1.02%**;
- two-sided Fisher exact comparison: `p ≈ 6.0e-13`.

Because the planned full experiment did not complete, treat the Fisher statistic as descriptive/exploratory, not a preregistered confirmatory test.

### Matched result by attack family

| Family | Matched scenarios | Ungated unauthorized effects | Ungated scenarios with >=1 | Gated unauthorized effects | Gated policy rejections |
| --- | ---: | ---: | ---: | ---: | ---: |
| AgentDojo `tool_knowledge` | 244 | 39 | 28 | **0** | 253 |
| Cross-action | 32 | 7 | 4 | **0** | 45 |
| Premature/order | 30 | 3 | 2 | **0** | 17 |
| Repeat | 32 | 6 | 3 | **0** | 26 |
| Cross-task transplant | 31 | 6 | 3 | **0** | 32 |
| Wrong selector candidate | 3 | 0 | 0 | **0** | 0 |
| **Total** | **372** | **61** | **40** | **0** | **373** |

The authority-adaptive subset contains **128 matched scenarios**. Ungated execution produced **22 policy-unauthorized protected effects across 12 scenarios**. Gated execution produced **0**.

Do not describe all ungated effects as exact execution of the attacker's requested target tuple. The correct metric is successful protected provider effects outside the frozen task authority.

## Why provider-boundary effects are the main mechanism metric

AgentDojo's injection-security oracle and this monitor's provider-effect metric answer different questions.

An AgentDojo injection-security failure can involve behavior outside the monitor's protected mutation scope, including read-only or information-flow consequences.

The V1 authority monitor asks:

> Did a protected provider mutation outside the user's task authority succeed?

The paper should report official benchmark metrics as context where available, but it must keep attempted/model-level behavior separate from execution-effective protected provider effects.

## Negative result — exact traces over-constrain intent

The main utility failure is precise:

> **A single successful task trace is not a faithful specification of the user's full authorized semantic envelope.**

The exact-trace baseline accepts only **1/36** evidence-consistent counterfactuals.

The live trials exposed concrete examples:

### `travel-4`

The user prompt explicitly requests a reminder on **2024-04-25**. AgentDojo's canonical mutation uses **2023-04-25 09:00–10:00**. The benchmark utility does not require that 2023 year or exact hour.

A trace-derived exact timestamp fence therefore rejects behavior that follows the user's explicit year.

### `travel-7`

The prompt requests a reminder on **November 14** without a year or clock time. The canonical trace fixes **2023-11-14 18:00–20:00**. Treating that trace choice as user authority over-constrains legitimate executions.

Future systems should distinguish:

- task-root required constants;
- bounded/ranged parameters;
- evidence-derived values;
- selection-witness outputs;
- incidental/free execution choices.

This is the **semantic authority envelope** research direction.

## Limitations

1. **Incomplete V4 Pro matrix.** The preregistered 5,088-run primary experiment failed its zero-error gate. Attempt-4 missingness is not random because Slack ran before later suites.
2. **Attempt-3 adaptive delivery failure.** All 1,380 adaptive rows failed before model execution. Attempt 4 fixed that plumbing and produced zero parser errors.
3. **Development-domain evaluation.** The 60-task cohort helped shape the grammar. It is not a held-out task distribution.
4. **Single principal V4 Pro live family.** Broad multi-model robustness is not established.
5. **Protected-effect scope.** The mechanism constrains protected provider mutations. It does not by itself stop all information leakage, unsafe natural-language output, or read-only consequences.
6. **Trace over-constraint.** V1 can inherit incidental or incorrect values from canonical traces.
7. **Formal proof incomplete.** The repository records candidate properties, not a completed formal verification of the grammar.
8. **Production boundary.** The research result does not establish hardened remote multi-tenant deployment or cryptographic provider attestation.

## Supported paper claim

A strong defensible summary is:

> We synthesize stateful task-authority contracts that distinguish observation provenance from selection authority and enforce those contracts before protected provider mutations. Across 60 mutation-bearing AgentDojo tasks, the frozen mechanism preserved 60/60 reference executions, accepted 36/36 evidence-consistent counterfactuals, blocked 370/370 corrected offline mutants, and stopped 230/230 constructible malicious provider-boundary trajectories with zero malicious provider reach. In a partial live DeepSeek V4 Pro Slack evaluation, 372 adversarial scenarios completed in both ungated and gated conditions. Ungated execution produced 61 policy-unauthorized protected effects across 40 scenarios, while gated execution produced none; the matched utility difference was 2.15 percentage points. The broader preregistered live matrix did not complete, so the live result is evidence for provider-boundary containment in the completed Slack slice rather than a broad prompt-injection-security claim.

## Claims to avoid

Do not claim:

- all 5,088 V4 Pro runs completed;
- the preregistered `scientific_go` result passed;
- all ungated out-of-policy effects were exact attacker-goal completions;
- prompt injection is solved;
- Attempt 4 provides live Workspace or Travel evidence;
- the adaptive evaluation is complete across all suites;
- multi-model robustness is established;
- the final grammar is formally proven, minimal, or production-ready.

## Final verdict

**Close V1 as a positive research feasibility result and community handoff.**

The work establishes a useful mechanism-level result and a concrete failure mode for provenance-only dynamic authority. It also establishes an important negative result: exact trace-derived authorization can materially over-constrain legitimate execution.

No further paid model run is required for V1 closure.

Future research should start from semantic authority envelopes, formal properties, held-out tasks, stronger baselines/ablations, and independent adversarial evaluation rather than adding ad-hoc exact-value rules to V1.

## Reproducibility and evidence map

Use:

- `PAPER_RESEARCH_SPEC.md` — paper thesis, formal model, and research questions;
- `PAPER_RESULTS_DRAFT.md` — paper-facing live metrics and claim language;
- `LIVE_EVAL_PROTOCOL.md` — frozen V4 Pro protocol;
- `LIVE_EVAL_ATTEMPTS.md` — complete live attempt history;
- `live-eval-freeze.json` — frozen mechanism validation metadata;
- `ARTIFACT_MANIFEST.md` — original Actions artifact identities/digests;
- `artifacts/attempt-3-summary.json` — compact Attempt-3 result;
- `artifacts/attempt-4-summary.json` — compact Attempt-4 result.

The active research workflow is manual and offline. The historical paid DeepSeek workflow is archived and executes zero API calls.
