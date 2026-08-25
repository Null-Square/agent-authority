# Agent Authority Roadmap

Agent Authority's current bottleneck is **product proof and external validation**, not another authorization subsystem.

The product thesis is:

> **Give an agent a task, not standing account permissions.**

The differentiated mechanism is:

> **Authority may follow task resources discovered through already-authorized execution, without becoming ambient account authority.**

Core invariant:

```text
Task Lease authority <= Mission authority
```

Across delegation, transports and durable state, authority may stay equal or shrink; it must never silently grow.

## Current stage — Community / Developer Preview

The repository has a strong enforcement and evidence foundation. The immediate goal is now to make the product easy enough, measurable enough and transparent enough that outside developers and security researchers can use it, attack it and extend it.

Community Preview does **not** mean production-ready. It means the implementation has enough real workflow proof to justify asking the community for independent evidence.

## Community Preview release gate

Repository-controlled gates:

- [x] task-first facade over Mission + Task Lease + Guard;
- [x] `task.run()` for application-owned effects;
- [x] `task.execute()` for connected-provider effects;
- [x] strict `task.authorityFrom()` evidence-derived authority;
- [x] authenticated local durable Task Lease recovery;
- [x] GitHub connected-provider path with broker-internal credential resolution;
- [x] coding workflow: issue -> task branch -> exact changed path -> draft PR, with merge outside authority;
- [x] support/communications proof across Gmail-shaped thread -> exact Calendar-shaped attendee;
- [x] operations/finance proof across ticket -> order -> payment -> bounded partial refund;
- [x] narrow typed binding relations: `exact`, `oneOf`, `max`;
- [x] exact remains backward-compatible default, including recovered snapshots;
- [x] invalid relation/fact shapes fail closed;
- [x] external AgentDojo Slack oracle harness pinned to `agentdojo==0.1.35` / `v1.2.2`;
- [x] selected AgentDojo oracle set maps 5/5 after `oneOf` closes the finite-set gap;
- [x] selected AgentDojo oracle set preserves 100% legitimate completion, blocks 100% unrelated target attempts and executes 0 unauthorized effects;
- [x] first-class TypeScript declarations for the task-first package path;
- [x] Node 20/22 CI, coverage, package checks, CodeQL and connected GitHub validation;
- [x] security, evidence and contribution docs state the current trust boundary rather than old prototype limits;
- [ ] final `v0.5.0` package candidate passes all required checks after the version bump;
- [ ] fresh install of `v0.5.0` is verified from npm after publish.

Only the last two items are release mechanics. They should be completed after the feature/docs candidate is fully green.

## External validation gate — what Community Preview is for

These cannot be self-certified by the repository and should remain visibly open:

- [ ] first-time independent developer completes a meaningful integration in under 10 minutes;
- [ ] at least one external developer keeps Agent Authority in a real agent workflow without project-author assistance;
- [ ] model-in-the-loop AgentDojo run publishes reproducible official utility/security scores;
- [ ] execution-effective unauthorized effects are reported separately from attempted model tool calls;
- [ ] independent security review attempts direct-path bypass, request substitution, provenance substitution and relation abuse;
- [ ] at least one external contributor lands a useful mapping, integration, adversarial test or benchmark extension.

Announcement should explicitly invite this work rather than imply it has already happened.

## Narrow typed relations — evidence-driven only

The current relation vocabulary is deliberately small:

```text
exact   request == established fact
oneOf   request ∈ established finite set
max     numeric request <= established ceiling
```

Why each exists:

- `exact` is the original task-resource invariant;
- `oneOf` was justified by AgentDojo Slack `user_task_11`, which legitimately targets exactly `{general, random}`;
- `max` was justified by the finance workflow, where a partial refund should be useful while an over-refund remains outside authority.

Do **not** turn this into a general expression language. Add another typed relation only when a real external workflow or benchmark fails safely first and the smallest new relation closes that exact gap.

`max` is per effect, not cumulative accounting. Provider-side state, budgets and idempotency remain authoritative for aggregate totals.

## Foundation status

### M0 — enforcement foundation: established

