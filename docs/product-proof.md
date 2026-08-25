# Product proof gate

Agent Authority has enough authorization machinery. The product risk is now whether developers can use the mechanism in real agents without losing useful autonomy or misunderstanding the trust boundary.

The product thesis is:

> **Your agent may use the permissions it already has only for the task the user actually gave it.**

The differentiated mechanism is:

> **Authority may follow task resources discovered through already-authorized execution, while remaining narrower than standing account authority.**

## Developer mental model

The preferred public experience stays close to three concepts:

```text
Task -> Effect -> Authority
```

A developer should not need Mission internals, Task Lease hashing, evidence envelopes, CAS persistence or transport mechanics before getting value. Those primitives remain available for advanced integrations and audits.

## Product-facing API

```js
import { createTask } from '@nullsquare/agent-authority/task';

const task = createTask({
  principal: 'user:me',
  agent: 'agent:assistant',
  request: 'Handle issue #42',
  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['repo.delete'],
      constraints: { repository: ['acme/app'] }
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: 'acme/app' }
  }
});

const discovery = await task.run(request, () => github.listIssues());
const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: 'repository',
  extractor
});

task.bind({
  service: 'github',
  action: 'issue.comment',
  field: 'issue_number',
  authority: 'issue' // exact is the default relation
});
```

The task-first facade composes Mission + Task Lease + Guard. It must not add authority the lower layers would reject.

The Community Preview adds a first-class TypeScript declaration for this task-first package path and keeps the relation vocabulary intentionally small.

## Typed task authority

Bindings support only:

```text
exact   request value == established authority value
oneOf   request value is one member of an established finite set
max     request numeric value <= established numeric ceiling
```

`exact` remains the backward-compatible default.

The design rule is **benchmark/workflow first, relation second**. `oneOf` exists because an external AgentDojo task requires exactly two legitimate Slack channels. `max` exists because the finance workflow needs a legitimate partial refund without authorizing an over-refund. We are not introducing a general expression language.

Invalid relation names are rejected. Invalid fact/value shapes fail closed. A request outside the relation becomes `authority_delta_required` before the guarded effect runs.

`max` is per effect, not cumulative accounting. Providers remain authoritative for aggregate state such as how much of a payment has already been refunded.

## Community Preview evidence bar

The code is announceable as a **Community / Developer Preview** when all repository-controlled items below are green:

- task-first GitHub coding workflow: issue -> branch -> file -> draft PR, with merge outside authority;
- support/communications proof across Gmail-shaped thread data -> Calendar-shaped attendee authority;
- operations/finance proof: ticket -> order -> payment -> bounded partial refund;
- external AgentDojo oracle benchmark over the selected Slack set;
- zero execution-effective unauthorized callbacks in the deterministic adversarial fixtures;
- Node 20/22 CI, package consumer checks and CodeQL;
- current security/trust-boundary documentation;
- packageable task-first TypeScript declarations;
- reproducible contribution and benchmark instructions.

These gates are deliberately different from a production-readiness claim.

## What remains external validation

The repository cannot self-certify adoption or model robustness. The following remain open after the Community Preview is announced:

- a first-time independent developer completing a meaningful integration in under 10 minutes;
- at least one external developer adopting the package without project-author assistance;
- model-in-the-loop AgentDojo runs with official utility/security scores;
- independent attempts to bypass the enforcement boundary;
- production credential lifecycle and remote multi-tenant deployment evidence.

Community announcement is intended to recruit exactly this evidence, not to pretend it already exists.

## Coding workflow proof

The task-first coding example now establishes this lineage:

```text
repository
   |
   v
issue
   |
   v
base SHA
   |
   v
task branch
   |
   v
changed path
   |
   v
draft pull request
```

The fixture proves that writes to `main`, unrelated file paths and PRs from the wrong branch step up before mutation, while merge remains explicitly denied. Completion removes the remaining task authority.

