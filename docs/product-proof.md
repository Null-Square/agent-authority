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
- [x] the same task-first API works in-memory and with durable local state;
- [x] useful-task completion stays high under the deterministic product benchmark;
- [x] normal fixture task actions do not trigger unnecessary approvals;
- [x] unrelated-resource effects execute zero provider callbacks in the deterministic fixture, live GitHub proof, support/communications proof, and operations/finance proof;
- [x] approval/step-up output explains the established authority and requested delta clearly;
- [ ] at least one external developer uses the package without project-author assistance.

The checked utility items are evidence about the current deterministic fixtures and live GitHub proof, not a claim that arbitrary real-world agent workloads have already met the same rates.

## First live provider product proof

The existing GitHub Actions mutation validation now runs through the public task-first API rather than hand-assembling Mission + Task Lease + Guard.

The live workflow uses:

```text
createTask()
   |
   v
task.run(issue.list)
   |
   v
task.authorityFrom(reviewed GitHub output)
   |
   v
issue #9 becomes downstream task authority
   |
   +--> task.run(issue.comment #9) -> real GitHub mutation
   +--> task.run(issue.comment #1) -> STEP-UP, zero provider mutation
   |
   v
task.complete()
   |
   v
issue.comment #9 -> DENY, zero provider mutation
```

Passing CI evidence from the live run:

- repository root: `Null-Square/agent-authority`;
- reviewed fixture selection: issue `#9`;
- `task.authorityFrom()` established issue `#9` as downstream authority;
- exactly one real GitHub comment mutation executed;
- unrelated issue `#1` produced `authority_delta_required` before provider mutation;
- `task.explain()` reported established authority `9` vs requested value `1`;
- the same issue was denied after `task.complete()`;
- provider calls before cleanup: `reads=1`, `task_mutations=1`;
- the temporary validation comment was deleted outside the authority proof.

This establishes a real-provider product proof for the facade, but it is **not yet** the full coding-agent product workflow. Branch creation, file edits and PR creation still need to be chained under task-derived authority while merge/deploy remain outside the task.

## Cross-provider support/communications proof

`examples/task-first-support.js` exercises the same public facade across two service boundaries using the exact field names and normalized sender shape used by the Google adapter:

```text
Task: handle one customer email and schedule the requested meeting

origin thread authority
      |
      v
task.run(gmail:thread.read)
      |
      v
reviewed Gmail sender extractor
      |
      v
customer@example.com
      |
      v
task.bind(calendar:event.create.attendee_email)
      |
      +--> exact customer meeting -> ALLOW
      +--> unrelated attendee -> STEP-UP, zero Calendar callbacks
      |
      v
task.complete() -> same meeting authority no longer usable
```

The task also binds the Gmail `thread_id` and Calendar `calendar_id` to explicit task-entry roots. A different Gmail thread is stopped before its callback runs.

The example and `test/task-product-support.test.js` run on Node 20 and Node 22 CI. The support proof demonstrates that the task-first model crosses Gmail -> Calendar without a second authorization abstraction.

This is intentionally a **self-contained product proof**. It mirrors the real Google provider contract but does not close the separate public Google Actions evidence gate; that gate still requires repository OAuth secrets.

## Operations / finance lineage proof

`examples/task-first-finance.js` exercises a longer evidence-derived authority chain without adding another provider, policy DSL, or numeric relation language:

```text
Task: resolve one support ticket by refunding only its payment

ticket:481
   |
   v
task.run(helpdesk:ticket.read)
   |
   v
order:991
   |
   v
task.run(orders:order.read)
   |
   v
payment:abc123
   |
   v
task.run(payments:payment.read)
   |
   +--> amount = 12500 minor units
   +--> currency = USD
   |
   v
task.bind(refund payment_id + amount + currency)
   |
   +--> exact full refund -> ALLOW
   +--> another payment -> STEP-UP, zero refund callbacks
   +--> over-refund -> STEP-UP, zero refund callbacks
   +--> wrong currency -> STEP-UP, zero refund callbacks
   +--> partial refund -> STEP-UP under current exact binding model
   |
   v
task.complete() -> same refund authority no longer usable
```

The task cannot read an arbitrary order before the ticket establishes the order fact: the unresolved binding fails closed before the order callback runs. The same pattern continues through payment and refund.

The example and `test/task-product-finance.test.js` run on Node 20 and Node 22 CI. On the passing fixture, provider-shaped callbacks are exactly one ticket read, one order read, one payment read and one refund.

This proof intentionally exposes a **product limitation rather than hiding it behind new policy machinery**: Task Lease bindings currently require exact equality. Therefore the payment amount `12500` can authorize an exact `12500` refund, but a legitimate partial refund such as `5000` also produces `authority_delta_required`. A future narrow `requested amount <= evidence-derived payment amount` relation may be justified if real provider/adoption evidence shows partial refunds are needed. Until then, the repository should keep this limitation visible instead of adding a general expression language speculatively.

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

The current fixture run contains 40 normal tasks and 10 unrelated-resource attempts. Real provider/harness benchmarks should replace or supplement it as the product matures.

## Three product proofs

### Coding agent

Task:

> Fix issue #42 and open a PR. Do not merge or deploy.

Desired authority lineage:

```text
repository -> issue -> task branch -> changed files -> pull request
```

Unrelated repositories, issues, merge and deploy remain outside the task.

The live issue-discovery -> exact-issue-comment proof is the first slice of this direction; it does not complete the branch/files/PR lineage yet.

### Support / communications agent

Task:

> Handle this customer email.

Desired authority lineage:

```text
email thread -> customer -> meeting / CRM record / reply target
```

The self-contained Gmail-thread -> exact Calendar-attendee slice is now established. The next value proof should connect the same customer authority to another useful downstream action (for example reply/CRM) or rerun the task-first flow with the real Google Actions fixture once repository OAuth secrets are available.

### Operations / finance agent

Task:

> Resolve this ticket and refund the affected order.

Desired authority lineage:

```text
ticket -> customer -> order -> payment -> refund <= original payment
```

The self-contained ticket -> order -> payment -> **exact full refund** lineage is now established. The remaining product question is narrower than the original workflow: whether partial refunds are important enough to justify one evidence-derived numeric ceiling relation. Current exact bindings intentionally step up for a smaller amount rather than guessing that relation into the core.

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