- Mission validation and explicit deny precedence;
- allow / deny / require-approval outcomes;
- resource constraints, expiry and budgets;
- delegation attenuation and revocation;
- semantic request receipts / hashes;
- protocol-neutral guard boundary;
- one-time approvals and mutation idempotency;
- encrypted trusted-local-host credential vault;
- GitHub brokered execution;
- MCP gateway and harness-managed connector proofs;
- Node 20/22 CI, coverage, package checks and CodeQL.

### M1 — Task Lease / task-resource authority: established

- explicit task authority roots;
- same-Mission / same-lease lineage;
- evidence-derived facts;
- `exact`, `oneOf` and `max` bindings;
- unresolved facts fail closed;
- relation mismatch becomes an authority-delta step-up;
- Mission remains the ceiling;
- completion/expiry immediately remove task authority;
- Task Lease ID/hash retained in receipts.

### M2 — durable local task execution: established for product proof

- authenticated local persistence/recovery;
- exact Mission-hash binding on recovery;
- atomic authenticated whole-state transaction primitive;
- stale-writer compare-and-swap protection;
- local per-lease locking;
- durable completion/expiry;
- refresh before security-critical evaluation.

Still open because it is not required for Community Preview:

- [ ] safe application of an approved authority delta into a live durable task;
- [ ] crash-safe remote-effect / durable-state coupling;
- [ ] stronger multi-process recovery tooling;
- [ ] remote/distributed persistence only if real adoption requires it.

### M3 — trustworthy derived facts: established inside the trusted runtime boundary

- reviewed extractor contract;
- exact output hash / ALLOW receipt / execution-evidence agreement;
- caller cannot choose the strict derived value;
- Google and GitHub conformance fixtures;
- tamper/replay/cross-lease/wrong-operation/dangerous-selector tests.

Still open:

- [ ] provider-signed or otherwise stronger remote attestation where practical;
- [ ] source freshness/invalidation semantics where a real workflow requires them.

### M4 — transport invariance: established on demonstrated paths

- direct guard/SDK;
- MCP gateway;
- brokered provider execution;
- task-first `task.execute()`;
- Vercel AI SDK protected-tool path.

Changing demonstrated transport must not broaden task authority.

## Product / DX priorities after Community Preview

1. **External onboarding evidence.** Measure time-to-first-protected-effect and where developers get stuck.
2. **Model-in-the-loop AgentDojo.** Keep official benchmark scores separate from execution-effective side effects.
3. **Approval-delta UX.** Make a genuine authority expansion understandable and safely resumable.
4. **Framework starters driven by demand.** Prioritize integrations real adopters request, not connector count.
5. **TypeScript depth.** Expand declarations beyond the task-first surface when actual consumers use lower-level APIs.
6. **Provider credential lifecycle.** Add production OAuth/GitHub App/KMS paths when adoption justifies them.
7. **Remote deployment.** Harden multi-tenant/remote state only after there is a concrete deployment target.

## Ecosystem milestone

After repeatable external adoption:

- adapter/extractor conformance starter;
- good-first-issue tasks tied to proven workflow gaps;
- independent provider mapping implementation;
- stable authority-lineage/adversarial test vectors;
- documentation site only when README/docs navigation is actually limiting;
- standards mapping only after operational evidence exists.

## Freeze list

Unless a real workflow proves one is necessary now:

- distributed Task Lease databases;
- generic persistence abstractions for their own sake;
- new token or identity formats;
- proprietary universal policy DSL;
- broad OAuth platform work;
- another MCP control plane;
- A2A implementation;
- connector-count expansion for its own sake;
- dashboard-first enterprise product work;
- full distributed transactions across arbitrary providers;
- speculative provider-attestation protocols.

## Research questions

1. Can a first-time developer understand and integrate task-first authority in under 10 minutes?
2. Which real workflows benefit enough from derived authority that ordinary application checks are not sufficient?
3. Where does Agent Authority create false approvals or reduce legitimate task completion?
4. Can model-in-the-loop AgentDojo attacks produce execution-effective unauthorized effects behind the gate?
5. How should an approved authority delta update a running durable task without becoming wildcard authority?
6. Which source-data changes should invalidate downstream authority in practice?
7. What remote-effect coupling is actually necessary, and which provider idempotency primitives can be reused?
8. Which additional relation, if any, is justified by external workflow evidence after `exact`, `oneOf` and `max`?
