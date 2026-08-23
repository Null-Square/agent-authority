# Product proof gate

Agent Authority has enough security machinery to validate its core thesis. The next risk is no longer "can we make the invariant stronger?" It is "will an agent developer actually install and keep this layer?"

The product thesis is:

> **Your agent may use the permissions it already has only for the task the user actually gave it.**

The differentiated mechanism is narrower:

> **Authority may follow exact resources discovered through already-authorized execution, without turning those resources into standing account permissions.**

Everything else in the repository exists to make those two statements true.

## Developer mental model

The preferred public experience should stay close to three concepts:

```text
Task -> Effect -> Authority
```

A developer should not need to understand Mission internals, Task Lease hashing, execution evidence envelopes, CAS persistence or transport adapters before getting value.

Those primitives remain available for advanced integrations and audits.

## Product-facing API

The task-first facade intentionally composes the existing primitives instead of replacing them:

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
  authority: 'issue'
});
```

The low-level Mission and Task Lease APIs remain the source of truth. The facade must never add authority that those lower layers would reject.

## Adoption gate

Do not prioritize another deep authorization subsystem until the following are demonstrated:

- [ ] a new developer can run a meaningful task-first example in under 10 minutes;
- [ ] at least three real workflow examples exist: coding, support/communications, and operations/finance;
- [ ] the same task-first API works in-memory and with durable local state;
- [ ] useful-task completion stays high under the product benchmark;
- [ ] normal task actions do not trigger unnecessary approvals;
- [ ] unrelated-resource effects execute zero provider callbacks;
- [ ] approval/step-up output explains the established authority and requested delta clearly;
- [ ] at least one external developer uses the package without project-author assistance.

## Utility metrics

Security tests remain required, but product work should additionally track:

```text
normal task completion rate
false approval rate
true authority-delta step-up rate
unauthorized effect rate
provider effects per completed task
integration lines required for a representative workflow
```

`npm run benchmark:task` is the first deterministic fixture for these metrics. It is not a real-world benchmark and must not be marketed as one. Its purpose is to make utility regressions visible alongside security regressions.

The current fixture target is:

```text
normal task completion rate = 100%
false approval rate = 0%
true authority-delta step-up rate = 100%
unauthorized effect rate = 0%
```

Real provider/harness benchmarks should replace or supplement the fixture as the product matures.

## Three product proofs

### Coding agent

Task:

> Fix issue #42 and open a PR. Do not merge or deploy.

Desired authority lineage:

```text
repository -> issue -> task branch -> changed files -> pull request
```

Unrelated repositories, issues, merge and deploy remain outside the task.

### Support / communications agent

Task:

> Handle this customer email.

Desired authority lineage:

```text
email thread -> customer -> meeting / CRM record / reply target
```

The underlying connected account may have broad access; task authority follows only the customer/resource discovered through the authorized thread.

### Operations / finance agent

Task:

> Resolve this ticket and refund the affected order.

Desired authority lineage:

```text
ticket -> customer -> order -> payment -> refund <= original payment
```

This is the strongest long-term proof because it combines resource lineage with an amount ceiling.

## Freeze list

Until the adoption gate moves, the following remain research backlog unless a real workflow proves they are blocking adoption or safety:

- distributed Task Lease databases;
- generic storage abstraction layers;
- provider-signed attestation protocols;
- another token or identity format;
- a general delegation standard;
- a proprietary policy DSL;
- broad OAuth/OIDC platform work;
- another MCP control plane;
- A2A protocol implementation;
- large connector-count expansion;
- full distributed transaction semantics across arbitrary remote providers.

The existing durability, evidence, transport and credential primitives should be reused rather than deepened by default.

## Boundary discipline

Agent Authority should integrate with identity providers, OAuth systems, MCP gateways, policy engines and agent frameworks rather than compete with all of them.

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

The product wins if that middle layer is small to adopt, preserves useful autonomy, and technically prevents the same standing account permission from becoming unrelated task authority.
