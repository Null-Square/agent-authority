# Agent Authority — Publication Readiness Entry Point

Status: **publication extension under external review**

Branch: `research/q1-publication-readiness`

Pull request: **#53**

The V1 research slice remains frozen and historically documented in `RESEARCH.md` and `benchmarks/task-contracts/RESULTS.md`. This branch adds a publication layer around that frozen mechanism; it does not rewrite the incomplete paid live experiment or modify the V1 authority mechanism to pass new tests.

## Start here

- `benchmarks/task-contracts/PUBLICATION_RESULTS.md` — exact publication-extension results, artifact identifiers, overhead numbers, and claim boundary.
- `benchmarks/task-contracts/FORMAL_MODEL.md` — operational model, trusted assumptions, and paper-level proofs.
- `benchmarks/task-contracts/PUBLICATION_PROTOCOL.md` — evaluation freeze, comparator definitions, post-freeze methodology, and CI acceptance gate.
- `benchmarks/task-contracts/RELATED_WORK_Q1.md` — current closest-work/novelty audit and external threat-taxonomy mapping.
- `benchmarks/task-contracts/PAPER_Q1_BLUEPRINT.md` — submission-shaped title, abstract, contribution structure, figures/tables, and claim rules.
- `benchmarks/task-contracts/REVIEWER_HANDOFF_Q1.md` — adversarial review checklist intended for a skeptical external reviewer.

## Headline evidence

The publication extension preserves the frozen V1 mechanism and adds direct tests of the proposed selection-authority contribution.

- Full Agent Authority: **96/96** reference + changed-evidence legitimate traces accepted; **385/385** publication-primary attacks blocked.
- Output provenance without selection witnesses: **96/96** legitimate accepted, but **2/2** wrong observed selector candidates authorized.
- Request/output provenance: **46/46** request self-authorization probes authorized; the full policy blocks all 46.
- Post-freeze author-generated stress suite: full policy **13/13** legitimate accepted and **13/13** attacks blocked; targeted ablations expose selection, request provenance, cardinality, precedence, and tuple failures.
- Original V1 provider-boundary result remains **230/230** malicious trajectories blocked with **0** malicious provider reaches.
- Authorization CPU microbenchmark on the publication CI host: median **8.223 µs**, p95 **68.772 µs**, p99 **228.509 µs** per measured 60-task reference-trace authorization decision sample.
- Partial live DeepSeek result remains a case study, not the headline experiment: 372 matched attacked Slack scenarios, 61 unauthorized protected effects ungated across 40 scenarios, 0 gated.

## Reproduction checkpoint

Successful offline publication-readiness workflow:

- run: `33324959812`;
- validated commit: `cbe6f1077fc3a570e5d625f267005f52a7239fb9`;
- artifact: `9735953563`;
- SHA-256: `bc53e9cf0ea94d458426a1b5d1732820c2fb11e08d9a8ee47b3438926a175ded`.

The workflow rebuilds the 60-task cohort, validates the frozen mechanism, re-runs the original strict/exact-transplant gates, executes the new baseline/ablation matrix and post-freeze suite, benchmarks decision overhead, and uploads the machine-readable checkpoint.

## Claim boundary

The package supports a paper centered on:

> **Observation provenance is not selection authority.** A protected effect on one resource among several legitimately observed candidates requires evidence that the task's selection relation chooses that resource, not merely evidence that the resource appeared in an authorized trace.

It does not establish universal prompt-injection prevention, production security, arbitrary natural-language intent compilation, independent third-party generalization, confidentiality for read-only/output channels, or broad multi-model robustness.

## Review status

The next action is **external adversarial publication-readiness review** using `REVIEWER_HANDOFF_Q1.md`.

The package should be called submission-ready only after that review has considered novelty, proof assumptions, comparator fairness, post-freeze independence, provider/evidence assumptions, and whether one independently authored evaluation or faithful external baseline is still a true venue-level blocker.