This is stronger than the earlier issue-comment slice: it demonstrates a recognizable coding-agent workflow under one task lineage.

## Support / communications proof

The support example demonstrates:

```text
authorized Gmail-shaped thread
   |
   v
reviewed sender extractor
   |
   v
exact customer email authority
   |
   v
Calendar-shaped attendee
```

Another thread or attendee reaches zero provider-shaped callbacks. The same task-first model crosses the service boundary without a second authorization abstraction.

A connected-account Google smoke has been demonstrated separately. Public GitHub Actions reproduction still depends on repository OAuth secrets and should remain a distinct evidence gate.

## Operations / finance proof

The Community Preview demonstrates:

```text
ticket
   |
   v
order
   |
   v
payment
   |
   +--> amount = 12500 minor units
   +--> currency = USD
   |
   v
refund binding
   |
   +--> same payment + 5000 USD -> ALLOW
   +--> another payment          -> STEP-UP
   +--> 15000 USD                -> STEP-UP
   +--> wrong currency           -> STEP-UP
   |
   v
task.complete() -> DENY later effects
```

The amount uses `relation: 'max'`; payment ID and currency remain exact. The example executes one legitimate partial refund only, avoiding any suggestion that Agent Authority itself is an aggregate refund ledger.

## External AgentDojo oracle proof

The AgentDojo harness pins `agentdojo==0.1.35`, benchmark version `v1.2.2`, Slack suite, and representative user tasks 5, 6, 7, 8 and 11.

The first oracle run intentionally exposed a finite-set gap in user task 11: Dora must be added to exactly `general` and `random`. Exact equality could not express both without a false approval or wildcard.

That finding drove the narrow `oneOf` relation. The Community Preview regression gate is now:

```text
selected tasks              5
mapped tasks                5
mapping coverage            100%
mapped-task completion      100%
unrelated-target block rate 100%
unauthorized effects        0
```

This is useful external-task **oracle** evidence. It is not a model-in-the-loop prompt-injection result and must not be marketed as one. See `benchmarks/agentdojo/README.md`.

## Utility metrics

Security tests are necessary but product validation also tracks:

```text
normal task completion rate
false approval rate
true authority-delta step-up rate
unauthorized effect rate
provider effects per completed task
mapping coverage
integration friction / time-to-first-protected-effect
```

`npm run benchmark:task` remains a deterministic regression fixture. AgentDojo adds an externally defined task set. Neither replaces independent developer adoption evidence.

## Security boundary that must stay visible

Agent Authority only protects effects that actually pass through its enforcement boundary. If an agent can reach the same provider through another credential/path, it can bypass the gate.

Strict `task.authorityFrom()` / `deriveFromEvidence()` prevents the ordinary caller from choosing a different derived value after the guarded output is produced: receipt, execution evidence, output hash and reviewed extractor must agree. This is still not cryptographic attestation from the remote provider itself.

Authenticated local durable recovery exists. Crash-atomic remote effect + local state coupling, automatic authority-delta application, source invalidation, production OAuth/KMS and hardened remote multi-tenancy remain incomplete.

Read `SECURITY.md` for the complete current claim.

## Freeze list

Until community evidence proves otherwise, do not prioritize:

- a proprietary general policy DSL;
- new identity/token formats;
- connector-count expansion for its own sake;
- another MCP control plane or agent harness;
- dashboard-first enterprise features;
- distributed persistence machinery without a demonstrated product need;
- broad OAuth platform work before real adopters need it.

Prefer the smallest change that closes a measured workflow, attack or adoption gap.

## Boundary discipline

The intended position is:

```text
agent reasoning
      |
      v
Agent Authority
      |
      v
existing SDK / MCP / gateway / OAuth / provider
```

The product wins if that middle layer is small to adopt, preserves useful agent work, exposes precise authority deltas, and prevents standing provider permission from silently becoming unrelated task authority.
