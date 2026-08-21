# Agent Authority Roadmap

Agent Authority is implementation-first. We are not trying to invent a new authentication protocol, agent harness, or universal policy language.

The product thesis is:

> **Give your agent a task, not your account.**

A human-approved task becomes temporary execution authority. Existing tools keep their SDKs and provider connections, while Agent Authority controls whether a protected side effect is justified by that task.

## Product invariant

```text
Task Lease authority <= Mission authority
```

Across derived facts, delegation, tools, and transports:

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

## M1 — Task Lease / derived-authority proof — complete

- [x] Task Lease object around an existing mission
- [x] explicit authority roots
- [x] derived facts anchored to same-lease `ALLOW` receipts
- [x] required parent-fact lineage
- [x] trusted extraction selector recorded in provenance
- [x] exact context-field bindings
- [x] unresolved facts fail closed
- [x] resource mismatch becomes `authority_delta_required`
- [x] explicit mission deny remains the ceiling
- [x] task completion immediately removes authority
- [x] independent Task Lease expiry
- [x] Task Lease ID/hash in receipts
- [x] deterministic shared evaluation clock
- [x] repeated identical derivation is idempotent
- [x] conflicting derived value is rejected
- [x] network-boundary proof that blocked actions never reach the provider
- [x] live GitHub API proof for allowed vs unrelated resource

**Evidence:** an application can retain broader provider connectivity while a Task Lease prevents an unrelated protected resource from reaching the provider.

## M2 — Protect existing agent tools — current

Make Agent Authority useful without asking developers to replace their framework or rewrite their tools.

- [x] `protectTool()` wrapper preserving existing tool shape
- [x] `protectTools()` dictionary wrapper
- [x] semantic tool-input -> authority-context mapping
- [x] successful tool-output -> derived-fact mapping
- [x] fail-closed behavior for unmapped tools
- [x] explicit `allowUnmapped` escape hatch for intentionally unprotected local tools
- [x] adversarial tests proving blocked tool callbacks execute zero times
- [x] Vercel AI SDK `ToolLoopAgent` integration
- [x] model-selected authorized read -> derived sender -> later side effect
- [x] model-selected unrelated side effect -> provider execution stays zero
- [x] dedicated `framework-validation` CI job
- [x] README and validation guide led by the protect-existing-tools path
- [ ] one external developer or separate application integrates `protectTools()` without modifying Agent Authority core

**Success criterion:** an existing agent application can adopt Agent Authority around its current tools with a small mapping layer, complete the intended task, and remain technically unable to execute an unrelated protected effect.

## M3 — Real two-service derived-authority workflow — next

This is the next technical milestone. Do not add another framework first.

Target shape:

```text
human task
   |
   v
service A authorized read
   |
   v
real provider result
   |
   v
derived concrete fact
   |
   v
service B protected write
   |
   +--> exact derived resource -> ALLOW
   +--> unrelated resource     -> STEP-UP / DENY
```

Preferred first workflow:

```text
mail thread/read
   -> derive sender identity
   -> calendar action constrained to that sender
```

Requirements:

- [ ] use two actual provider/API boundaries, not two local mock functions
- [ ] no destructive production action required for validation
- [ ] provider A read result establishes a concrete authority fact
- [ ] provider B effect is allowed only for that concrete fact
- [ ] unrelated provider B resource is blocked before network execution
- [ ] task completion removes the cross-service authority
- [ ] record enough evidence to explain why the allowed side effect was authorized
- [ ] keep provider authentication separate from Task Lease semantics

**Success criterion:** the distinctive derived-authority claim works across two real systems, not only within a simulated agent tool loop.

## M4 — Durable task execution

Build only what M3 proves necessary.

- [ ] durable Task Lease persistence/recovery
- [ ] atomic fact/binding updates
- [ ] approved authority delta can safely attenuate/update a live lease
- [ ] completion state survives process restart
- [ ] durable lineage query: why was this exact action authorized?
- [ ] concurrency tests for multiple agent workers operating under one lease

**Success criterion:** a Task Lease survives process/daemon restarts without gaining authority or losing provenance lineage.

## M5 — Trustworthy derived facts

Today the trusted host/adapter supplies the extracted value. This is explicit, not hidden.

- [ ] define a small adapter contract for extracting authority-relevant fields from provider results
- [ ] bind derived fact records to provider/result evidence where practical
- [ ] adversarial tests for forged extraction, confused-deputy mappings, and stale facts
- [ ] conformance fixture for operation -> resource-context mappings
- [ ] define invalidation rules when a source resource changes
- [ ] determine whether signed/provider-verifiable evidence materially improves real integrations

Do **not** build a general semantic policy language unless real integrations require it.

**Success criterion:** an adapter cannot claim a value was derived from an authorized operation without satisfying the documented evidence contract.

## M6 — Same task, multiple transports

Prove Agent Authority is not tied to one framework or MCP.

- [x] ordinary in-process guard path
- [x] protected Vercel AI SDK tool path
- [x] MCP gateway proof
- [x] brokered GitHub execution proof
- [ ] same canonical Task Lease/conformance fixture exercised across SDK and MCP paths
- [ ] one second framework integration only if it requires little/no core change
- [ ] interoperability test vectors across transports

**Success criterion:** changing framework or transport does not expand task authority.

## M7 — Production credential and approval UX

Only after task-bound enforcement has real cross-service evidence.

- [ ] GitHub browser/App onboarding instead of token-stdin
- [ ] reusable OAuth/OIDC connection engine
- [ ] OS keychain / KMS-backed secret backend
- [ ] automatic short-lived agent session bootstrap
- [ ] compact approval UI showing the exact authority delta
- [ ] apply an approved delta without widening unrelated authority
- [ ] signed receipt experiment if operationally useful

**Success criterion:** an external developer can install Agent Authority, connect one real provider, authorize one task, and complete it without exposing a long-lived credential to the model.

## M8 — Ecosystem and contribution layer

- [ ] adapter/mapping starter template
- [ ] small framework integration examples
- [ ] `good first issue` tasks based on real mappings/tests
- [ ] independent contributor implementation of one mapping/adapter
- [ ] npm publication/release workflow
- [ ] documentation site only when README/docs no longer scale

## M9 — Standards interoperability

Only after operational evidence.

- [ ] map Task Lease concepts to emerging task/intent authorization work
- [ ] accept external authorization envelopes where useful
- [ ] avoid creating a competing identity/token standard
- [ ] publish stable non-amplification and authority-lineage test vectors
- [ ] evaluate a standards venue only if multiple independent implementations exist

## What we are not prioritizing

- another agent harness
- a new OAuth replacement
- an MCP replacement
- a giant connector marketplace
- a proprietary universal policy DSL
- dashboard-first enterprise software
- A2A support before cross-service task-bound execution is validated
- framework integrations that require core product divergence

## Current research questions

1. What is the smallest trustworthy representation of an authority-relevant derived fact?
2. How should an approved authority delta update a running task without opening a wildcard permission?
3. How should source-data changes invalidate downstream derived authority?
4. What provider/tool metadata is required to map operations to resource context reliably?
5. Can one non-amplification conformance suite work across SDK, MCP, CLI, and brokered execution?
6. How little integration code can a normal agent application require before developers consider Agent Authority worth adopting?
