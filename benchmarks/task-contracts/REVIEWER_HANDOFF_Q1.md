# Q1 Reviewer Handoff — Agent Authority Publication Extension

Date: **2026-08-30**

Branch: `research/q1-publication-readiness`

Pull request: **#53 — research: strengthen Q1 publication evidence for selection authority**

## Review instruction

Please review this package as a skeptical security/agent-systems journal reviewer. The goal is not to confirm the authors' interpretation. Try to identify a reason the central claim, proof, comparator design, evaluation, or novelty argument would fail peer review.

The question to answer at the end is:

> Is this evidence package ready to support drafting/submission of a strong Q1-level paper centered on selection authority, and if not, what is the smallest concrete set of missing work?

## Central claim to attack

> Observation provenance is not selection authority. When authorized execution reveals multiple legitimate candidate resources, a later protected effect on one candidate requires evidence that the task predicate selects that candidate; candidate membership alone is insufficient. Agent Authority realizes this with deterministic selection witnesses under a fixed Mission/effect ceiling.

The claim is deliberately narrower than general prompt-injection prevention, least privilege, capability security, task alignment, or provenance security.

## Files to review first

1. `PUBLICATION_RESULTS.md` — exact new quantitative results and limitations.
2. `FORMAL_MODEL.md` — operational semantics, assumptions, and proofs.
3. `PUBLICATION_PROTOCOL.md` — freeze boundary, comparator definitions, held-out methodology, and claim hierarchy.
4. `RELATED_WORK_Q1.md` — closest-work novelty audit.
5. `publication-policies.mjs` — executable comparator semantics.
6. `run-publication-baselines-v2.mjs` — primary development-cohort comparison gate.
7. `run-publication-heldout.mjs` — isolated post-freeze task/ablation suite.
8. `.github/workflows/publication-readiness.yml` — complete offline reproduction gate.
9. Existing V1 `PAPER_RESULTS_DRAFT.md`, `PAPER_RESEARCH_SPEC.md`, and `RESEARCH.md` — historical evidence/claim boundary.

## Reproduction checkpoint

Successful publication workflow:

- run: `33324959812`;
- validated commit: `cbe6f1077fc3a570e5d625f267005f52a7239fb9`;
- artifact ID: `9735953563`;
- artifact SHA-256: `bc53e9cf0ea94d458426a1b5d1732820c2fb11e08d9a8ee47b3438926a175ded`.

The checkpoint contains the rebuilt 60-task cohort, freeze validation, original strict result, exact-transplant audit, publication baseline matrix, post-freeze held-out result, and CPU overhead result.

A subsequent documentation-only commit may retrigger CI; use the latest green publication workflow when one exists, but the quantitative results above correspond to the immutable checkpoint identified here.

## Results that must survive review

### Development cohort

- full Agent Authority: **96/96 legitimate accepted, 385/385 publication-primary attacks blocked**;
- standing action authority: 96/96 legitimate, 60/385 attacks blocked;
- output provenance without selection witnesses: 96/96 legitimate, 383/385 blocked, but **2/2 wrong observed candidates authorized**;
- request/output provenance: 96/96 legitimate, 337/385 blocked, including **46/46 request self-authorization probes authorized**;
- single-trace field-wise value allowlist: **61/96** legitimate and 252/385 attacks blocked; among changed-evidence counterfactuals it accepts **1/36**.

### Structural ablations

- remove cardinality: 60/60 repeat mutants become authorized;
- remove precedence: 24/59 reorder mutants become authorized;
- remove tuple relation: 12/12 cross-product mutants become authorized;
- unrestricted dynamic fields authorize 48 field mutants, 46/46 self-authorization probes, and 2/2 wrong-selector probes.

### Post-freeze suite

Eight author-generated task structures, frozen mechanism unchanged:

- full Agent Authority: **13/13 legitimate accepted, 13/13 attacks blocked**;
- output provenance: 13/13 legitimate, 7/13 attacks blocked;
- request/output provenance: 13/13 legitimate, 6/13 blocked;
- one-feature structural ablations each expose their isolated intended attack;
- single-trace field-wise allowlist: 8/13 legitimate, 6/13 blocked.

### Existing provider/live evidence

- corrected V1 deterministic mutants: **370/370 blocked**;
- provider-boundary trajectories: **230/230 blocked, 0 malicious provider reaches**;
- partial DeepSeek V4 Pro Slack case study: 372 matched attacked scenarios; ungated 61 unauthorized protected effects across 40 scenarios; gated 0; utility difference 2.15 pp.

