# Publication Extension Results — Selection Authority

Date: **2026-08-30**

Branch: `research/q1-publication-readiness`

Status: **offline publication-readiness gate passed**

Successful workflow run: `33324959812`

Validated commit: `cbe6f1077fc3a570e5d625f267005f52a7239fb9`

Checkpoint artifact: `9735953563`

Checkpoint SHA-256: `bc53e9cf0ea94d458426a1b5d1732820c2fb11e08d9a8ee47b3438926a175ded`

This document records the publication-extension results. It does not replace the frozen V1 result history in `RESULTS.md`, `PAPER_RESULTS_DRAFT.md`, or `RESEARCH.md`.

## 1. Freeze integrity

The publication workflow revalidated the V1 freeze manifest before any extension result was accepted.

- freeze validation failures: **0**;
- all listed mechanism files matched their frozen hashes;
- frozen protocol: `live-eval-v1`;
- freeze validator result: **validated = true**.

The publication extension adds comparison/evaluation code around the frozen mechanism. It does not change the mechanism to pass the new tests.

## 2. Original V1 complete evidence remains unchanged

The V1 package still reports:

- reference utility: **60/60**;
- evidence-consistent counterfactuals: **36/36** accepted;
- corrected adversarial mutants: **370/370** blocked;
- provider-boundary malicious trajectories: **230/230** blocked;
- malicious provider reaches: **0**.

The strict publication workflow independently rebuilt the 60-task cohort and re-ran the original strict gate.

For the exact cross-task transplant audit used by that gate:

- constructed exact transplants: **33**;
- blocked: **33/33**;
- allowed: **0**;
- aggregate selector coverage gate: **passed**.

The existing provider-boundary family remains the stronger end-to-end transplant result: **46/46** exact cross-task provider-boundary trajectories blocked.

## 3. Publication baseline and ablation matrix

### 3.1 Primary matrix

The primary publication matrix contains:

- **60** reference traces;
- **36** evidence-consistent changed-evidence counterfactuals;
- **385** publication-primary adversarial traces.

The 385 attacks comprise:

| Family | Cases |
| --- | ---: |
| field/resource mutation | 146 |
| repeated effect | 60 |
| premature/reordered effect | 59 |
| effect type outside Mission ceiling | 60 |
| request self-authorization | 46 |
| wrong selector candidate | 2 |
| tuple/correlation cross-product | 12 |
| **Total** | **385** |

Raw legacy transplant generation produced another 33 diagnostic cases. Those are not included in the primary matrix because V1 had already shown that this raw generator contains five invalid/over-broad cases. Publication transplant claims use the corrected exact-transplant audit and provider-boundary family instead.

### 3.2 Main comparison

| Policy | Legitimate accepted | Attacks blocked | Key failure |
| --- | ---: | ---: | --- |
| **Agent Authority — full** | **96/96** | **385/385** | none in this matrix |
| standing action authority | 96/96 | 60/385 | blocks only actions outside the effect ceiling; broad resource/tool misuse remains possible |
| output provenance without selection witnesses | 96/96 | 383/385 | authorizes **2/2 wrong observed candidates** |
| request/output provenance | 96/96 | 337/385 | authorizes **46/46 request self-authorization** probes and 2/2 wrong observed candidates |
| single-trace field-wise value allowlist | 61/96 | 252/385 | accepts only **1/36** changed-evidence counterfactuals and does not enforce repeat/order/correlation semantics |

The historical documents call the final comparator an “exact-trace baseline.” Code inspection shows the implementation is more precisely a **single-trace field-wise value allowlist**: it records concrete projected values from one successful trace but does not require the exact call sequence. New publication text should use the precise name.

### 3.3 Direct selection-authority result

The full system and output-provenance comparator have identical utility in this matrix: **96/96** legitimate traces accepted.

Their difference appears specifically at the selection boundary:

