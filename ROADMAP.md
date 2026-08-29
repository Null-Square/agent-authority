# Agent Authority Roadmap

Agent Authority has two tracks:

1. the **product track**, which remains Community / Developer Preview;
2. the **V1 research track**, which closed on 2026-08-29 and is now a community handoff.

The product thesis remains:

> **Give an agent a task, not standing account permissions.**

The research contribution sharpens the dynamic-authority problem:

> **Observation provenance is not selection authority.**

## Research V1 — closed

The original V1 research project is complete. No additional paid model run is required for closure.

Completed:

- [x] cover all 60 AgentDojo tasks with protected mutations across Slack, Banking, Workspace, and Travel;
- [x] preserve 60/60 reference utility in the deterministic cohort;
- [x] accept 36/36 evidence-consistent counterfactuals while an exact-trace baseline accepts 1/36;
- [x] block 370/370 corrected adversarial mutants;
- [x] block 230/230 constructible provider-boundary adversarial trajectories with 0 malicious provider reaches;
- [x] falsify provenance-only selection authority with a real aggregate-selector case;
- [x] add deterministic selection witnesses for supported selector classes;
- [x] freeze the V1 live-evaluation mechanism before the final DeepSeek V4 Pro attempts;
- [x] preserve and qualify the partial DeepSeek evidence instead of discarding incomplete runs;
- [x] archive the paid DeepSeek workflow so it executes zero model API calls;
- [x] make the research reproduction workflow manual and offline;
- [x] publish paper-facing results, limitations, attempt history, citation metadata, and machine-readable attempt summaries.

The full 5,088-run DeepSeek matrix did not pass its zero-execution-error gate. That is a recorded limitation, not an open closure task.

See `RESEARCH.md` and `benchmarks/task-contracts/`.

## Community research backlog

These are useful next research projects. They are not required to interpret or close V1.

1. **Semantic authority envelopes.** Distinguish user-required constants from bounded values, evidence-derived values, selection-derived values, and incidental execution choices.
2. **Formal semantics and proofs.** Formalize Mission non-amplification, causal authority provenance, selection soundness, ambiguity fail-closed behavior, and lifecycle/delegation properties.
3. **Held-out evaluation.** Test on tasks that did not shape the V1 grammar and on newly designed open-world selector benchmarks.
4. **Baselines and ablations.** Implement comparable authorization approaches and isolate the value of provenance, selection witnesses, cardinality, precedence, correlation, and static fences.
5. **Independent red team.** Search for direct-path bypasses, request substitution, provenance substitution, selector abuse, stale-evidence attacks, and transport inconsistencies.
6. **Model diversity.** Evaluate additional model families when the experiment adds scientific value. Do not rerun the historical paid matrix only to fill missing rows.
7. **Cost measurements.** Measure runtime overhead, policy generation cost, false step-ups, and human approval burden.
8. **Stronger evidence boundaries.** Study provider-signed or otherwise stronger remote evidence where practical.

## Community Preview product stage

The public package remains a Community / Developer Preview. Research closure does not imply production readiness.

### Established product foundation

- [x] task-first facade over Mission + Task Lease + Guard;
- [x] `task.run()` for application-owned effects;
- [x] `task.execute()` for connected-provider effects;
- [x] strict `task.authorityFrom()` evidence-derived authority;
- [x] narrow typed relations: `exact`, `oneOf`, `max`;
- [x] authenticated local durable Task Lease recovery;
- [x] GitHub connected-provider path with broker-internal credential resolution;
- [x] coding workflow proof: issue -> task branch -> exact changed path -> draft PR;
- [x] support/communications cross-provider proof;
- [x] operations/finance proof with bounded partial refund;
- [x] direct SDK, MCP, brokered provider, and protected Vercel AI SDK paths;
- [x] Node 20/22 CI, coverage, package checks, CodeQL, and connected-provider validation;
- [x] security documentation that states the enforcement and trust boundary explicitly.

### Release mechanics

These remain separate from research closure:

- [ ] run the final package candidate checks when CI capacity is available;
- [ ] publish the intended npm release when release capacity is available;
- [ ] verify a fresh install from the npm registry after publication.

Do not block the research handoff or paper on these release mechanics.

