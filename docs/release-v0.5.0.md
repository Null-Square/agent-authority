# Agent Authority v0.5.0 — Community Preview

Released: 2026-08-25

> **Give your agent a task, not your account.**

v0.5.0 moves Agent Authority from a Developer Preview prototype into a Community Preview intended for independent use, attack, benchmark reproduction, and contribution. It is not a production-readiness declaration.

## What changed

### Narrow typed task authority

Task Lease bindings now support exactly three relation shapes:

- `exact` — the request value must equal the established authority fact;
- `oneOf` — the request value must be one member of an established finite set;
- `max` — a numeric request value must be no greater than an established ceiling.

`exact` remains the backward-compatible default, including older snapshot recovery. Unknown relations are rejected and malformed relation/fact shapes fail closed.

The relation set remains intentionally small. Agent Authority does not expose a general policy expression language.

### AgentDojo drove a product change

The pinned AgentDojo Slack oracle benchmark uses `agentdojo==0.1.35`, benchmark version `v1.2.2`, and user tasks 5, 6, 7, 8, and 11.

The first oracle implementation mapped 4/5 tasks. `user_task_11` legitimately needed the same channel field to accept exactly `{general, random}`. Rather than widen the binding to any channel, v0.5.0 added `oneOf`.

The selected Community Preview regression gate is now:

```text
selected tasks              5
mapped tasks                5
mapping coverage            100%
mapped-task completion      100%
unrelated-target block rate 100%
unauthorized effects        0
relations exercised         exact, oneOf
```

This is **oracle / upper-bound mapping evidence**. It is not a model-in-the-loop prompt-injection score.

### Bounded finance authority

The operations/finance proof now derives a payment amount from evidence and binds refund amount with `max`.

A legitimate partial refund below the discovered payment amount can proceed. An unrelated payment, over-refund, or wrong currency produces an authority delta before the refund callback executes.

`max` is a per-effect ceiling, not a cumulative refund ledger. Provider-side business state and idempotency remain authoritative for aggregate totals.

### Coding workflow proof

The coding workflow carries task authority through:

```text
repository -> issue -> base SHA -> task branch -> changed path -> draft PR
```

Writes to `main`, unrelated paths, and PRs from another branch step up before mutation. Merge remains explicitly outside the task authority.

### TypeScript consumer surface

`@nullsquare/agent-authority/task` now ships first-class TypeScript declarations.

CI packs the package, installs it into a blank consumer, and runs strict TypeScript compilation against the published task-first API shape.

### Connected and durable execution

The Community Preview retains:

- `task.run()` for application-owned provider/SDK effects;
- `task.execute()` for broker-owned connected-provider execution;
- connected GitHub execution with credentials kept behind the broker boundary;
- authenticated durable local Task Lease recovery with Mission binding, fact lineage, stale-writer protection, and durable completion/expiry;
- the same Task Lease model across direct SDK, MCP, connected-provider, and Vercel AI SDK protected-tool paths.

## Release evidence

The exact `0.5.0` release candidate passed before merge:

- Node 20 and Node 22 test matrices;
- coverage;
- packed-package consumers;
- strict TypeScript packed consumer;
- coding, support, finance, and Task Lease demos;
- deterministic utility benchmark;
- live GitHub read proof;
- live evidence-derived GitHub mutation proof;
- connected GitHub quickstart;
- credential-free and live public-GitHub fresh-install quickstarts;
- Vercel AI SDK integration;
- pinned AgentDojo oracle workflow;
- CodeQL.

The release PR was merged only after those checks were green on the exact `0.5.0` candidate.

## npm publication

`@nullsquare/agent-authority@0.5.0` was published to npm from GitHub Actions with provenance.

The first publish workflow attempt successfully published the package and provenance statement, then failed only because the package did not become visible through `npm view` within the original ~90-second propagation window.

A failed-job retry then:

1. detected that `0.5.0` was already published;
2. skipped republishing;
3. confirmed public npm registry visibility;
4. installed `@nullsquare/agent-authority@0.5.0` into a fresh consumer;
5. ran the package, connected, and coding smoke consumers;
6. installed TypeScript separately and type-checked the task-first consumer successfully.

The workflow propagation window is hardened after this release so publication acceptance and registry visibility remain separate, explicit gates without producing a false release failure under ordinary registry delay.

## Security boundary

v0.5.0 does **not** claim:

- production IAM or sandbox replacement;
- model-in-the-loop AgentDojo resistance;
- trusted natural-language task-to-authority compilation;
- cryptographic remote-provider attestation;
- non-bypassability if the agent retains another provider path or credential;
- cumulative accounting from the per-effect `max` relation;
- crash-atomic remote provider effect + local Task Lease state;
- production OAuth/KMS credential lifecycle;
- hardened remote multi-tenancy;
- independent adoption before independent users actually report it.

See `SECURITY.md` for the exact trust boundary.

## Community validation

The purpose of v0.5.0 is to move the next evidence burden outside the implementation team.

- [Issue #43 — first-time developer quickstart feedback](https://github.com/Null-Square/agent-authority/issues/43): can an independent developer reach a meaningful first PASS in under ten minutes without project-author help?
- [Issue #50 — model-in-the-loop AgentDojo validation](https://github.com/Null-Square/agent-authority/issues/50): run an actual model while keeping official AgentDojo utility/security separate from execution-effective unauthorized effects after the Agent Authority gate.

We also want:

- attempts to break the authority boundary;
- real workflows that cannot be represented by `exact`, `oneOf`, and `max`;
- independent benchmark reproduction;
- provider/framework integrations justified by real usage;
- API and TypeScript friction reports;
- security-sensitive findings through GitHub private vulnerability reporting.

A negative result is useful evidence. The project should prefer a smaller claim with reproducible proof over a broader favorable claim.