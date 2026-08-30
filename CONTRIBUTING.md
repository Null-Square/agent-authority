# Contributing to Agent Authority

Agent Authority is developed in public around one promise:

> Give an agent the authority required for the task the human approved, and prevent that authority from silently expanding across tools and resources.

The project is a **Community / Developer Preview**.

## Start here

Read:

1. `README.md` — product overview and quickstart;
2. `SECURITY.md` — trust and enforcement boundary;
3. `docs/architecture.md` — component architecture;
4. `benchmarks/task-contracts/README.md` — reproducible task-authority evaluation;
5. `ROADMAP.md` — public product priorities.

Then run:

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm run check
```

Node.js 20+ is required for the package. Python 3.11 is used by the pinned AgentDojo evaluation harness.

## High-value contributions

We especially welcome:

- provider-boundary bypass reports with a minimal reproducer;
- independent reproduction of the deterministic evaluation;
- new adversarial cases for task-local resource authority;
- provider/tool output extractors with conformance fixtures;
- approval UX for genuine authority deltas;
- framework integrations around the task-first API;
- TypeScript/API usability improvements;
- focused typed relations when `exact`, `oneOf`, and `max` cannot safely express a real workflow;
- additional deterministic selection tests;
- runtime and integration-overhead measurements;
- documentation that makes the security boundary easier to understand.

A result that falsifies part of the mechanism is useful. Add the regression case and update the public evaluation documentation rather than weakening the test.

## Core invariants

A contribution must not weaken these properties:

1. The Mission is the protected-effect ceiling. A Task Lease cannot grant an action the Mission does not permit.
2. A blocked or step-up action cannot execute its guarded side effect.
3. A derived fact must descend from trusted task authority or authorized execution evidence.
4. Strict provider-derived authority must bind guarded output, ALLOW receipt, execution evidence, and the reviewed extractor.
5. A request outside established task authority cannot silently authorize itself.
6. Completing or expiring a Task Lease removes task authority even if provider credentials still exist.
7. Changing SDK, MCP, broker, or supported harness transport must not broaden authority.
8. Invalid relation/fact shapes fail closed.
9. Multi-candidate discovery does not by itself authorize every candidate.
10. A selection witness must fail closed on unsupported predicates, ties, or insufficient evidence.

The evaluation harness contains richer stateful constraints than the public package API. Promote new semantics into the package only when a concrete product workflow requires them and the authority boundary is clear.

## Derived-authority trust boundary

For authority-relevant provider data, prefer `TaskLease.deriveFromEvidence()` / `task.authorityFrom()`.

The strict path binds the exact guarded output to an ALLOW receipt through execution evidence, runs a reviewed extractor, and lets the Task Lease resolve the selected value. The caller does not directly provide the authority value.

This is stronger than the host-trusted `TaskLease.derive()` path, but it is not cryptographic provider attestation. See `SECURITY.md` for the full boundary.

## Product typed relations

The public task-binding vocabulary is intentionally small:

- `exact` — request equals the established fact;
- `oneOf` — request equals one member of a finite established set;
- `max` — numeric request is no greater than an established ceiling.

A new relation should have:

1. a real workflow that cannot be expressed safely with the current set;
2. an adversarial test;
3. the smallest relation that closes the observed gap;
4. documentation of its authority semantics and failure mode.

Do not replace the relation set with a general expression language without strong evidence that the added complexity is necessary.

## Evaluation contributions

The active benchmark path is offline by default. Follow `benchmarks/task-contracts/README.md` and keep generated results machine-readable.

When adding or changing evaluation cases:

- state the authorization property being tested;
- include a legitimate execution when applicable;
- include a falsifying/adversarial execution;
- avoid silently dropping failed cases;
- preserve exact artifact digests for any externally stored evidence;
- do not add model API credentials to ordinary CI.

Large or paid model evaluations should answer a distinct question that deterministic evaluation cannot answer. Do not add paid calls to the default workflow.

## Pull requests

A useful PR should state:

- the user or security problem;
- the authority boundary affected;
- the evidence that requires the change;
- an adversarial test or falsification condition;
- the smallest implementation that solves the problem;
- documentation changes when observable behavior changes.

For package changes, run:

```bash
npm run check
```

For benchmark changes, run the offline commands in `benchmarks/task-contracts/README.md` or the `Evaluation (Offline)` workflow.

## Security rule

Do not hide trust assumptions.

Document bypass paths, trusted provider adapters, non-attested evidence, cumulative-state limits, and credential paths that remain outside the enforcement boundary.

Never commit passwords, API keys, OAuth refresh tokens, session cookies, customer data, or private production configuration.

## Reporting security issues

Follow the disclosure process in `SECURITY.md`. For non-sensitive benchmark failures, open an issue with the smallest reproducible trace you can provide.