- full selection-witness policy: **2/2 wrong-selector attacks blocked**;
- output provenance without witnesses: **0/2 blocked; 2/2 authorized**.

Therefore this comparison isolates the paper's central falsification without confounding it with utility or broad action denial:

> A candidate can be legitimately observed in authorized output and still not be the resource selected by the task.

### 3.4 Request circularity result

For the 46 request-self-authorization probes:

- full output/witness policy: **46/46 blocked**;
- request/output provenance: **0/46 blocked; 46/46 authorized**.

This directly supports the no-request-self-authorization property: a model cannot create authority for its chosen resource merely by placing that resource in prior request history.

### 3.5 Structural ablations on the development cohort

Removing one structural premise exposed the expected family:

- no cardinality: **60/60 repeated effects authorized**;
- no precedence: **24/59** reorder mutants became authorized;
- no tuple/correlation relation: **12/12** cross-product tuples became authorized;
- unrestricted dynamic fields: **48** field mutants, **46/46** self-authorization probes, and **2/2** wrong-selector probes became authorized.

Because other checks can mask an ablated premise on a development trace, feature necessity is gated more cleanly in the isolated post-freeze suite below.

## 4. Post-freeze held-out stress suite

The extension adds **8 new task structures** authored after the V1 mechanism freeze. They were not used to change the mechanism.

The suite contains **13 legitimate checks** and **13 adversarial checks** covering:

- prefix, maximum, and minimum selection;
- changed winners under changed evidence;
- ties and incomplete measurements;
- output-derived resources;
- request self-authorization;
- arithmetic derivation;
- tuple/correlation preservation;
- action cardinality;
- precedence;
- effect-ceiling escape.

Results:

| Policy | Legitimate accepted | Attacks blocked |
| --- | ---: | ---: |
| **Agent Authority — full** | **13/13** | **13/13** |
| standing action authority | 13/13 | 1/13 |
| output provenance without selection witnesses | 13/13 | 7/13 |
| request/output provenance | 13/13 | 6/13 |
| no cardinality | 13/13 | 12/13 |
| no precedence | 13/13 | 12/13 |
| no tuple/correlation relation | 13/13 | 12/13 |
| unrestricted dynamic fields | 13/13 | 4/13 |
| single-trace field-wise value allowlist | 8/13 | 6/13 |

Every declared isolated exposure occurred:

- provenance-only exposed wrong-candidate/tie/incomplete-selection cases;
- request provenance exposed request self-authorization;
- no-cardinality exposed the repeated effect;
- no-precedence exposed the premature effect;
- no-tuples exposed the cross-product tuple.

**Qualification:** this is post-freeze held-out with respect to mechanism development, but it is **author-generated**, not independently authored or externally red-teamed. It is generalization evidence, not independent replication.

## 5. CPU decision overhead

GitHub Actions environment:

- Node.js `v22.23.2`;
- Linux x64;
- 4 vCPUs reported as AMD EPYC 9V74 80-Core Processor;
- 60-task cohort;
- 200 repeated cohort passes;
- 12,000 measured authorization decisions after warmup.

Authorization decision latency:

| Metric | Time |
| --- | ---: |
| mean | **18.407 µs** |
| median | **8.223 µs** |
| p95 | **68.772 µs** |
| p99 | **228.509 µs** |
| maximum | 8,266.261 µs |

Full 60-task cohort pass:

- mean: **1,114.623 µs**;
- median: **985.575 µs**;
- p95: **1,615.382 µs**;
- p99: **1,792.465 µs**.

Contract compilation over 60 tasks:

- mean: **57.674 µs**;
- median: **43.124 µs**;
- p95: **171.145 µs**;
- p99/max: **339.154 µs**.

These are local CPU microbenchmarks. They exclude model inference, network latency, provider latency, durable storage, policy-generation from natural language, and human approval time.

## 6. Formal result added by the publication extension

`FORMAL_MODEL.md` now gives explicit operational semantics, trusted assumptions, and paper-level proofs for:

