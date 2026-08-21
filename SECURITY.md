# Security Policy

Agent Authority sits on a security-critical side-effect boundary. Please treat vulnerabilities that could bypass policy, expand task/delegated authority, substitute request parameters, forge approvals/receipts, defeat revocation, cross Task Lease boundaries, or leak credentials as sensitive.

## Reporting

For non-sensitive hardening ideas, open a GitHub issue.

For exploitable vulnerabilities, use GitHub private vulnerability reporting / Security Advisory flow when available rather than publishing exploit details in a public issue.

Never include real passwords, OAuth refresh tokens, API keys, session cookies, customer data, or production secrets in reports, screenshots, logs, or reproductions.

## Current status

Agent Authority is a public pre-alpha validation implementation. It has live provider-boundary evidence, but it is **not production-ready** and should not yet be treated as a complete credential broker, IAM replacement, or hardened sandbox.

See [`docs/evidence.md`](docs/evidence.md) for executable proof and current limitations.

## Security claim

The narrow claim of the current runtime is:

> If an effect is reachable only through an Agent Authority enforcement boundary, the effect callback is not invoked unless the mission and Task Lease authorize that exact semantic request (or a required approval has completed).

A Task Lease may narrow mission authority around concrete resources discovered during an authorized task. It cannot grant an action the mission does not already permit.

```text
Task Lease authority <= Mission authority
```

## Critical trust boundary

Agent Authority cannot secure a provider path it does not control.

This is bypassable:

```text
agent ----> Agent Authority ----> provider
   \
    +---------------------------> provider (unguarded)
```

This is the intended boundary:

```text
agent
  |
  v
Agent Authority
  |
  v
provider
```

If the agent itself possesses a provider credential and can call the provider through another path, application architecture must remove or isolate that path before claiming non-bypassable enforcement.

## Task Lease invariants

1. **Mission is the ceiling.** A Task Lease cannot override explicit deny or create a new action class.
2. **No side effect before authorization.** `DENY` and `REQUIRE_APPROVAL` do not invoke the guarded effect.
3. **Same request.** The semantic request evaluated must be the request executed.
4. **Same task lineage.** Derived authority must be anchored to an `ALLOW` receipt from the same Task Lease.
5. **Parent authority exists.** Derived facts must descend from at least one existing task authority fact.
6. **No silent resource expansion.** A different concrete bound resource produces an authority delta instead of inheriting authority.
7. **Task completion removes authority.** Completion and expiry are independent of provider credential lifetime.
8. **Delegation attenuates.** Child authority may stay equal or shrink; it must not exceed parent authority.
9. **Revocation survives later calls.** A revoked mission must stop subsequent actions.
10. **Mutation retries are conservative.** Idempotency handling must not silently duplicate external side effects.

## Derived-fact trust assumption

The v0.4 implementation records:

- parent fact IDs;
- source receipt ID/hash;
- source service/action/request hash;
- Task Lease ID;
- trusted extraction selector.

The trusted host or adapter currently supplies the extracted value. Agent Authority does **not** yet cryptographically prove that a value such as `output.number` was actually extracted from the provider response described by the receipt.

Do not present recorded provenance as cryptographic data-lineage proof.

## Credentials

When Agent Authority owns/brokers a provider credential, the design goal is to keep long-lived credentials out of model context. The current encrypted-file vault is a pre-alpha local backend, not equivalent to an OS keychain, KMS, HSM, or enterprise secret manager.

For in-process guard integrations, the host application may continue to own its provider credential. In that mode Agent Authority controls guarded execution; it does not isolate the host's credential by itself.

## Current non-goals / incomplete protections

The current release does not yet guarantee:

- durable Task Lease recovery after process failure;
- cryptographically verified provider-output extraction;
- non-bypassability when the agent has another provider path;
- production OAuth onboarding;
- OS keychain/KMS/HSM-backed credential storage;
- hardened remote multi-tenant deployment;
- automatic safe application of approved authority deltas;
- complete concurrency-safe multi-agent budget/accounting semantics.

These limitations are intentional and should remain visible in documentation and demos.

## Security review contributions

Especially valuable reports/tests include:

- direct-path bypasses;
- request substitution between evaluation and execution;
- cross-lease provenance substitution;
- confused-deputy behavior across adapters;
- approval replay or authority-delta replay;
- revocation races;
- concurrent budget/idempotency races;
- provider-output extraction attacks.
