# Agent Authority Roadmap

Agent Authority is a Community / Developer Preview focused on one product thesis:

> **Give an agent a task, not standing account permissions.**

This roadmap describes public product work only. Benchmark methodology and reproducible evaluation live under `benchmarks/`.

## Established foundation

- [x] task-first facade over Mission + Task Lease + Guard;
- [x] `task.run()` for application-owned effects;
- [x] `task.execute()` for connected-provider effects;
- [x] evidence-derived task authority through `task.authorityFrom()`;
- [x] narrow typed relations: `exact`, `oneOf`, `max`;
- [x] authenticated local durable Task Lease recovery;
- [x] explicit allow / deny / require-approval decisions;
- [x] delegation attenuation and revocation;
- [x] mutation idempotency and semantic request receipts;
- [x] GitHub and Google provider paths;
- [x] MCP and Vercel AI SDK integration paths;
- [x] Node 20/22 CI, package checks, and CodeQL;
- [x] provider-boundary and benchmark evaluation harnesses.

## Current priorities

### 1. External onboarding

- reduce time to first protected effect;
- improve error messages and examples;
- document common integration patterns;
- measure setup friction with real consumers.

### 2. Approval-delta UX

- make requested authority expansion explicit;
- explain why an effect is outside the current task;
- support safe resume after user approval;
- keep approval narrower than the underlying provider credential.

### 3. Provider integrations

Add integrations when there is a concrete workflow and a testable authority boundary. New providers should include:

- request projection;
- credential-bound execution;
- evidence extraction where applicable;
- deny-path tests proving the provider callback does not run;
- transport-invariance coverage.

### 4. TypeScript depth

- expand declarations for lower-level public APIs as adoption requires;
- keep task-first types small and discoverable;
- add compile-time examples for common provider workflows.

### 5. Credential lifecycle

For deployment beyond trusted local hosts:

- OAuth / app-installation flows;
- KMS- or HSM-backed secret handling where appropriate;
- explicit credential rotation and revocation;
- least-privilege provider installation guidance.

### 6. Durable and remote execution

Build these only for concrete deployment requirements:

- safe application of approved authority deltas to durable tasks;
- crash-safe coupling between remote effects and durable state;
- stronger multi-process recovery tooling;
- remote/distributed Task Lease storage;
- multi-tenant isolation.

### 7. Evidence integrity

- source freshness and invalidation semantics;
- stronger provider evidence binding where practical;
- reviewed extractor conformance for additional providers;
- deterministic selection relations where a workflow requires them.

## Public relation vocabulary

The Community Preview intentionally keeps a small relation set:

```text
exact   request == established fact
oneOf   request is one member of an established finite set
max     numeric request <= established ceiling
```

A new public relation should have:

1. a concrete workflow that cannot be expressed safely with the existing set;
2. an adversarial test;
3. the smallest semantics that solve that workflow;
4. a clear explanation of how it preserves the Mission effect ceiling.

## Transport invariance

Demonstrated paths include:

- direct guard / SDK;
- task-first `task.run()`;
- connected-provider `task.execute()`;
- MCP gateway;
- Vercel AI SDK protected tools.

Changing transport must not broaden task authority.

## Deliberately deferred

The project does not plan to build these without concrete demand:

- a proprietary universal policy language;
- a new identity/token standard;
- connector expansion for its own sake;
- another generic agent control plane;
- dashboard-first enterprise features;
- speculative provider-attestation protocols.

## Release quality bar

Every public change that expands authority semantics should include:

- unit and adversarial tests;
- deny-path verification;
- clear security-boundary documentation;
- compatibility with the task-first API;
- no hidden widening of the Mission effect ceiling.
