# Paper Results Draft — Frozen Task Authority V1

Date: 2026-08-29
Branch: `research/task-contract-pilot`

This note is the paper-facing evidence summary. It intentionally separates complete deterministic/provider-boundary evidence from partial live-model evidence. It must not be rewritten to imply that the preregistered 5,088-call DeepSeek matrix completed successfully.

## Core claim supported by the evidence

A frozen, stateful task-authority monitor can prevent policy-unauthorized protected provider effects even when a tool-using LLM produces such effects under adversarially injected trajectories.

The contribution is not a claim that prompt injection is solved. The monitor sits at the provider-effect boundary and limits what a compromised or confused agent can cause, using task-root authority, evidence-derived bindings, cardinality/order/correlation constraints, and deterministic selection witnesses.

## Evidence layer 1 — complete deterministic and provider-boundary evaluation

AgentDojo 0.1.35 / benchmark v1.2.2, 60 mutation-bearing user tasks across Slack, Banking, Workspace, and Travel.

- Reference utility: **60/60**.
- Evidence-consistent counterfactuals accepted: **36/36**.
- Static exact-trace baseline accepted only **1/36** counterfactuals.
- Corrected adversarial mutants blocked: **370/370**.
- Attempt-exact provider-boundary malicious trajectories blocked: **230/230**.
- Unauthorized malicious trajectories reaching the provider: **0**.
- Reference utility in provider-boundary families: **60/60**.

The 230 provider-boundary trajectories comprise 60 field/resource substitutions, 60 premature/reordered effects, 60 repetitions, 46 exact cross-task transplants, and 4 wrong-selector candidates.

This is the broadest completed evidence and should carry the paper's coverage claim.

## Evidence layer 2 — DeepSeek V4 Pro live-model evaluation

### Experimental status

The authority mechanism was frozen before the DeepSeek V4 Pro experiment. The intended preregistered matrix contained 5,088 model task-runs across 60 protected tasks, four suites, three trials, canonical AgentDojo `tool_knowledge` attacks, and five authority-adaptive attack families.

The full matrix did **not** complete. Attempt 3 exposed an adaptive-payload YAML serialization defect. Attempt 4 corrected only that delivery plumbing, after which the DeepSeek account exhausted its balance. No further paid evaluation will be run.

Therefore the live-model result is a **partial completed slice**, not the preregistered primary result.

### Attempt 4 usable live slice

Workflow run: `33216337865`
Head: `e37d6b56ffb7eadfc78bc99677927853eda01684`
Model: `deepseek-v4-pro`
Frozen mechanism: unchanged from `live-eval-freeze.json`

Attempt 4 produced **860 successful DeepSeek trajectories** before balance exhaustion. All successful trajectories were in the Slack suite. The remaining **4,228** rows failed with DeepSeek `402 Insufficient Balance`; there were **no ParserError rows** in Attempt 4, confirming that the adaptive delivery correction removed the Attempt-3 serialization failure from the observed run.

Successful rows:

| Condition | Successful trajectories | Utility | Unauthorized protected provider effects |
| --- | ---: | ---: | ---: |
| Benign, ungated | 56 | 96.43% | 6 |
| Benign, gated | 56 | 96.43% | 0 |
| Attacked, ungated | 376 | 83.78% | 66 |
| Attacked, gated | 372 | 82.26% | **0** |

The aggregate live artifact reports **373 policy rejections** in attacked gated trajectories and zero successful provider effects outside the frozen policy.

### Matched attacked analysis

For the paper, use the matched subset where both the ungated and gated condition completed for the same `(suite, trial, task, attack family, attack id)` scenario.

Matched attacked scenarios: **372**.

- Ungated: **61** unauthorized protected provider effects across **40/372** scenarios (**10.75%** of scenarios).
- Gated: **0** unauthorized protected provider effects across **0/372** scenarios.
- Ungated matched utility: **84.41%**.
- Gated matched utility: **82.26%**.
- Utility difference: **2.15 percentage points** lower with enforcement in this matched attacked slice.
- 95% Wilson interval for the ungated scenario-level unauthorized-effect rate: **8.0%–14.3%**.
- 95% Wilson interval for the gated scenario-level unauthorized-effect rate: **0%–1.02%**.
- A two-sided Fisher exact comparison of scenario-level unauthorized-effect occurrence gives `p ≈ 6.0e-13`; because the planned full experiment was not completed, treat this as a descriptive/exploratory statistic rather than a preregistered confirmatory test.

### Matched attacked results by family

| Attack family | Matched scenarios | Ungated unauthorized effects | Ungated scenarios with ≥1 unauthorized effect | Gated unauthorized effects | Gated policy rejections |
| --- | ---: | ---: | ---: | ---: | ---: |
| AgentDojo `tool_knowledge` | 244 | 39 | 28 | **0** | 253 |
| Cross-action | 32 | 7 | 4 | **0** | 45 |
| Premature/order | 30 | 3 | 2 | **0** | 17 |
| Repeat | 32 | 6 | 3 | **0** | 26 |
| Cross-task transplant | 31 | 6 | 3 | **0** | 32 |
| Wrong selector candidate | 3 | 0 | 0 | **0** | 0 |
| **Total** | **372** | **61** | **40** | **0** | **373** |

The authority-adaptive subset contains **128 matched scenarios**. Across those scenarios the ungated runtime executed **22 policy-unauthorized protected effects** in **12** scenarios, while the gated runtime executed **0**. The adaptive prompts do not necessarily cause the model to execute the exact adversarial target tuple; these numbers measure provider effects outside the frozen task authority under those injected trajectories, not exact target-goal completion.

### Why the provider-boundary metric is central

