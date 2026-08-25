# Contributing to Agent Authority

Agent Authority is developed in public around one narrow promise:

> Give an agent the authority required for the task the human approved, and prevent that authority from silently expanding as the agent crosses tools or discovers new resources.

The current release track is a **Community Preview**. The most useful contributions make that promise easier to understand, integrate, attack, measure, or disprove in real agent stacks.

## Start here

1. Read `README.md`, `SECURITY.md`, `docs/task-leases.md`, and `docs/evidence.md`.
2. Run the task-first demo and tests.
3. Run the AgentDojo oracle benchmark if you have Python 3.11 available.
4. Search existing issues before opening a new one.
5. Tie architectural changes to a concrete workflow, attack, adoption failure, or benchmark gap.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
npm run demo:task
npm run demo:task-coding
```

Node.js 20+ is required.

## What we especially want now

- independent first-time developer quickstart reports;
- real agent integrations that keep provider effects behind the authority boundary;
- model-in-the-loop AgentDojo or equivalent adversarial validation;
- framework integrations around the task-first API;
- trustworthy provider/tool output extractors and conformance fixtures;
- adversarial tests for authority expansion, provenance substitution and confused-deputy behavior;
- approval UX for genuine authority deltas;
- TypeScript/API usability improvements;
- small, evidence-driven additions to typed relations when `exact`, `oneOf`, and `max` cannot safely express a real workflow;
- documentation or examples that make the trust boundary harder to misunderstand.

We are **not** prioritizing a large policy DSL, a new identity protocol, connector-count growth for its own sake, dashboard-first enterprise features, or another agent harness.

## Core invariants

A contribution must not weaken these properties:

1. The Mission is the ceiling. A Task Lease cannot grant an action the Mission does not permit.
2. A blocked or step-up action cannot execute its guarded side effect.
3. A derived fact must descend from existing task authority and remain in the same Task Lease lineage.
4. Strict provider-derived authority must be tied to the exact ALLOW receipt, guarded output/evidence, and reviewed extractor.
5. A request outside an established task relation cannot silently inherit authority.
6. Completing or expiring a Task Lease removes its task authority even if provider credentials still exist.
7. Switching SDK, MCP, broker or supported harness transport must not broaden authority.
8. Invalid relation/fact shapes fail closed.

If a proposed feature cannot preserve these rules, explain the conflict before implementing it.

## Derived-authority trust boundary

For authority-relevant provider data, prefer `TaskLease.deriveFromEvidence()` / `task.authorityFrom()`.

The strict path binds the exact guarded output to an ALLOW receipt using execution evidence, runs a reviewed extractor, and has the Task Lease resolve the selected value itself. The caller does not provide the authority value.

This is stronger than the legacy host-trusted `TaskLease.derive()` path, but it is not cryptographic provider attestation: the trusted provider adapter or host still originates the output before evidence is produced. Read `SECURITY.md` before making stronger claims.

## Typed relations

Task bindings deliberately support only a small set:

- `exact` — backward-compatible default equality;
- `oneOf` — one member of a finite established set;
- `max` — a numeric value no greater than an established ceiling.

A new relation needs a real workflow or external benchmark that cannot be represented safely with the existing set, plus adversarial tests showing the new relation does not silently widen task authority.

Do not replace this with a general expression language without compelling multi-workflow evidence.

## Pull requests

Please include:

- the user/developer problem being solved;
- the authority boundary affected;
- the evidence or workflow that requires the change;
- an adversarial test showing what must remain impossible;
- the smallest implementation that solves the problem;
- documentation when observable behavior or security claims change.

Run:

```bash
npm run check
```

before opening a PR.

For AgentDojo changes, also run the pinned benchmark workflow or equivalent local extraction/benchmark steps from `benchmarks/agentdojo/README.md`.

## Security rule

Do not hide trust assumptions. If an adapter can be bypassed, if a provider result is trusted rather than attested, if an authority relation has cumulative-state limits, or if credentials remain reachable outside the enforcement boundary, document it explicitly.

Never commit passwords, API keys, OAuth refresh tokens, session cookies, customer data, or private production configuration.

## Protocol proposals

Do not add a new wire format simply because it is elegant. Agent Authority should consume existing OAuth/OIDC, MCP and workload-identity mechanisms where they already solve transport or authentication problems.

A new protocol concept needs evidence from multiple real integrations that existing mechanisms cannot represent the required task-authority behavior.

Disagreement is useful. Critique designs, evidence and assumptions—not contributors.
