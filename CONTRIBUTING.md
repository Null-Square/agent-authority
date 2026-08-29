# Contributing to Agent Authority

Agent Authority is developed in public around one promise:

> Give an agent the authority required for the task the human approved, and prevent that authority from silently expanding across tools and resources.

The product is a **Community / Developer Preview**.

The **V1 research slice closed on 2026-08-29**. Its result, limitations, failed attempts, and partial DeepSeek evidence are frozen as historical evidence. Contributions can reproduce, challenge, formalize, or extend that work, but should not rewrite the historical result after the fact.

## Start here

Read:

1. `README.md` — product and result overview;
2. `RESEARCH.md` — stable research handoff;
3. `SECURITY.md` — trust and enforcement boundary;
4. `benchmarks/task-contracts/README.md` — offline research reproduction;
5. `benchmarks/task-contracts/PAPER_RESULTS_DRAFT.md` — exact live-result claim boundary.

Then run the product checks you need:

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
npm run demo:task
npm run demo:task-coding
```

Node.js 20+ is required for the package. Python 3.11 is used by the pinned AgentDojo research harness.

## Research contribution rule

Do not rerun the historical paid 5,088-case matrix only to fill missing rows.

A paid or large model evaluation should answer a new scientific question, such as:

- model-family generalization;
- a new bypass hypothesis;
- a held-out task distribution;
- a baseline comparison;
- an ablation;
- semantic authority-envelope evaluation.

Do not add model API secrets to ordinary CI. Do not re-enable the archived DeepSeek workflow as routine automation.

## High-value research contributions

We especially want:

- independent reproduction of the 60-task deterministic/provider-boundary result;
- attacks that cause an unauthorized protected effect to cross the authority boundary;
- formal semantics or proofs for Mission non-amplification and selection soundness;
- counterexamples to the current selection-witness assumptions;
- held-out open-world tasks with complete selector ground truth;
- semantic authority-envelope designs that avoid exact-trace over-constraint;
- direct baseline and ablation implementations;
- independent analysis of the preserved Attempt-3 and Attempt-4 evidence;
- model-diversity studies with clear budgets and preregistered claims;
- runtime overhead and human step-up measurements.

A result that falsifies part of the mechanism is valuable. Preserve it clearly.

## High-value product contributions

We also want:

- first-time developer quickstart reports;
- real integrations that keep provider effects behind the authority boundary;
- framework integrations around the task-first API;
- trustworthy provider/tool output extractors and conformance fixtures;
- approval UX for genuine authority deltas;
- TypeScript/API usability improvements;
- small evidence-driven typed relations when `exact`, `oneOf`, and `max` cannot safely express a real workflow;
- documentation that makes the security boundary harder to misunderstand.

We are not prioritizing a universal policy DSL, a new identity protocol, connector-count growth for its own sake, or dashboard-first enterprise features.

## Core invariants

A contribution must not weaken these properties:

1. The Mission is the effect ceiling. A Task Lease cannot grant an action the Mission does not permit.
2. A blocked or step-up action cannot execute its guarded side effect.
3. A derived fact must descend from trusted task authority or authorized execution evidence.
4. Strict provider-derived authority must bind the guarded output, ALLOW receipt, execution evidence, and reviewed extractor.
5. A request outside established task authority cannot silently authorize itself.
6. Completing or expiring a Task Lease removes its task authority even if provider credentials still exist.
7. Changing SDK, MCP, broker, or supported harness transport must not broaden authority.
8. Invalid relation/fact shapes fail closed.
9. Multi-candidate discovery does not by itself authorize every candidate.
10. A selection witness must fail closed on unsupported predicates, ties, or insufficient evidence.

The research prototype has richer stateful constraints than the public package. Do not promote a research mechanism into the public API without a separate product decision.

## Derived-authority trust boundary

For authority-relevant provider data, prefer `TaskLease.deriveFromEvidence()` / `task.authorityFrom()`.

The strict path binds the exact guarded output to an ALLOW receipt through execution evidence. It runs a reviewed extractor. The Task Lease resolves the selected value itself. The caller does not provide the authority value.

This is stronger than the legacy host-trusted `TaskLease.derive()` path, but it is not cryptographic provider attestation. Read `SECURITY.md` before making a stronger claim.

## Product typed relations

The public task binding vocabulary remains deliberately small:

- `exact` — request equals the established fact;
- `oneOf` — request equals one member of a finite established set;
- `max` — numeric request is no greater than an established ceiling.

A new product relation needs:

1. a real workflow or external benchmark that fails safely without it;
2. an adversarial test;
3. the smallest relation that closes the observed gap;
4. documentation of the security boundary and failure mode.

Do not replace the relation set with a general expression language without strong multi-workflow evidence.

## Research evidence rules

When you analyze the V1 evidence:

- keep Attempt 3 supplementary because its adaptive arm failed before model execution;
- keep Attempt 4 partial because only Slack completed before balance exhaustion;
- do not claim that all ungated out-of-policy effects were exact attacker-goal completions;
- use matched ungated/gated scenarios for the primary live comparison;
- keep the 5,088-run `scientific_go: false` status visible;
- do not remove infrastructure failures from the historical attempt log;
- verify any raw archive against the SHA-256 values in `ARTIFACT_MANIFEST.md`.

## Pull requests

A useful PR should state:

- the user, product, or research problem;
- the authority boundary affected;
- the evidence that requires the change;
- an adversarial test or falsification condition;
- the smallest implementation that solves the problem;
- documentation changes when observable behavior or claims change.

For package changes, run:

```bash
npm run check
```

For research changes, use the manual offline reproduction workflow or the equivalent commands in `benchmarks/task-contracts/README.md`.

## Security rule

Do not hide trust assumptions.

Document bypass paths, trusted provider adapters, non-attested evidence, cumulative-state limits, and any credential path that remains outside the enforcement boundary.

Never commit passwords, API keys, OAuth refresh tokens, session cookies, customer data, or private production configuration.

## Research integrity rule

Negative results stay in the record.

If a benchmark contradiction, implementation failure, false positive, utility regression, or bypass changes the interpretation of the mechanism, update the result and limitation documents. Do not silently engineer the evidence away after observing it.

Disagreement is useful. Critique designs, evidence, and assumptions—not contributors.