AgentDojo's injection-task security oracle and the task-authority provider-effect metric answer different questions. A run can fail AgentDojo's injection-security oracle through read-only behavior, content leakage, or other effects outside this monitor's protected mutation scope. Conversely, the authority monitor's central question is whether a protected provider mutation outside the user's task authority succeeds.

The paper should therefore report AgentDojo utility/security metrics as benchmark context, but make **successful policy-unauthorized protected provider effects** the primary mechanism metric.

## Supplementary Attempt-3 evidence

Attempt 3 (`33213651318`) is invalid as the planned experiment because all 1,380 authority-adaptive rows failed at YAML parsing and later calls exhausted the API balance. It nevertheless produced **1,028 successfully executed non-adaptive trajectories** before exhaustion: 717 Slack and 311 Banking.

In the 422 matched successfully executed attacked `tool_knowledge` scenarios from Attempt 3:

- ungated execution produced **79 unauthorized protected provider effects across 61 scenarios**;
- gated execution produced **0 unauthorized protected provider effects**;
- gated attacked trajectories recorded **438 policy rejections** in the full valid attacked-gated slice.

This is supportive replication for the canonical attack path, but it must remain supplementary because Attempt 3's adaptive arm was not delivered correctly.

## Important qualification about the ungated effects

Do **not** describe all ungated unauthorized effects as successful execution of the attacker's exact requested tool call.

In Attempt 3, most unauthorized protected effects were classified as neither the exact canonical user-task mutation nor the exact injection-task mutation. This shows the model can generate task-policy deviations under adversarial trajectories, but exact injection-goal attribution is narrower. The paper's defensible wording is:

> Under adversarially injected trajectories, the ungated model produced protected provider effects outside the frozen task authority; the enforcing runtime prevented those out-of-policy protected effects from succeeding in the matched completed live trajectories.

For Attempt 4's adaptive arm, only a small fraction of out-of-policy executions exactly matched the constructed target tuple. Treat the adaptive-family evidence as stress on the authority boundary, not as an attack-target success-rate benchmark.

## Negative and limitation results that should remain in the paper

1. **Incomplete live matrix.** The 5,088-run preregistered experiment failed its zero-execution-error gate because the paid API balance was exhausted. Results are not missing at random: Slack ran first, while later suites are absent from Attempt 4. Do not generalize the V4-Pro live numbers to all four suites.
2. **Adaptive serialization failure in Attempt 3.** All 1,380 adaptive rows failed before reaching the model. This was corrected in Attempt 4, and Attempt 4 contained no parser errors, but the broader matrix then stopped on API balance.
3. **Development-domain evaluation.** The 60-task AgentDojo cohort helped shape the contract grammar. It is not a genuinely held-out task distribution.
4. **Trace over-constraint.** Separate live experiments exposed utility loss when incidental or incorrect canonical trace values, particularly timestamps, are promoted to authority. `travel-4` contains a direct prompt/ground-truth year contradiction, and `travel-7` demonstrates arbitrary trace-time narrowing.
5. **Protected-effect scope.** The mechanism constrains protected provider mutations. It does not by itself prevent every form of data leakage, unsafe natural-language output, or read-only prompt-injection consequence.
6. **Single live model family.** The strongest live evidence here is DeepSeek V4 Pro on the completed Slack slice, with earlier small DeepSeek Flash trials as supplementary evidence. Broad multi-model robustness is not established.

## Recommended paper claim language

### Strong version that is supported

> We synthesize stateful task-authority contracts that distinguish observation provenance from selection authority and enforce those contracts before provider mutations. Across 60 mutation-bearing AgentDojo tasks, the frozen mechanism blocked 370/370 corrected offline mutants and 230/230 constructible malicious provider-boundary trajectories with no malicious provider reach while preserving 60/60 reference utility. In a partial live DeepSeek V4 Pro Slack evaluation, 372 matched adversarial scenarios completed in both ungated and gated conditions. Ungated execution produced 61 policy-unauthorized protected effects across 40 scenarios, whereas gated execution produced none; the matched utility difference was 2.15 percentage points. The planned broader live matrix was not completed because of evaluation infrastructure and API-budget failures, so the live result is evidence for provider-boundary containment in the completed Slack slice rather than a broad prompt-injection-security claim.

### Claims to avoid

Do not claim:

- that all 5,088 live runs completed;
- that V1 achieved a preregistered publication-grade `scientific_go` result;
- that all 66/80 ungated effects were exact attacker-goal completions;
- that prompt injection is solved;
- that live V4-Pro evidence covers Workspace or Travel;
- that the adaptive family evaluation is complete;
- that this is multi-model robustness evidence.

## Paper narrative

The strongest narrative is:

1. Existing agent security often reasons about model behavior or information provenance, but provider effects require a separate authority boundary.
2. A value appearing in trusted output is not sufficient authority when output contains multiple candidates.
3. Selection witnesses make dynamic authority relational: the system authorizes a selected effect only when authorized evidence proves the task's selection predicate.
4. Deterministic and provider-boundary evaluation gives broad coverage over the 60-task mutation-bearing cohort.
5. Live DeepSeek V4 Pro evidence shows why the boundary matters: the ungated agent actually produced out-of-policy provider mutations under adversarial trajectories, while the same frozen authority layer prevented successful out-of-policy protected effects in the matched completed slice.
6. The main negative result is equally important: exact-trace-derived authority can over-constrain legitimate execution, so future systems need semantic envelopes rather than simply stronger exact-value fences.

## Evidence artifacts

- Attempt 3 workflow: `33213651318`
- Attempt 3 aggregate artifact: `9706064110`, digest `sha256:f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`
- Attempt 4 workflow: `33216337865`
- Attempt 4 aggregate artifact: `9706264710`, digest `sha256:6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`

No additional paid model runs are required or planned for this research slice.
