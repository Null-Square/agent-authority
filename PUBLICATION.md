# Agent Authority — Publication Package

Status: **Q1 manuscript and reproducible evidence package prepared for external review**

Branch: `research/q1-publication-readiness`

Pull request: **#53**

## Read the paper first

- **`benchmarks/task-contracts/MANUSCRIPT_Q1.md` — polished manuscript draft and primary review target.**
- `benchmarks/task-contracts/PAPER_Q1_BLUEPRINT.md` — editorial and camera-ready production guide.
- `benchmarks/task-contracts/PUBLICATION_RESULTS.md` — exact quantitative record and artifact identifiers.
- `benchmarks/task-contracts/FORMAL_MODEL.md` — operational model and full paper-level proof development.
- `benchmarks/task-contracts/PUBLICATION_PROTOCOL.md` — freeze, comparator, stress-suite, overhead, and CI protocol.
- `benchmarks/task-contracts/RELATED_WORK_Q1.md` — current novelty audit, including the August 27, 2026 SARA paper.
- `benchmarks/task-contracts/REVIEWER_HANDOFF_Q1.md` — adversarial external review checklist.

## Paper thesis

> **Authorized observation is not selection authority.** When legitimate execution reveals several candidate resources, provenance can establish that each candidate came from an authorized path without establishing which candidate the user's task selected for a protected effect. Agent Authority requires a deterministic selection witness over task-rooted semantics and authorized runtime evidence before the selected resource gains dynamic effect authority.

This is intentionally more precise than a generic provenance-versus-authorization claim. The latest literature includes SARA, which independently separates action induction from runtime execution authorization. The manuscript positions selection authority as a finer-grained resource-level proof obligation inside runtime authorization.

## Headline evidence

- Full Agent Authority: **96/96** reference + changed-evidence legitimate executions accepted; **385/385** publication-primary adversarial traces blocked.
- Output provenance without selection witnesses: the same **96/96** legitimate acceptance, but **2/2** wrong observed selector candidates authorized.
- Request/output provenance: **46/46** request self-authorization probes authorized; the full policy blocks all 46.
- Post-freeze task structures: full policy **13/13** legitimate accepted and **13/13** attacks blocked; targeted ablations expose selection, request provenance, cardinality, precedence, and tuple failures.
- Provider-boundary result: **230/230** constructible malicious trajectories blocked with **0** malicious provider reaches.
- Authorization CPU microbenchmark: median **8.223 µs**, p95 **68.772 µs**, p99 **228.509 µs** per measured decision on the recorded CI host.
- Completed matched DeepSeek V4 Pro Slack case study: **372** attacked scenarios, **61** policy-unauthorized protected effects ungated across **40** scenarios, **0** gated.

## Paper structure

The manuscript is built around a simple selector counterexample, then proceeds through:

1. problem definition and reference-monitor contract;
2. selection-authority formalization;
3. provider-boundary system design;
4. five formal security properties;
5. implementation;
6. baseline, ablation, post-freeze, provider-boundary, live-case-study, and overhead evaluation;
7. current related work led by SARA;
8. design implications and conclusion.

Three Mermaid figures are embedded in the manuscript:

- observation provenance versus selection authority;
- provider-boundary reference-monitor architecture;
- fixed Mission effect ceiling with growing resource authority.

## Reproduction

The publication workflow validates the frozen V1 mechanism, rebuilds the 60-task cohort, re-runs the strict and exact-transplant gates, executes the publication baseline/ablation matrix and post-freeze suite, benchmarks authorization overhead, and uploads a machine-readable checkpoint.

The previously validated quantitative checkpoint is:

- workflow run `33324959812`;
- commit `cbe6f1077fc3a570e5d625f267005f52a7239fb9`;
- artifact `9735953563`;
- SHA-256 `bc53e9cf0ea94d458426a1b5d1732820c2fb11e08d9a8ee47b3438926a175ded`.

The current manuscript-polish commits retrigger the same repository checks. The paper numbers continue to come from the frozen quantitative evidence rather than from prose-only edits.

## Review target

External review should focus on whether the manuscript successfully defends the following contribution:

> **Selection over authorized runtime evidence is a first-class authorization relation for protected agent effects.**

The cleanest evidence for that claim is the matched-utility provenance comparison, the formal selection-soundness result, the tie/incomplete-evidence behavior, and the provider-boundary evaluation.
