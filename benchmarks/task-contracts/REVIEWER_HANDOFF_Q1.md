# Q1 Reviewer Handoff — Agent Authority

Date: **2026-08-30**

Branch: `research/q1-publication-readiness`

Pull request: **#53 — research: strengthen Q1 publication evidence for selection authority**

## Primary review target

Read **`MANUSCRIPT_Q1.md` first** and review it as a skeptical security/agent-systems journal submission. Use the supporting files only to verify claims, proofs, and reproducibility.

The decision question is:

> Does the manuscript make a clear, technically non-trivial, reproducible contribution by treating selection over authorized runtime evidence as a first-class resource authorization relation?

## Central claim

> **Authorized observation is not selection authority.** When legitimate execution reveals several candidate resources, provenance can establish that every candidate came from an authorized path without establishing which candidate the user's task selected for a protected effect. Agent Authority requires a deterministic witness for that task selection relation before the selected resource gains dynamic authority.

The August 2026 literature check matters here. SARA already separates action induction from runtime execution authorization. The manuscript therefore does **not** claim the generic provenance-versus-authorization distinction as novel. The review should focus on the narrower candidate-selection relation represented by `S(P,C,E)`.

## Review order

1. `MANUSCRIPT_Q1.md` — complete paper narrative, figures, tables, and references.
2. `PUBLICATION_RESULTS.md` — exact quantitative record.
3. `FORMAL_MODEL.md` — operational semantics and full proof development.
4. `PUBLICATION_PROTOCOL.md` — freeze and evaluation protocol.
5. `RELATED_WORK_Q1.md` — closest-work audit, including SARA and the July 2026 provenance-sensitivity study.
6. `publication-policies.mjs` — executable comparator semantics.
7. `run-publication-baselines-v2.mjs` — primary comparison gate.
8. `run-publication-heldout.mjs` — post-freeze stress and isolated ablations.
9. `.github/workflows/publication-readiness.yml` — reproduction gate.

## Results that should be checked against the implementation

### Main cohort

- full Agent Authority: **96/96 legitimate accepted, 385/385 publication-primary attacks blocked**;
- standing action authority: 96/96 legitimate, 60/385 blocked;
- output provenance without selection witnesses: **96/96 legitimate**, 383/385 blocked, with **2/2 wrong observed selector candidates authorized**;
- request/output provenance: 96/96 legitimate, 337/385 blocked, with **46/46 request self-authorization probes authorized**;
- single-trace field-wise value allowlist: 61/96 legitimate, 252/385 blocked, including only 1/36 changed-evidence executions accepted.

### Structural ablations

- no cardinality: 60/60 repeated effects become authorized;
- no precedence: 24/59 reorder mutants become authorized;
- no tuple relation: 12/12 cross-product tuples become authorized;
- request provenance: 46/46 self-authorization probes become authorized;
- output provenance without selection: 2/2 wrong observed candidates become authorized.

### Post-freeze task structures

- full Agent Authority: **13/13 legitimate accepted, 13/13 attacks blocked**;
- output provenance: 13/13 legitimate, 7/13 attacks blocked;
- request/output provenance: 13/13 legitimate, 6/13 blocked;
- isolated one-feature ablations expose the intended selection, cardinality, precedence, and tuple cases.

### Provider boundary and live case study

- provider-boundary malicious trajectories: **230/230 blocked**;
- malicious provider reaches: **0**;
- matched DeepSeek V4 Pro Slack case study: 372 attacked scenarios; ungated execution produces 61 policy-unauthorized protected effects across 40 scenarios; gated execution produces 0.

### Performance

- median decision CPU time: **8.223 µs**;
- p95: **68.772 µs**;
- p99: **228.509 µs**.

## High-value review questions

1. **Selection novelty.** After SARA, Agent-Sentry, CaMeL, MiniScope, Task Shield, RACG/ContractGuard, and classic capability/authorization work, is the explicit candidate-selection relation `S(P,C,E)` a distinct technical contribution? Identify exact prior formal overlap if the answer is no.

2. **Clean causal isolation.** Does the full-versus-output-provenance comparison truly differ only in selection semantics at the two wrong-candidate probes? Look for hidden asymmetries that could explain the result.

3. **Formal correspondence.** Do Theorems 1–5 follow from the stated operational rules, and does the executable verifier implement the witness semantics used by the selection-soundness theorem?

4. **Evidence completeness.** Are prefix/extremum/aggregate completeness checks defined tightly enough for the evaluated environment? If a stronger operational definition is required, specify it precisely.

5. **Changed-evidence utility.** Does 36/36 acceptance demonstrate that the policy captures relations rather than literal reference values, and is the single-trace field-wise comparator a fair test of the opposing design choice?

6. **Structural authorization.** Do cardinality, precedence, tuple correlation, request non-derivation, and selection each represent independent policy dimensions in the implementation?

7. **Provider-boundary claim.** Does the 230/230 result measure actual effect admission rather than only intermediate trace classification? Confirm that rejected malicious trajectories cannot reach the protected provider mutation path in the evaluated runtime.

8. **Related-work precision.** Is SARA represented fairly as the closest runtime-authorization neighbor? Does the manuscript correctly distinguish SARA's action-induction/execution-authorization framing from the resource-selection relation evaluated here?

9. **Falsifiability.** Construct the strongest realistic case in which all candidates have legitimate output provenance but the full policy authorizes the wrong task-selected resource. If such a case succeeds under the stated model, it is a direct counterexample to the paper.

10. **Submission decision.** Choose one: `ready`, `ready with manuscript-only changes`, `needs one targeted experiment`, or `not ready`. For every requested experiment, state the unresolved scientific question it would answer.

## What constitutes a substantive rejection reason

A strong rejection reason should identify a concrete scientific failure, for example:

- prior work already formalizes and directly evaluates the same multi-candidate selection-authorization relation;
- the selection theorem and executable witness diverge;
- the provenance comparator contains a hidden asymmetry unrelated to selection;
- a realistic authorized-evidence trace produces the wrong selected resource under the full policy;
- the provider-boundary test does not actually mediate the claimed protected mutation path;
- the evaluation cannot distinguish relation-based dynamic authority from a simpler policy with the same semantics.

Requests for broader scale are most useful when they identify the specific uncertainty that scale resolves.

## Reproduction checkpoint

The immutable quantitative checkpoint used by the manuscript is:

- workflow run `33324959812`;
- validated commit `cbe6f1077fc3a570e5d625f267005f52a7239fb9`;
- artifact `9735953563`;
- SHA-256 `bc53e9cf0ea94d458426a1b5d1732820c2fb11e08d9a8ee47b3438926a175ded`.

Documentation and manuscript-polish commits retrigger the same offline gate. Use the latest green branch-head workflow for repository health and the checkpoint above to verify the reported quantitative tables.