## Product priorities after research closure

1. **External onboarding evidence.** Measure time to first protected effect and integration friction.
2. **Approval-delta UX.** Make genuine authority expansion explicit, understandable, and safely resumable.
3. **Framework starters driven by demand.** Add integrations only when real users need them.
4. **TypeScript depth.** Expand declarations where actual consumers use lower-level APIs.
5. **Production credential lifecycle.** Add OAuth/GitHub App/KMS paths when deployment demand justifies them.
6. **Remote deployment hardening.** Add multi-tenant and distributed state only for a concrete deployment target.
7. **Research-to-product transfer.** Promote selection-witness or semantic-envelope ideas only after the public API contract is clear and independently tested.

## Current product relation vocabulary

The public product deliberately keeps a small relation set:

```text
exact   request == established fact
oneOf   request is one member of an established finite set
max     numeric request <= established ceiling
```

Why each exists:

- `exact` is the original task-resource invariant;
- `oneOf` came from the AgentDojo finite-set workflow gap;
- `max` came from the bounded partial-refund workflow.

The research prototype contains richer stateful constraints. Do not automatically copy them into the public API.

A new public relation must have:

1. a concrete workflow or external benchmark that fails safely without it;
2. an adversarial test;
3. the smallest semantics that solve the observed gap;
4. a clear explanation of how it preserves the Mission ceiling.

## Foundation status

### M0 — enforcement foundation: established

- Mission validation and explicit deny precedence;
- allow / deny / require-approval outcomes;
- resource constraints, expiry, and budgets;
- delegation attenuation and revocation;
- semantic request receipts and hashes;
- protocol-neutral guard boundary;
- one-time approvals and mutation idempotency;
- encrypted trusted-local-host credential vault;
- GitHub brokered execution;
- MCP gateway and harness-managed connector proofs.

### M1 — Task Lease / task-resource authority: established

- explicit task authority roots;
- same-Mission / same-lease lineage;
- evidence-derived facts;
- `exact`, `oneOf`, and `max` bindings;
- unresolved facts fail closed;
- relation mismatch becomes an authority-delta step-up;
- Mission remains the effect ceiling;
- completion/expiry remove task authority;
- Task Lease identity is retained in receipts.

### M2 — durable local task execution: product-proof level

Established:

- authenticated local persistence/recovery;
- exact Mission-hash binding on recovery;
- atomic authenticated whole-state transaction primitive;
- stale-writer compare-and-swap protection;
- local per-lease locking;
- durable completion/expiry;
- refresh before security-critical evaluation.

Open only if product adoption requires it:

- [ ] safe application of an approved authority delta to a live durable task;
- [ ] crash-safe remote-effect / durable-state coupling;
- [ ] stronger multi-process recovery tooling;
- [ ] remote/distributed persistence.

### M3 — trustworthy derived facts: trusted-runtime level

Established:

- reviewed extractor contract;
- exact guarded-output / ALLOW-receipt / execution-evidence agreement;
- caller cannot choose the strict derived value;
- Google and GitHub conformance fixtures;
- tamper, replay, cross-lease, wrong-operation, and dangerous-selector tests.

Open:

- [ ] stronger remote provider attestation where practical;
- [ ] source freshness and invalidation semantics for workflows that need them.

### M4 — transport invariance: established on demonstrated paths

Demonstrated paths:

- direct guard/SDK;
- MCP gateway;
- brokered provider execution;
- task-first `task.execute()`;
- Vercel AI SDK protected-tool path.

Changing transport must not broaden task authority.

## Freeze list

Do not build these without concrete evidence that they are needed:

- generic distributed Task Lease databases;
- proprietary universal policy DSL;
- new identity/token formats;
- broad connector expansion for its own sake;
- another MCP control plane;
- dashboard-first enterprise work;
- speculative provider-attestation protocols;
- paid benchmark reruns that add no new scientific question.

## Definition of the current state

**Research:** V1 closed and handed to the community.

**Product:** Community / Developer Preview, with npm release mechanics still separable from the research result.

**Paper:** ready to draft from the frozen research package. The paper must preserve the claim boundaries and incomplete-live-matrix limitation recorded in `PAPER_RESULTS_DRAFT.md`.
