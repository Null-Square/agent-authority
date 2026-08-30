# Security Policy

Agent Authority sits on a security-critical side-effect boundary. Treat vulnerabilities that could bypass policy, expand task or delegated authority, substitute request parameters, forge approvals/receipts/evidence, defeat revocation, cross Task Lease boundaries, or leak credentials as sensitive.

## Reporting

For non-sensitive hardening ideas, open a GitHub issue.

For exploitable vulnerabilities, use GitHub private vulnerability reporting / Security Advisory flow when available rather than publishing exploit details in a public issue.

Never include real passwords, OAuth refresh tokens, API keys, session cookies, customer data, or production secrets in reports, screenshots, logs, or reproductions.

## Current status

Agent Authority is a **Community / Developer Preview**, not production authorization infrastructure. It has automated, live-provider, and external-benchmark validation, but it should not be treated as a complete credential broker, IAM replacement, sandbox, or multi-tenant authorization service.

See [`docs/evidence.md`](docs/evidence.md) and [`benchmarks/task-contracts/README.md`](benchmarks/task-contracts/README.md) for executable validation and its scope.

## Security claim

The current runtime makes a narrow enforcement claim:

> If an effect is reachable only through an Agent Authority enforcement boundary, a blocked or step-up request does not reach that guarded effect. A Task Lease may further narrow Mission authority to exact, finite-set, or bounded numeric task resources without silently exceeding the Mission ceiling.

```text
Task Lease authority <= Mission authority
```

A Task Lease cannot grant an action the Mission does not already permit.

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

For application-owned callbacks, the trusted host must also execute the semantic request that was authorized. Agent Authority can prevent the callback from running on a blocked request; it cannot stop a malicious callback from ignoring its authorized arguments and performing a different side effect with credentials the callback already owns.

## Task Lease invariants

1. **Mission is the ceiling.** A Task Lease cannot override explicit deny or create a new action class.
2. **No side effect before authorization.** `DENY` and `REQUIRE_APPROVAL` do not invoke the guarded effect.
3. **Same task lineage.** Derived authority must be anchored to an `ALLOW` receipt from the same Task Lease and descend from existing task authority.
4. **Evidence-derived values are not caller supplied.** `deriveFromEvidence()` verifies guarded output/evidence against the ALLOW receipt, runs a reviewed extractor, and resolves the selected value itself.
5. **No silent resource expansion.** A request outside a bound task relation becomes an authority delta rather than inheriting authority.
6. **Relations are narrow and typed.** `exact` is the default; `oneOf` accepts only a finite established set; `max` accepts only numeric values at or below the established ceiling. Unknown relations are rejected and invalid fact shapes fail closed.
7. **Task completion removes authority.** Completion and expiry are independent of provider credential lifetime.
8. **Delegation attenuates.** Child authority may stay equal or shrink; it must not exceed parent authority.
9. **Revocation survives later calls.** A revoked Mission must stop subsequent actions.
10. **Mutation retries are conservative.** Idempotency handling must not silently duplicate external side effects.
11. **Transport must not broaden authority.** SDK, MCP, broker, and supported harness paths must preserve the same authority decision for the same semantic request.

## Derived-authority trust boundary

There are two derivation paths and they should not be conflated.

### Strict evidence path — preferred for provider data

`TaskLease.deriveFromEvidence()` requires:

- an `ALLOW` receipt from the same Mission and Task Lease;
- execution evidence binding the receipt to the exact guarded output hash;
- at least one existing parent authority fact;
- a reviewed authority extractor that selects an allowed normalized output path;
- Task Lease resolution of the selected value rather than a caller-supplied authority value.

This prevents a normal caller from substituting a different value after guarded execution. The test suite covers output/evidence tampering, replay, cross-lease substitution, wrong-operation extraction, and unsafe selectors.

This is **not cryptographic provider attestation**. The runtime trusts the provider adapter or guarded host to supply truthful provider output before evidence is created.

### Host-trusted compatibility path

`TaskLease.derive()` remains for compatibility and lets a trusted host supply the derived value directly. It records lineage and receipt provenance but has a larger trust boundary. New authority-relevant provider integrations should prefer `deriveFromEvidence()`.

## Typed relation limits

Typed relations intentionally do not form a general expression language.

- `exact`: request value must equal the established fact.
- `oneOf`: request value must equal one member of an established finite array.
- `max`: request value must be numeric and no greater than the established numeric fact.

`max` is a **per-effect ceiling**, not a cumulative accounting ledger. A provider or application that allows multiple mutations must still enforce aggregate business state, idempotency, and provider-side invariants. For example, a refund provider remains authoritative for how much of a payment has already been refunded.

## Credentials

When Agent Authority owns or brokers a provider credential, the design goal is to keep long-lived credentials out of model context. The current encrypted-file vault is a trusted-local-host backend, not equivalent to an OS keychain, KMS, HSM, enterprise secret manager, or production OAuth control plane.

For in-process guard integrations, the host application may continue to own its provider credential. In that mode Agent Authority controls guarded execution; it does not isolate the host's credential by itself.

## Durability

Authenticated local Task Lease persistence/recovery validates exact Mission identity, fact lineage, and stored binding state. It is suitable for trusted local deployments and integration testing.

The current implementation does not provide crash-atomic coupling between arbitrary remote provider side effects and durable local receipt/lease state. Remote providers should use their own idempotency or transaction primitives where available.

## Deployment boundaries

The Community Preview does not provide guarantees for:

- alternate unguarded provider paths retained by an agent or untrusted host;
- cryptographic provider-output attestation;
- automatic source-data freshness/invalidation after authority has been derived;
- automatic safe application of approved authority deltas;
- crash-safe distributed coupling of remote effects and durable task state;
- production OAuth / enterprise credential lifecycle;
- OS keychain/KMS/HSM-backed credential storage;
- hardened remote multi-tenant deployment;
- complete concurrency-safe multi-agent budget/accounting semantics;
- natural-language task-to-authority compilation as a trusted security boundary;
- general prompt-injection prevention outside the protected-effect boundary.

These boundaries are part of the public security contract.

## Security review targets

Especially useful reports and tests include:

- direct-path bypasses;
- request substitution between evaluation and execution;
- cross-lease provenance substitution;
- confused-deputy behavior across adapters;
- approval replay or authority-delta replay;
- revocation races;
- durable recovery / stale-writer races;
- cumulative-budget and idempotency failures;
- provider-output extraction attacks;
- cases where `exact`, `oneOf`, or `max` authorize more than the task should permit;
- cases where a deterministic selection witness authorizes the wrong observed candidate.
