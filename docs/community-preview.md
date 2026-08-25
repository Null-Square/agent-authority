# Agent Authority Community Preview

## Launch position

Agent Authority **v0.5.0 is released as a Community / Developer Preview**. The package is published on npm with GitHub Actions provenance, and the post-publication workflow has completed a fresh install and consumer verification from the public npm registry.

The launch makes one clear claim:

> **Give your agent a task, not your account.** Agent Authority adds a task-bounded effect boundary so broad standing provider permission does not silently become authority for unrelated work.

Do not present it as production IAM, a sandbox, a prompt-injection cure, or a complete credential platform.

## What makes this preview useful now

The project is no longer only a policy prototype. It has:

- a task-first JavaScript API with a typed TypeScript surface;
- exact evidence-derived authority from reviewed provider output paths;
- connected GitHub execution with broker-internal credentials;
- authenticated durable local Task Lease recovery;
- coding, support/communications and bounded-finance workflows;
- narrow `exact`, `oneOf` and `max` authority relations;
- an external AgentDojo oracle harness that already exposed and drove one product improvement;
- automated adversarial assertions that blocked/step-up requests execute zero guarded callbacks;
- Node 20/22 CI, package consumer validation, CodeQL and live GitHub proofs.

That is enough substance for outside developers to evaluate the idea on its merits.

## Release verification

The exact v0.5.0 release candidate passed the repository release gates before merge. After merge, npm accepted `@nullsquare/agent-authority@0.5.0` and emitted a signed provenance statement. The first workflow attempt then hit a registry-propagation timeout after publication had already succeeded. A retry detected the existing published version, skipped republishing, confirmed registry visibility, and completed the fresh-registry consumer verification successfully.

The release workflow now treats publication and registry visibility as separate gates so a package is not called released until both are verified.

## Evidence we can state publicly

For the selected pinned AgentDojo Slack oracle set, the Community Preview gate is:

```text
selected tasks              5
mapped tasks                5
mapping coverage            100%
mapped-task completion      100%
unrelated-target block rate 100%
unauthorized effects        0
```

The repository also demonstrates:

```text
coding:  issue -> branch -> exact path -> draft PR
finance: ticket -> order -> payment -> bounded partial refund
support: thread -> exact sender -> attendee
```

These are executable repository proofs, not claims about every possible agent workload.

## Claims we must not make yet

Do not claim:

- production readiness;
- model-in-the-loop AgentDojo prompt-injection resistance;
- trusted natural-language task-to-authority compilation;
- cryptographic remote-provider attestation;
- non-bypassability when an agent has another provider path;
- production OAuth/KMS credential lifecycle;
- hardened multi-tenant remote deployment;
- independent adoption before independent developers actually report it.

The strongest launch posture is transparent: show what is technically prevented today, show where the boundary ends, and invite people to try to break it.

## Community challenges

### 1. First-time developer challenge

Use [issue #43](https://github.com/Null-Square/agent-authority/issues/43). Start from a blank directory, follow the public quickstart, and report time-to-first-PASS, confusion, errors and whether author help was needed.

Target:

```text
meaningful first protected effect < 10 minutes
project-author assistance       0
```

### 2. Model-in-the-loop AgentDojo challenge

Use [issue #50](https://github.com/Null-Square/agent-authority/issues/50). Preserve official AgentDojo utility/security scoring and separately count execution-effective unauthorized effects after the Agent Authority gate.

A negative result is welcome. The goal is evidence, not a favorable benchmark slide.

### 3. Break the authority boundary

Useful attacks include:

- alternate unguarded provider paths;
- semantic request substitution between evaluation and execution;
- cross-lease evidence/provenance substitution;
- source-result tampering;
- relation abuse (`oneOf`, `max`);
- stale/replayed approvals;
- durable recovery/stale-writer races;
- cumulative business-state cases a per-effect ceiling cannot represent.

Security-sensitive findings should use GitHub private vulnerability reporting rather than a public exploit issue.

### 4. Bring a real workflow

Show a workflow where an agent has broader standing provider permissions than the human's task. Try to express the task with `exact`, `oneOf` and `max`.

If the task cannot be represented, first contribute a failing fixture/benchmark that demonstrates the gap. Only then propose the smallest typed relation or integration change needed to close it.

## Suggested announcement — long form

**Agent Authority v0.5.0 is now in Community Preview: give your agent a task, not your account.**

AI agents increasingly operate through credentials that are broader than the task a user actually requested. OAuth can say an app may use GitHub, Gmail, Calendar or another provider, but that standing permission does not answer whether one specific effect belongs to the current task.

Agent Authority adds a task-bounded effect boundary. A task can begin with explicit authority, discover new resources through authorized execution, derive downstream authority from evidence-bound provider output, and then technically block unrelated effects before their callbacks execute.

The preview includes coding, support and finance examples, connected GitHub execution, durable local Task Leases, TypeScript declarations, and narrow typed relations (`exact`, `oneOf`, `max`). We also added a pinned AgentDojo Slack oracle harness. Its first run exposed a real finite-set gap, so we added `oneOf` specifically to close that external workflow rather than building a general policy DSL.

For the selected oracle tasks the release gate is 5/5 mapping, 100% legitimate completion, 100% unrelated-target blocking and 0 execution-effective unauthorized effects. This is oracle evidence—not a claim of model-in-the-loop prompt-injection resistance.

We are releasing now because the next evidence should come from outside the project. We want developers to try the quickstart, researchers to attack the boundary, and agent builders to bring workflows that do not fit the current model.

If you can break the enforcement claim, make the API simpler, reproduce the benchmark, or show a real task the current authority relations cannot express, that is exactly the contribution we want.

## Suggested announcement — short form

**Agent Authority v0.5.0 Community Preview:** give your agent a task, not your account.

Task-bounded effect authority for AI agents, with evidence-derived resource lineage, `exact` / `oneOf` / `max` bindings, coding + finance proofs, connected GitHub, durable local tasks, TypeScript DX, and a pinned AgentDojo oracle benchmark.

The goal now is external validation. Try it, break it, benchmark it, or bring a workflow that does not fit.

Not production-ready. Not a prompt-injection cure. The security boundary and current gaps are documented publicly.

## After launch

The next maturity jump should be earned by external evidence, not more internal architecture:

1. independent under-10-minute onboarding evidence;
2. one external real integration that remains in use;
3. model-in-the-loop AgentDojo results;
4. independent security findings and fixes;
5. one useful external contribution;
6. only then prioritize production OAuth/KMS, remote multi-tenancy or broader framework/provider expansion based on actual demand.