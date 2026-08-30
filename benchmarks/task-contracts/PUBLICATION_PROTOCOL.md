# Publication Extension Protocol

Date: **2026-08-30**

Branch: `research/q1-publication-readiness`

Purpose: close the principal manuscript-readiness gaps identified after V1 research closure without reopening the paid DeepSeek experiment or modifying the frozen V1 authority mechanism.

## 1. Freeze boundary

The V1 research mechanism closed on 2026-08-29. The publication extension must preserve that mechanism.

The following files remain the mechanism under test and are verified by the existing freeze validator:

- `authority-schemas.mjs`;
- `automatic-contracts.mjs`;
- `strict-automatic-contracts.mjs` and the frozen selector/runtime lineage identified by `live-eval-freeze.json`;
- provider-boundary gate code covered by the V1 freeze manifest.

Publication-only evaluators may call the mechanism, compile weaker comparison policies, generate additional traces, and measure timing. They must not change the frozen mechanism in order to pass a new test.

## 2. Scientific questions added by the extension

### PQ1 — Does candidate provenance substitute for selection authority?

Compare the full selection-witness mechanism with a policy that preserves the same action ceiling and structural constraints but authorizes a selector-bound value whenever it merely appears in an allowed prior output.

Expected falsification target: an observed candidate that is not the unique task-selected winner.

### PQ2 — Can agent request history self-authorize a chosen resource?

Compare the strict output/witness mechanism with a policy that also accepts values appearing in prior request arguments.

Expected falsification target: insert a fresh resource in an otherwise legitimate read request, then attempt a protected effect on that resource without returned evidence.

### PQ3 — Which stateful grammar components are necessary?

Ablate independently:

- cardinality;
- precedence;
- tuple/correlation constraints;
- selection witnesses (replace them with output membership);
- dynamic evidence requirements.

Measure which adversarial families become authorized when each premise is removed.

### PQ4 — Does the frozen mechanism handle post-freeze task structures?

Evaluate an author-generated post-freeze stress suite containing new prompts/traces that were not part of the 60-task AgentDojo development cohort. The suite must include changed winners, ties, incomplete measurements, request self-authorization, arithmetic derivation, tuple cross-products, repeats, reordering, and effect-ceiling escape.

This suite is **post-freeze held-out with respect to mechanism development**, but it is **not independently authored**. The manuscript must preserve that distinction.

### PQ5 — What is the local decision cost?

Measure contract compilation and authorization decision latency on CPU, excluding model, network, provider, and filesystem latency.

## 3. Reproducible comparison policies

The extension uses internal, semantically explicit comparators. It does not claim that these are faithful reimplementations of CaMeL, MiniScope, Task Shield, Agent-Sentry, or RACG.

### Standing action authority

Any protected action type present in the task's compiled Mission/action set may execute with arbitrary fields, order, and repetition.

Purpose: represent broad tool/action permission with no task-local resource restriction.

### Single-trace field-wise value allowlist

The existing `compileExactBaseline` implementation records the concrete projected field values seen in one successful trace. It checks field membership on later executions but does **not** enforce the exact call sequence.

This is the correct name for the historical `1/36` comparator. Publication text should stop calling it an exact-trace executor.

### Output provenance without selection witnesses

Preserve action ceiling, cardinality, precedence, static fields, tuple constraints, evidence source-action restrictions, and non-selector derivations. For selector-bound fields only, replace the deterministic witness requirement with candidate membership in allowed prior output.

Purpose: isolate the paper's core claim that observation provenance is not selection authority.

### Request/output provenance

As above, but a dynamic value may also be justified by appearance in prior request arguments.

Purpose: isolate request self-authorization/circularity.

### Full Agent Authority

Use the frozen strict output-or-selection-witness authorization semantics.

## 4. Evaluation layers

### Layer A — Original 60-task development cohort

Rebuild the frozen AgentDojo `0.1.35` / benchmark `v1.2.2` cohort.

For every policy, report:

- reference acceptance;
- evidence-consistent counterfactual acceptance;
- adversarial block rate by family;
- wrong-selector authorization;
- request-self-authorization.