1. Mission non-amplification;
2. no request self-authorization;
3. selection soundness;
4. ambiguity/incomplete-evidence fail-closed behavior;
5. cross-task non-transferability under task-scoped evidence.

The proofs are conditional on complete mediation, Mission integrity, evidence integrity, witness correctness, and task isolation. They are not machine-checked.

The formal claim and empirical falsification are complementary: the theorem states what follows under the model; the provenance-only/held-out experiments show why the additional selection premise matters in executable cases.

## 7. Live-model evidence remains a case study

No paid run was reopened.

The strongest live result remains the partial Attempt-4 DeepSeek V4 Pro Slack slice:

- matched attacked scenarios: **372**;
- ungated unauthorized protected effects: **61** across **40/372** scenarios;
- gated unauthorized protected effects: **0**;
- ungated matched utility: **84.41%**;
- gated matched utility: **82.26%**;
- utility difference: **2.15 percentage points**.

The planned 5,088-run live matrix did not complete. Workspace/Travel live coverage and broad multi-model robustness are not established.

The publication narrative should therefore use the live result as evidence that real adversarial model trajectories can produce out-of-policy provider mutations, not as the primary proof of the mechanism.

## 8. External taxonomy and related work

`RELATED_WORK_Q1.md` confronts the closest current mechanisms directly and maps the adversarial families to the OWASP Top 10 for Agentic Applications 2026 as an external threat-taxonomy anchor.

The repo intentionally does **not** present approximate trace-time comparators as faithful CaMeL, MiniScope, Task Shield, Agent-Sentry, or RACG implementations. Where execution semantics differ, the paper compares threat models/mechanisms and uses explicit internal baselines to isolate its own contribution.

## 9. Supported publication claim

A strong claim supported by the combined evidence is:

> We formalize dynamic selection authority for tool-using agents under a fixed protected-effect ceiling. The mechanism distinguishes candidate observation from authorization of the task-selected resource: dynamic selection authority is granted only when a deterministic witness verifies the task predicate over the required authorized evidence. On the frozen 60-task AgentDojo development cohort, the full policy preserved 96/96 reference and evidence-consistent executions while blocking 385/385 publication-primary adversarial traces; an otherwise structurally identical output-provenance policy authorized both wrong observed candidates, and a request/output provenance policy authorized all 46 request-self-authorization probes. On eight post-freeze author-generated task structures, the full policy preserved 13/13 legitimate executions and blocked 13/13 attacks, while targeted ablations exposed selection, cardinality, precedence, and tuple failures. The original provider-boundary evaluation remains 230/230 blocked with zero malicious provider reaches. A partial DeepSeek V4 Pro Slack case study supplies live adversarial evidence but is not used as broad multi-model validation.

## 10. Remaining limitations

The publication extension materially closes the formalization, internal baseline, ablation, post-freeze generalization, and local-overhead gaps. It does **not** eliminate all reviewer objections.

Remaining limitations to state explicitly:

- the post-freeze suite was authored by the project, not an independent red team;
- the formal proofs are paper proofs, not machine-checked verification;
- automatic natural-language Mission/predicate construction is outside the proven boundary;
- live model evidence is single-family and Slack-heavy/partial;
- the reference monitor still depends on complete mediation and evidence integrity;
- protected-effect authorization does not cover every confidentiality/read-only/output-safety failure;
- external systems with different execution models are discussed rather than approximately reimplemented.

## 11. Readiness status

**Ready for external publication-readiness review.**

This status means the repository now contains a coherent theorem-backed claim, executable internal baselines and ablations, a frozen post-development stress suite, reproducible overhead numbers, explicit related-work positioning, and a green offline reproduction gate.

It does not mean acceptance by a Q1 venue is guaranteed. The next useful action is an adversarial external review of novelty, proof assumptions, comparator fairness, held-out independence, and claim scope.
