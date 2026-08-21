# Agent Authority Roadmap

Agent Authority is implementation-first. We are not trying to invent a new authentication protocol or policy language.

The product thesis we are validating is:

> **Give an agent a task, not standing account permissions.**

A human-approved task becomes temporary execution authority. As the agent discovers concrete resources through authorized work, authority may follow those resources through provenance-bound facts, but it may never silently broaden.

## Current invariant

```text
Task Lease authority <= Mission authority
```

Across delegation and integrations:

```text
authority may stay the same or shrink
never silently grow
```

## M0 — Enforcement foundation — complete

- [x] mission validation
- [x] allow / deny / require-approval outcomes
- [x] explicit deny precedence
- [x] resource constraints
- [x] expiry and budgets
- [x] delegation attenuation
- [x] mission revocation
- [x] action receipts and request hashes
- [x] protocol-neutral `guard.run()` enforcement
- [x] one-time approvals
- [x] mutation idempotency
- [x] short-lived local agent-instance auth
- [x] encrypted development credential vault
- [x] GitHub brokered execution
- [x] MCP v2 gateway proof
- [x] harness-managed connector grant proof
- [x] Node 20/22 CI, coverage, package checks and CodeQL

## M1 — Task Lease / derived-authority proof — current

- [x] Task Lease object around an existing mission
- [x] explicit authority roots
- [x] derived facts anchored to same-mission `ALLOW` receipts
- [x] parent-fact lineage
- [x] exact context-field bindings
- [x] unresolved facts fail closed
- [x] resource mismatch becomes an authority-delta step-up signal
- [x] explicit mission deny remains the ceiling
- [x] task completion immediately removes authority
- [x] independent task-lease expiry
- [x] task-lease ID/hash in receipts
- [x] self-contained cross-system demo: Gmail-thread fact -> Calendar attendee
- [ ] exercise the same pattern against two real provider operations

**Success criterion:** a real multi-step agent workflow discovers a resource during an authorized read and can use exactly that resource in a later side effect, while an unrelated resource is technically blocked without requiring approval for every normal task step.

## M2 — Durable task execution

Build only what the real M1 workflow proves necessary.

- [ ] durable Task Lease persistence/recovery
- [ ] atomic fact/binding updates
- [ ] approved authority delta can safely attenuate/update a live lease
- [ ] completion state survives process restart
- [ ] durable lineage query: why was this exact action authorized?
- [ ] concurrency tests for multiple agent workers operating under one lease

**Success criterion:** a Task Lease survives daemon/process restarts without gaining authority or losing its provenance lineage.

## M3 — Trustworthy derived facts

Today the trusted host/adapter supplies the derived value and selector. This is an explicit v0.4 limitation.

- [ ] define a small adapter contract for extracting authority-relevant fields from provider results
- [ ] bind derived fact records to provider/result evidence where practical
- [ ] adversarial tests for forged extraction, confused-deputy mappings and stale facts
- [ ] conformance fixture for operation -> resource-context mappings
- [ ] define invalidation rules when a source resource changes

Do **not** build a general semantic policy language unless real integrations require it.

**Success criterion:** an adapter cannot claim a value was derived from an authorized operation without satisfying the documented extraction/evidence contract.

## M4 — Same task, multiple transports

Prove Agent Authority is not an MCP product or SDK wrapper.

- [ ] same Task Lease through ordinary `guard.run()` SDK call
- [ ] same Task Lease through MCP gateway
- [ ] same Task Lease through brokered provider execution
- [ ] at least one non-bypassable harness/tool-middleware integration
- [ ] interoperability test vectors across transports

**Success criterion:** changing transport or harness does not expand the task's authority.

## M5 — Production credential and approval UX

Only after the task-bound enforcement model is validated.

- [ ] GitHub browser/App onboarding instead of token-stdin
- [ ] reusable OAuth/OIDC connection engine
- [ ] OS keychain / KMS-backed secret backend
- [ ] automatic short-lived agent session bootstrap
- [ ] compact approval UI showing the exact authority delta
- [ ] signed receipt experiment

**Success criterion:** an external developer can install Agent Authority, connect one real provider, authorize one task, and complete it without exposing a long-lived credential to the model.

## M6 — Ecosystem and contribution layer

- [ ] adapter/conformance starter template
- [ ] framework integration examples
- [ ] `good first issue` tasks based on real mappings/tests
- [ ] independent contributor implementation of one adapter
- [ ] release packaging and npm publication
- [ ] documentation site only when README/docs become too large

## M7 — Standards interoperability

Only after operational evidence.

- [ ] map Task Lease concepts to emerging task/intent authorization work
- [ ] accept external authorization envelopes where useful
- [ ] avoid creating a competing identity/token standard
- [ ] publish stable test vectors for non-amplification and authority lineage
- [ ] evaluate an appropriate standards venue only if multiple independent implementations exist

## What we are not prioritizing

- another agent harness
- a new OAuth replacement
- an MCP replacement
- a giant connector marketplace
- a proprietary universal policy DSL
- a dashboard-first enterprise product
- A2A support before task-bound tool execution is validated

## Research questions

1. What is the smallest trustworthy representation of an authority-relevant derived fact?
2. How should an approved authority delta update a running task without opening a broader wildcard permission?
3. How should source-data changes invalidate downstream derived authority?
4. What provider/tool metadata is required to map operations to resource context reliably?
5. Can the same non-amplification conformance suite work across SDK, MCP, CLI and brokered execution?
