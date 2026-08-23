# Agent Authority Roadmap

Agent Authority is implementation-first, but the current bottleneck is now **product proof**, not another authorization subsystem.

The product thesis is:

> **Give an agent a task, not standing account permissions.**

The differentiated mechanism is:

> **Authority may follow exact resources discovered through already-authorized execution, without becoming ambient account authority.**

## Core invariant

```text
Task Lease authority <= Mission authority
```

Across delegation, transports and durable state:

```text
authority may stay the same or shrink
never silently grow
```

## P0 — Task-first product proof — current priority

The engine has enough depth to test whether developers actually want this layer. Product work now outranks additional distributed/crypto infrastructure unless a real workflow proves the missing infrastructure is blocking adoption or safety.

- [x] task-first facade over Mission + Task Lease + Guard
- [x] explicit service permissions without requiring hand-authored Mission JSON
- [x] named task authority roots
- [x] `task.run()` guarded effect boundary
- [x] `task.authorityFrom()` strict evidence-derived authority
- [x] task-first binding of named authority to later effects
- [x] human-readable authority-delta explanation
- [x] same task-first calls can opt into durable local state by adding a store
- [x] self-contained GitHub-shaped task-first demo
- [x] deterministic utility regression benchmark
- [ ] coding workflow: issue -> branch -> files -> PR, with merge/deploy outside authority
- [ ] support/communications workflow: email -> customer -> meeting/CRM/reply target
- [ ] operations/finance workflow: ticket -> order -> payment -> bounded refund
- [ ] first-time developer can complete a meaningful integration in under 10 minutes
- [ ] at least one external developer adopts the package without project-author assistance

Current utility regression metrics:

```text
normal task completion rate
false approval rate
true authority-delta step-up rate
unauthorized effect rate
provider effects per completed task
```

The deterministic fixture target is 100% normal completion, 0% false approvals, 100% true-delta step-up and 0% unauthorized effects. It is a regression fixture, not a real-world benchmark.

See `docs/product-proof.md`.

**Product gate:** do not prioritize deeper distributed persistence, provider-attestation protocols, new token formats, broad OAuth platform work, A2A, a policy DSL, another MCP control plane, or connector-count expansion until the product proof moves or a concrete workflow shows one of those items is necessary.

## M0 — Enforcement foundation — complete

- [x] mission validation
- [x] allow / deny / require-approval outcomes
- [x] explicit deny precedence
- [x] resource constraints
- [x] expiry and budgets
- [x] delegation attenuation
- [x] mission revocation
- [x] action receipts and request hashes
- [x] protocol-neutral guard enforcement
- [x] one-time approvals
- [x] mutation idempotency
- [x] short-lived local agent-instance auth
- [x] encrypted development credential vault
- [x] GitHub brokered execution
- [x] MCP v2 gateway proof
- [x] harness-managed connector grant proof
- [x] Node 20/22 CI, coverage, package checks and CodeQL

## M1 — Task Lease / derived-authority proof — implementation established

- [x] Task Lease around an existing Mission
- [x] explicit authority roots
- [x] derived facts anchored to same-Mission ALLOW receipts
- [x] parent-fact lineage
- [x] exact context-field bindings
- [x] unresolved facts fail closed
- [x] resource mismatch becomes an authority-delta step-up
- [x] explicit Mission deny remains the ceiling
- [x] task completion immediately removes authority
- [x] independent Task Lease expiry
- [x] Task Lease ID/hash in receipts
- [x] self-contained Gmail-thread -> Calendar-attendee demo
- [x] reusable Google Gmail/Calendar adapter
- [x] adversarial Gmail -> Calendar zero-provider-call tests
- [x] connected-account Gmail -> Calendar smoke proof
- [ ] public GitHub Actions Gmail -> Calendar proof after repository OAuth secrets are configured

**Success criterion:** an authorized read can establish exactly one later resource as task authority while an unrelated resource is technically blocked without requiring approval for every normal task step.

The implementation criterion is met. Public Actions reproducibility remains a separate evidence gate because the interactive Google connector credential cannot be reused as repository secrets.

## M2 — Durable task execution — local durable session established

