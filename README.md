<div align="center">

![Agent Authority](docs/assets/agent-authority-cover-editorial-v2.png)

# Agent Authority

### Give your agent a task, not your account.

**Agent Authority is a small execution layer that lets an agent use existing account permissions only for the task the user actually gave it.**

[Task-first API](#task-first-api) · [Product proof gate](docs/product-proof.md) · [Task Leases](docs/task-leases.md) · [Durability](docs/durable-task-leases.md) · [Evidence](docs/evidence.md) · [Transport invariance](docs/transport-invariance.md) · [Roadmap](ROADMAP.md)

> **Status: public pre-alpha / v0.4.5 Developer Preview on npm.** The `main` branch may contain unreleased work for the next preview. Agent Authority is not production-ready yet.

</div>

## Why this exists

A user gives an agent a narrow task:

> **Handle this customer email.**

But the connected account may give the application broad standing permission to read every email, create meetings with anyone, update any CRM record, or send mail to anyone.

OAuth and IAM answer:

> Can this application use Calendar?

Agent Authority asks immediately before the effect:

> **Is this exact Calendar action justified by the task the user authorized?**

The target is:

```text
one meaningful task approval
        |
        v
temporary bounded authority
        |
        +--> useful task actions proceed normally
        +--> authority may follow resources discovered through authorized work
        +--> unrelated resources require step-up
        |
        v
task completes -> task authority disappears
```

The provider credential may continue to exist. The **task authority does not**.

## Install

Requires Node.js 20+.

```bash
npm install @nullsquare/agent-authority
```

## Task-first API

The preferred developer surface is intentionally small:

```text
Task -> Effect -> Authority
```

```js
import { createTask } from '@nullsquare/agent-authority/task';

const task = createTask({
  principal: 'user:me',
  agent: 'agent:assistant',
  request: 'Find issue #42 and leave one comment only on that issue',

  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['issue.close', 'repo.delete'],
      constraints: { repository: ['acme/app'] }
    }
  },

  authority: {
    repository: {
      kind: 'github.repository',
      value: 'acme/app'
    }
  },

  bindings: [
    {
      service: 'github',
      action: 'issue.list',
      field: 'repository',
      authority: 'repository'
    }
  ]
});

const discovery = await task.run({
  service: 'github',
  action: 'issue.list',
  context: { repository: 'acme/app' }
}, () => github.listIssues());

const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: 'repository',
  extractor: selectedIssueExtractor
});

task.bind({
  service: 'github',
  action: 'issue.comment',
  field: 'issue_number',
  authority: 'issue'
});

await task.run({
  service: 'github',
  action: 'issue.comment',
  context: {
    repository: 'acme/app',
    issue_number: issue.value,
    body: 'Handled.'
  }
}, () => github.comment(issue.value, 'Handled.'));
```

If the agent changes `issue_number` to an unrelated issue, the callback does not run. Agent Authority returns an authority-delta step-up that can be explained to a human:

```js
try {
  await task.run(unrelatedRequest, effect);
} catch (error) {
  console.log(task.explain(error).summary);
}
```

Example output:

```text
The task established authority for 42 but this action requested 7.
```

The task-first API is a facade over the existing Mission, Task Lease, execution-evidence and guard primitives. It does not weaken or replace them.

## Run the product demo

From a checkout:

```bash
npm install
npm run demo:task
```

The self-contained GitHub-shaped demo performs:

```text
1. authorized issue discovery
2. exact guarded result becomes downstream authority
3. comment on the discovered issue succeeds
4. comment on an unrelated issue requires step-up
5. blocked attempt executes zero provider callbacks
```

The callback bodies are intentionally replaceable with the SDK/provider calls an application already uses.

## Utility benchmark

Security is necessary but not sufficient. Agent Authority also tracks whether normal agent work still succeeds without approval fatigue.

```bash
npm run benchmark:task
```

The first deterministic fixture measures:

- normal task completion rate;
- false approval rate;
- true authority-delta step-up rate;
- unauthorized effect rate;
- provider effects required for completed tasks.

Its current regression target is:

```text
normal task completion rate = 100%
false approval rate = 0%
true authority-delta step-up rate = 100%
unauthorized effect rate = 0%
```

This is a deterministic product regression fixture, **not a real-world benchmark**. Real provider and harness workloads should replace or supplement it as adoption grows.

See [Product proof gate](docs/product-proof.md).

## The differentiated mechanism

Many task resources are unknown when the user gives the instruction. They are discovered during execution.

Agent Authority lets authority follow those resources only when the value comes from already-authorized work:

```text
human-approved task
        |
        v
 authority root
 repository = acme/app
        |
 authorized issue discovery
        |
        +--> ALLOW receipt
        +--> exact output evidence
        |
 reviewed extractor
        |
        v
 derived authority
 issue = 42
        |
        v
 later effect may bind issue_number == 42
```

A request for issue `42` can proceed.

A request for issue `7` does not inherit the same authority simply because the underlying GitHub credential can access it.

That is the core contribution we are testing:

> **Authority may follow the task's proven execution path without becoming ambient account authority.**

## Core invariant

```text
Task Lease authority <= Mission authority
```

The Mission remains the ceiling. Task authority may stay the same or shrink as work crosses tools, transports and durable state. It must never silently grow.

## Existing stack, not a replacement stack

Agent Authority is not trying to replace OAuth, IAM, MCP, gateways or agent frameworks.

```text
agent reasoning
      |
      v
Agent Authority
      |
      v
existing SDK / MCP / gateway / OAuth / provider
```

Three execution modes already share the same Task Lease semantics:

```text
in-process guard
MCP gateway
brokered provider execution
```

A real Vercel AI SDK `ToolLoopAgent` integration also exercises the protected-tool boundary. See [Transport invariance](docs/transport-invariance.md).

## Durability

For local workflows that must survive process restarts, pass a `JsonFileTaskLeaseStore` to the same task-first API:

```js
import { JsonFileTaskLeaseStore } from '@nullsquare/agent-authority/storage';
import { createTask } from '@nullsquare/agent-authority/task';

const store = new JsonFileTaskLeaseStore({
  dir: config.paths.task_leases,
  keyPath: config.paths.master_key
});

const task = createTask({
  ...taskDefinition,
  store
});
```

The task facade then uses the durable Task Lease session internally. Normal task calls do not change.

Durable state currently provides authenticated local recovery, exact Mission binding, atomic whole-state replacement, per-lease local locking, stale-writer compare-and-swap protection, durable completion/expiry, and refresh before authority evaluation.

See [Durable Task Leases](docs/durable-task-leases.md).

## What is already proven

- deterministic allow / deny / require-approval decisions;
- explicit deny precedence and Mission ceiling;
- execution evidence bound to exact guarded output;
- strict evidence-derived authority where callers do not provide the derived value;
- reviewed Google Gmail-sender and GitHub selected-issue extractors;
- shared two-provider adversarial conformance tests;
- live GitHub read and evidence-derived comment mutation proofs;
- connected Gmail -> Calendar smoke proof;
- direct SDK / MCP / broker transport invariance;
- real Vercel AI SDK protected-tool execution proof;
- authenticated durable Task Lease recovery;
- stale-writer/CAS and mission-alias protection;
- automatic durable Task Lease sessions;
- Node 20/22 CI, coverage, packed-consumer validation and CodeQL;
- independent npm registry consumer verification.

The lower-level evidence is documented under `docs/` and remains available for security review.

## Product direction

The next product risk is **not lack of another security subsystem**. It is adoption and useful autonomy.

Before deeper distributed/crypto infrastructure becomes a priority, Agent Authority should prove:

1. a new developer can get a meaningful workflow running in under 10 minutes;
2. coding, support/communications and operations/finance workflows all fit the task-first model;
3. normal task completion stays high without approval spam;
4. unrelated-resource effects still execute zero provider callbacks;
5. at least one external developer adopts the package without project-author assistance.

See [Product proof gate](docs/product-proof.md) and [Roadmap](ROADMAP.md).

## Current limitations

This is still a validation implementation.

- Durable persistence is a trusted-local-host reference backend, not distributed consensus or hostile-host containment.
- Another worker can still change durable state after an `ALLOW` decision and before asynchronous remote provider I/O begins. Remote effect + receipt + Task Lease state are not one distributed transaction.
- A crashed local worker may leave a per-lease lock requiring explicit recovery.
- Transport/harness proofs do not contain a malicious host that deliberately exposes a separate unguarded tool, shell, network path or credential.
- Provider outputs are evidence-bound inside the trusted Agent Authority runtime but are not provider-signed remote attestations.
- Source-data changes do not yet automatically invalidate already-derived authority.
- Approved authority deltas are surfaced but not automatically applied into a live durable task.
- GitHub token-stdin and the local encrypted vault are developer bridges, not final production OAuth/KMS UX.
- Remote authenticated deployment and production approval UX remain incomplete.

These are real limitations. They are not reasons to build every possible infrastructure layer before product adoption is proven.

## What we are deliberately not prioritizing now

Unless a real workflow proves otherwise:

- another agent harness;
- a new OAuth/identity/token protocol;
- an MCP replacement/control plane;
- a connector marketplace;
- a proprietary universal policy DSL;
- distributed Task Lease databases;
- provider-attestation protocol design;
- A2A implementation;
- dashboard-first enterprise product work.

## Contributing

The most valuable contribution answers:

> **Can this agent complete the intended task while being technically unable to use the same standing account authority for an unrelated effect?**

Especially useful:

- real task-first workflows;
- trustworthy operation -> resource mappings;
- utility-regression cases that cause unnecessary approvals;
- derived-authority / provenance attacks;
- transport or multi-worker attacks;
- feedback from developers trying to integrate the package for the first time.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare**.

**Give your agent a task, not your account.**

</div>