## Questions the reviewer should answer explicitly

1. **Novelty.** Does the candidate/selection distinction remain novel and non-trivial after comparing against CaMeL, MiniScope, Task Shield, Agent-Sentry, RACG/ContractGuard, capabilities, information-flow control, and classic authorization concepts? If not, identify the closest prior construction and the exact overlap.

2. **Formal soundness.** Are Theorems 1–5 actually implied by the stated operational rules and assumptions? Is any critical premise smuggled into A1–A5 so strongly that the theorem becomes tautological or uninteresting?

3. **Selection witness semantics.** Does “complete authorized evidence” have an operationally meaningful definition for prefix/extremum/aggregate selectors, especially when the provider may paginate, omit, reorder, or change data concurrently?

4. **Complete mediation.** Is the provider-effect boundary realistic enough to support the paper's security claim, and does the implementation evidence demonstrate that all protected provider mutation paths in the evaluation pass through it?

5. **Comparator fairness.** Are standing authority, output provenance, request/output provenance, and the single-trace field-wise allowlist appropriate internal baselines for isolating the contribution? What stronger reproducible comparator is essential before submission?

6. **External-system comparison.** Is it scientifically preferable that the repo avoids claiming approximate CaMeL/MiniScope/RACG reimplementations, or does a Q1 reviewer still require at least one faithful end-to-end external baseline?

7. **Development circularity.** Does the 60-task AgentDojo cohort remain too entangled with grammar development despite the post-freeze suite? How much independent held-out/red-team evidence would be necessary to remove this objection?

8. **Held-out wording.** Is “post-freeze author-generated held-out with respect to mechanism development” sufficiently precise, or should the paper avoid the word “held-out” entirely unless a third party authors the suite?

9. **Transplant accounting.** Is excluding the known-invalid raw transplant generator from the publication-primary matrix methodologically sound given that the corrected exact-transplant audit blocks 33/33 and the provider-boundary family blocks 46/46? Does the diagnostic 5/33 raw allowance reveal any unaddressed mechanism flaw rather than generator invalidity?

10. **Attack independence.** Does mapping to OWASP Agentic Top 10 sufficiently reduce taxonomy circularity, or is an externally sourced mutation corpus required?

11. **Overhead.** Are the CPU decision numbers useful and reported honestly, given they exclude model/provider/storage/policy-generation/human costs? Which additional systems-cost number is necessary for publication?

12. **Live evidence.** Is demoting the incomplete DeepSeek matrix to a partial case study sufficient, or does the venue still require a balanced multi-model live experiment even though the deterministic/formal result is primary?

13. **Claim scope.** Find any sentence in the package that could be interpreted as claiming prompt-injection prevention, arbitrary semantic compilation, production security, confidentiality protection, or broad model robustness beyond the evidence.

14. **Falsifiability.** What single experiment would most likely falsify the selection-authority contribution? Is that experiment already represented by the wrong-candidate, changed-winner, tie, incomplete-measurement, or self-authorization probes?

15. **Q1 decision.** Choose one: `ready`, `ready with manuscript-only changes`, `needs one targeted experiment`, or `not ready`. Give the smallest blocking set and distinguish true blockers from nice-to-have extensions.

## Known limitations — do not rediscover these as if hidden

The authors already acknowledge:

- post-freeze tasks are author-generated rather than independently authored;
- formal proofs are not machine checked;
- natural-language authority compilation is outside the proven boundary;
- live model evidence is partial and not multi-model;
- the monitor depends on complete mediation, evidence integrity, and witness correctness;
- protected-effect authorization does not solve arbitrary data leakage/read-only/output safety;
- external architectures are not approximated and mislabeled as faithful baselines.

A useful review should say whether any of these is a **submission blocker**, not merely repeat them.

## What would count as a high-value rejection reason

A strong rejection reason would identify one of the following:

- prior work already proves/evaluates essentially the same candidate-versus-selection authorization relation;
- the selection theorem does not correspond to the implemented verifier;
- a realistic trace authorized by the full policy violates the task-selected resource relation under the stated threat model;
- the baseline result is caused by a hidden asymmetry unrelated to selection witnesses;
- the post-freeze suite is too coupled to the implementation to provide any generalization evidence and a specific independent evaluation is indispensable;
- a provider/evidence assumption invalidates the claimed enforcement boundary in the evaluated architecture.

Generic requests for “more models,” “more attacks,” or “more baselines” should specify what scientific uncertainty the additional experiment resolves.