- [x] authenticated local Task Lease persistence/recovery
- [x] exact Mission-hash binding on recovery
- [x] atomic authenticated fact/binding/status transaction primitive
- [x] stale-writer compare-and-swap protection
- [x] local per-lease transaction lock
- [x] mission-alias hardening inside transactions
- [x] automatic durable Task Lease session
- [x] security-critical session refresh before authority evaluation
- [x] durable completion/expiry across restart
- [ ] approved authority delta safely updates a live durable task
- [ ] durable lineage query for one exact authorization decision
- [ ] stronger multi-process stress/recovery tooling
- [ ] crash-safe remote-effect/receipt/state coupling

The existing local durability layer is sufficient for product proof. The unchecked items remain research/follow-on work unless a real workflow demonstrates that they block useful adoption or safety.

**Success criterion:** restart and cooperating local workers do not expand authority or silently overwrite newer task state. This is established for the reference local backend.

## M3 — Trustworthy derived facts — two-provider proof established

- [x] reviewed adapter extractor contract
- [x] successful guarded output bound to exact ALLOW receipt/request/output hash
- [x] strict `deriveFromEvidence()` where caller cannot provide the authority value
- [x] Gmail sender -> Calendar attendee strict derivation
- [x] GitHub issue discovery -> comment strict derivation
- [x] substitution/tamper/replay/cross-lease/wrong-operation/dangerous-selector tests
- [x] shared Google/GitHub authority-extractor conformance fixtures
- [ ] stronger provider/result attestation where a real provider makes it practical
- [ ] source freshness/invalidation semantics where a real workflow requires it

Do **not** build a general semantic policy language around this primitive.

**Success criterion:** strict provider-derived authority requires agreement between the exact guarded output, ALLOW receipt and reviewed extractor. This is demonstrated across Google and GitHub.

## M4 — Same task, multiple transports — complete

- [x] same Task Lease through direct guard/SDK execution
- [x] same Task Lease through MCP gateway
- [x] same Task Lease through brokered provider execution
- [x] real Vercel AI SDK protected-tool path
- [x] interoperability/adversarial vectors across transports

Changing transport or configured harness execution path does not expand task authority in the demonstrated paths.

## M5 — Adoption UX — follows product proof, not infrastructure breadth

Prioritize only the UX needed by successful P0 workflows.

- [ ] compact approval UI showing the exact authority delta
- [ ] one low-friction real provider onboarding path
- [ ] automatic short-lived agent session bootstrap where needed
- [ ] framework integration starter focused on task-first API
- [ ] external-developer quickstart feedback loop

Items such as reusable OAuth/OIDC engines, KMS backends and signed-receipt experiments remain optional until product usage justifies them.

**Success criterion:** an external developer can install Agent Authority, connect one real provider, authorize one meaningful task and complete it without exposing a long-lived credential to the model or learning the internal authority machinery first.

## M6 — Ecosystem only after repeatable adoption

- [ ] adapter/conformance starter template
- [ ] framework examples driven by real user requests
- [ ] good-first-issue tasks based on proven workflows
- [ ] independent contributor implementation of one mapping/adapter
- [x] npm release packaging and registry verification
- [ ] documentation site only when the current README/docs become genuinely limiting

## M7 — Standards interoperability only after operational evidence

- [ ] map Task Lease concepts to emerging task/intent authorization work
- [ ] accept external authorization envelopes where useful
- [ ] avoid creating a competing identity/token standard
- [ ] publish stable non-amplification/authority-lineage test vectors
- [ ] evaluate standards participation only after independent implementations/users exist

## Freeze list

Unless a real workflow proves one is necessary now:

- distributed Task Lease databases
- generic storage abstraction layers
- provider-signed attestation protocol design
- new token or identity formats
- a general delegation protocol
- proprietary universal policy DSL
- broad OAuth platform work
- another MCP control plane
- A2A protocol implementation
- connector-count expansion for its own sake
- full distributed transactions across arbitrary remote providers
- dashboard-first enterprise product work

## Research questions

1. Can a first-time developer understand and integrate the task-first model in under 10 minutes?
2. Which real workflows benefit enough from derived authority that an `if` statement is no longer sufficient?
3. Where does Agent Authority create unnecessary approval friction or reduce useful task completion?
4. How should an explicitly approved authority delta update a running task without opening wildcard authority?
5. Which source-data changes actually require downstream authority invalidation in real workflows?
6. What remote-effect coupling is necessary in practice, and which providers already offer idempotency/transaction primitives we can reuse instead of inventing our own protocol?
