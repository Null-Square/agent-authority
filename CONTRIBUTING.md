# Contributing to Agent Authority

Agent Authority is being developed in public. The current goal is deliberately narrow:

> Give an agent only the authority required for the task the human approved, and prevent that authority from silently expanding as the agent crosses tools or discovers new resources.

The best contributions make that claim easier to prove in real agent stacks.

## Start here

1. Read `README.md` and `docs/task-leases.md`.
2. Run the Task Lease demo.
3. Search existing issues before opening a new one.
4. Keep architectural changes tied to a concrete failure mode or integration need.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
npm run demo:task-lease
```

Node.js 20+ is required.

## What we especially want now

- integrations around `guard.run()` or Task Leases in real agent frameworks;
- trustworthy mappings from provider/tool outputs into resource facts;
- adversarial tests for authority expansion, provenance substitution and confused-deputy behavior;
- examples where one task safely crosses two or more systems;
- simple persistence designs for Task Lease state;
- MCP and non-MCP conformance cases that preserve the same task authority;
- approval UX for a genuine authority delta rather than approval on every tool call.

We are **not** prioritizing new identity protocols, a large policy DSL, a connector marketplace, or another agent harness.

## Core invariants

A contribution must not weaken these properties:

1. The mission is the ceiling. A Task Lease cannot grant an action the mission does not permit.
2. A blocked or step-up action cannot execute its side effect.
3. A derived fact must descend from existing task authority.
4. A derived fact must be anchored to an `ALLOW` receipt from the same Task Lease.
5. A request for a different concrete resource cannot silently inherit authority.
6. Completing or expiring a Task Lease removes its task authority even if provider credentials still exist.
7. Switching SDK, MCP, broker or harness transport must not broaden authority.

If a proposed feature cannot preserve these rules, explain why before implementing it.

## Derived-authority trust boundary

The v0.4 prototype records:

- parent fact IDs;
- source receipt ID/hash;
- source service/action/request hash;
- the trusted extraction selector.

The trusted host or adapter still supplies the extracted value. Do not describe this as cryptographic proof that the value came from the provider response. Designs that strengthen this boundary without adding a large semantic policy engine are especially valuable.

## Pull requests

Please include:

- the user/developer problem being solved;
- the authority boundary affected;
- an adversarial test showing what must remain impossible;
- the smallest implementation that solves the problem;
- documentation when observable behavior changes.

Run:

```bash
npm run check
```

before opening a PR.

## Security rule

Do not hide trust assumptions. If an adapter cannot prevent credential exfiltration, if an extraction is trusted rather than verified, or if enforcement can be bypassed outside the wrapper, document that limitation explicitly.

Never commit passwords, API keys, OAuth refresh tokens, session cookies, customer data, or private production configuration.

## Protocol proposals

Do not add a new wire format simply because it is elegant. Agent Authority should consume existing OAuth/OIDC, MCP and workload-identity mechanisms where they already solve the transport or authentication problem.

A new protocol concept needs evidence from multiple real integrations that the existing mechanisms cannot represent the required task-authority behavior.

Disagreement is useful. Critique designs and assumptions, not contributors.