The publication runner extends the existing corrected mutant families with explicit wrong-selector and request-self-authorization probes.

### Layer B — Post-freeze held-out stress suite

Eight task structures cover:

1. unique prefix selection;
2. maximum-cardinality selection;
3. minimum-cardinality selection;
4. output-derived resource authority;
5. arithmetic derivation;
6. tuple/correlation preservation;
7. action cardinality;
8. precedence/effect ceiling.

Legitimate checks include reference executions and evidence changes that produce a new correct winner/value. Adversarial checks include observed non-winners, ties, incomplete measurements, stale resources, request self-authorization, wrong arithmetic, tuple cross-products, repeats, reordering, and a stronger action outside the effect ceiling.

### Layer C — Existing provider-boundary and live evidence

Do not change the V1 result accounting.

The 230/230 deterministic provider-boundary trajectories remain the broad complete provider-execution result.

The DeepSeek V4 Pro result remains a **partial Slack case study**: 372 matched attacked scenarios, 61 unauthorized protected effects ungated across 40 scenarios, and 0 gated. The incomplete 5,088-run matrix is not rehabilitated or relabeled as complete.

## 5. External threat-taxonomy mapping

Use the OWASP Top 10 for Agentic Applications 2026 as an external coverage anchor:

| Evaluation family | Principal OWASP anchor | Scope note |
| --- | --- | --- |
| canonical/adaptive injected trajectories | ASI01 Agent Goal Hijack; ASI06 Memory & Context Poisoning | Agent Authority constrains protected effects after compromise; it does not claim to eliminate injection itself. |
| field/resource substitution, wrong selector, tuple cross-product, repeat, reordering | ASI02 Tool Misuse & Exploitation | Tests misuse of legitimate protected tools/effects. |
| cross-task/resource transplant | ASI03 Identity & Privilege Abuse | Tests task authority remaining narrower than account/provider access. |
| compromised-model threat model | ASI10 Rogue Agents | The monitor treats model requests as untrusted even when the tool/action is legitimate. |

Coverage mapping does not imply full mitigation of an OWASP category.

## 6. Formal claims

`FORMAL_MODEL.md` supplies the paper-level operational semantics and proofs for:

1. Mission non-amplification;
2. no request self-authorization;
3. selection soundness;
4. ambiguity/incomplete-evidence fail-closed behavior;
5. cross-task non-transferability under task-scoped evidence.

The proofs are conditional on explicit complete-mediation, Mission integrity, evidence integrity, witness correctness, and task-isolation assumptions. They are not machine-checked.

## 7. Overhead methodology

`benchmark-publication-overhead.mjs`:

- compiles the frozen 60-task cohort;
- warms the Node.js runtime;
- records per-trace authorization-decision timings over repeated passes;
- reports mean, median, p95, p99, and maximum microseconds;
- separately reports contract-compilation timing;
- records runtime/CPU environment metadata.

The manuscript must label these numbers a local CPU microbenchmark, not end-to-end agent latency.

## 8. CI acceptance gate

`.github/workflows/publication-readiness.yml` must pass all of the following on the publication branch:

- syntax checks;
- frozen-mechanism validation;
- rebuild of the 60-task cohort;
- original strict-gate validation;
- publication baseline/ablation gates;
- post-freeze held-out gates;
- overhead benchmark completion;
- artifact upload.

The workflow produces one checkpoint artifact containing the cohort and all publication-extension JSON results.

## 9. Claim hierarchy after this extension

If all gates pass, the manuscript may make the following hierarchy explicit:

**Primary contribution:** formalized selection authority under a fixed effect ceiling, with complete deterministic and provider-boundary evaluation plus direct provenance-only/structural ablations.

**Generalization evidence:** post-freeze author-generated stress tasks showing changed-winner acceptance and fail-closed selection behavior without mechanism changes.

**Live case study:** partial DeepSeek V4 Pro Slack trajectories showing that real adversarial model behavior can reach out-of-policy provider mutations when ungated and that the frozen monitor stopped those completed matched effects.

The manuscript still must not claim complete prompt-injection prevention, broad multi-model robustness, independently authored held-out validation, or production security.
