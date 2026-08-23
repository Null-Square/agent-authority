<div align="center">

![Agent Authority](docs/assets/agent-authority-cover-editorial-v2.png)

# Agent Authority

### Give your agent a task, not your account.

**Agent Authority turns a human-approved task into temporary execution authority, then keeps that authority bounded as the agent discovers resources, crosses tools, survives local process restarts, and performs side effects.**

[Task Leases](docs/task-leases.md) · [Durable Task Leases](docs/durable-task-leases.md) · [Executable evidence](docs/evidence.md) · [Extractor conformance](docs/authority-extractor-conformance.md) · [Transport invariance](docs/transport-invariance.md) · [Google proof](docs/live-google-validation.md) · [Integration contract](docs/integration-contract.md) · [CLI](docs/cli.md) · [Architecture](docs/architecture.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: public pre-alpha / v0.4.5 Developer Preview.** Published on npm as `@nullsquare/agent-authority`. The repository has a working policy runtime, protocol-neutral guard, Task Leases, execution-bound derived facts, reviewed Google and GitHub authority extractors, Task-Lease-aware SDK/MCP/broker execution, a real Vercel AI SDK harness proof, authenticated local Task Lease recovery, transactional durable state with stale-writer protection, automatic durable Task Lease sessions, approvals, revocation, idempotency, credential isolation, live GitHub proofs, CI and CodeQL. It is not production-ready yet.

</div>

## Install

Requires Node.js 20+.

```bash
npm install @nullsquare/agent-authority
```

## The problem

AI agents increasingly receive broad provider permissions so they can complete narrow human tasks.

A user says:

> **Handle the demo request in this email thread.**

The agent may need to:

```text
Gmail -> read one thread
          |
          v
       discover sender
          |
          v
Calendar -> create one meeting with that sender
          |
          v
Gmail -> reply in the originating thread
```

The underlying OAuth connections may permit reading every email, creating meetings with anyone, or sending mail to anyone.

Traditional authorization answers:

> Can this application use Calendar?

Agent Authority asks a narrower question immediately before the side effect:

> **Is this exact effect justified by the task the human authorized?**

## Task-bounded autonomy

Agent Authority is trying to make this trade-off unnecessary:

```text
broad standing permissions
        OR
approve every tool call
```

The target is:

```text
one meaningful task approval
        |
        v
temporary bounded authority
        |
        +--> safe task actions proceed
        +--> unrelated resources are blocked
        +--> real authority expansion requires step-up
        |
        v
task completes -> authority disappears
```

The provider credential may continue to exist. The **task authority does not**.

## The key idea: authority can follow trusted task data

Many resources do not exist in the original prompt. The agent discovers them while working.

Agent Authority models this with a **Task Lease**:

```text
Human-approved task
        |
        v
  authority root
  Gmail thread #91
        |
 authorized read
        |
        +--> ALLOW receipt
        +--> exact output hash evidence
        |
        v
 reviewed adapter extractor
        |
        v
 derived fact
 customer@example.com
        |
        v
 exact binding
 Calendar attendee must equal that sender
```

A request for `customer@example.com` can proceed.

A request for `other@example.com` does not silently inherit the same authority. It becomes an **authority delta** and requires step-up.

This is **derived authority**: authority follows a resource discovered through authorized execution, but never broadens into a standing wildcard permission.

See [Task Leases and Derived Authority](docs/task-leases.md).

## Core invariant

```text
Task Lease authority <= Mission authority
```

The mission remains the ceiling. A Task Lease may narrow an action to resources discovered during the task, but it cannot grant an action that the mission already denies or never allowed.

More generally:

> **Authority may stay the same or shrink as it moves through agents, tools, transports and durable state. It must never silently grow.**

## Run the derived-authority demo

Requirements: Node.js 20+.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
npm run demo:task-lease
```

The demo performs this flow without provider credentials:

```text
1. ALLOW read of one task-authorized Gmail thread
2. derive sender email from that same Task Lease receipt
3. ALLOW Calendar event for that sender
4. REQUIRE_APPROVAL for a different attendee
5. complete task
6. DENY subsequent actions
```

The side-effect callbacks for blocked actions never run.

The repository also includes a real Gmail → Calendar validation path and a reusable Google provider adapter. The strict path binds the derived sender to the exact guarded output before it becomes authority. See [Live Gmail → Calendar validation](docs/live-google-validation.md) and [Executable Evidence](docs/evidence.md).

v0.4.3 applied the **same evidence-derived authority primitive to GitHub**: a root-bound repository + fixture marker are used by the reviewed GitHub adapter to select one issue from a real `issue.list` response; `deriveFromEvidence()` establishes that exact issue number as downstream authority; one real comment mutation succeeds; unrelated and post-completion issue mutations never reach the provider.

v0.4.4 added the **transport-invariance proof**: one evidence-derived fact under one Task Lease constrains ordinary `guard.run()`, the MCP gateway, brokered provider execution and a configured Vercel AI SDK `ToolLoopAgent` protected-tool path. See [Task Lease transport invariance](docs/transport-invariance.md).

v0.4.5 adds **durable Task Lease authority state** on the trusted local host. Authenticated snapshots survive process restart, exact mission identity and provenance are revalidated before recovery, local mutations use an atomic transaction/CAS boundary, stale workers cannot silently overwrite newer authority, and `DurableTaskLeaseSession` routes ordinary Task Lease mutations through that boundary. The independent npm registry verifier installs v0.4.5 into a clean Node 20 consumer and executes this durable session behavior from the registry artifact. See [Durable Task Leases](docs/durable-task-leases.md).

## Minimal developer API

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';
import { gmailThreadSenderAuthorityExtractor } from '@nullsquare/agent-authority/providers/google';

const lease = createTaskLease({
  mission,
  request: 'Handle the demo request in thread:demo-91',
  roots: [
    { fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread:demo-91' }
  ],
  bindings: [
    {
      service: 'calendar',
      action: 'event.create',
      context_field: 'attendee_email',
      fact_id: 'fact:sender-email'
    }
  ]
});

const guard = createTaskLeaseGuard({
  lease,
  runtime: new AuthorityRuntime()
});

const read = await guard.run({
  service: 'gmail',
  action: 'thread.read',
  context: { thread_id: 'thread:demo-91' }
}, () => gmail.readThread('thread:demo-91'));

const senderFact = lease.deriveFromEvidence({
  fact_id: 'fact:sender-email',
  kind: 'email.address',
  from: ['fact:thread'],
  receipt: read.receipt,
  evidence: read.evidence,
  output: read.output,
  extractor: gmailThreadSenderAuthorityExtractor
});
```

`deriveFromEvidence()` does not accept the authority value. The reviewed extractor selects a normalized output field, and Task Lease resolves that value only after verifying that the output still matches the exact allowed execution evidence.

The older `derive()` API remains available as the explicitly **host-trusted compatibility path**.

## Durable Task Lease API

For local workflows that must survive process restart or coordinate multiple cooperating workers, use the authenticated store plus durable session facade:

```js
import { JsonFileTaskLeaseStore } from '@nullsquare/agent-authority/storage';
import {
  createDurableTaskLeaseSession
} from '@nullsquare/agent-authority/durable-task-lease';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';

const store = new JsonFileTaskLeaseStore({
  dir: config.paths.task_leases,
  keyPath: config.paths.master_key
});

const session = createDurableTaskLeaseSession({ store, lease });
const guard = createTaskLeaseGuard({ lease: session, runtime });

const read = await guard.run(request, () => provider.read());

session.deriveFromEvidence({
  fact_id: 'fact:selected',
  kind: 'provider.resource',
  from: ['fact:root'],
  receipt: read.receipt,
  evidence: read.evidence,
  output: read.output,
  extractor
});
```

The session keeps its mutable Task Lease private. `addRoot()`, `derive()`, `deriveFromEvidence()`, `bind()` and `complete()` commit through the store's compare-and-swap transaction boundary. A stale session receives `task_lease_state_conflict` and must refresh/reconsider rather than silently replaying an authority mutation against newer state.

Security-critical session evaluation refreshes authenticated durable state first, so another worker's already-committed completion or narrowing is observed before the next decision.

## Three integration modes, one authority model

Agent Authority is deliberately **not tied to MCP, OAuth, or one agent framework**.

### 1. In-process guard

```text
agent code -> guard.run() -> existing SDK / API
```

### 2. MCP gateway

```text
MCP host -> Agent Authority -> existing MCP server
```

### 3. Brokered execution

```text
agent -> Agent Authority -> isolated credential -> provider
```

The same Task Lease authority model is exercised across all three paths plus the configured Vercel AI SDK protected-tool path. A durable session implements the same `evaluate(runtime, request)` boundary, so persistence changes how task state survives—not the authority model each transport uses.

## What is implemented

### Task authority

- mission validation and deterministic `ALLOW / DENY / REQUIRE_APPROVAL`
- explicit deny precedence
- resource/context constraints
- expiry and cumulative budgets
- delegation attenuation
- durable mission revocation
- explicit Task Lease authority roots
- same-lease provenance-bound derived facts
- execution evidence binding an allowed receipt, request and exact output hash
- strict `deriveFromEvidence()` where the caller cannot provide the authority value
- reviewed Gmail and GitHub authority extractors
- shared Google/GitHub authority-extractor conformance suite
- legacy host-trusted `derive()` compatibility path
- exact context-field bindings and authority-delta step-up
- immediate task completion/expiry enforcement
- Task Lease IDs/hashes in decision receipts

### Enforcement

- protocol-neutral `guard.run()` wrapper
- blocked side effects never invoke their callback
- successful guarded effects return separate execution evidence
- Task-Lease-aware MCP gateway/proxy evaluation
- Task-Lease-aware brokered execution via `ExecutingAuthorityRuntime.executeTaskLease()`
- SDK/MCP/broker transport-invariance conformance test
- real Vercel AI SDK `ToolLoopAgent` protected-tool harness proof
- unmapped executable AI SDK tools fail closed before their effect executes
- one-time human approvals bound to exact request
- mutation idempotency and conservative uncertain-state handling

### Durability

- Task Lease snapshots bind the exact Mission hash
- validated Task Lease recovery rejects mission substitution, malformed state and invalid authority lineage
- HMAC-SHA256-authenticated local snapshots using a purpose-derived key from the Agent Authority master key
- atomic whole-snapshot replacement
- local per-lease transaction lock
- stale-worker compare-and-swap protection
- changed raw saves cannot silently overwrite newer durable authority
- transactional root/fact/binding/completion mutations
- durable completion and expiry across restart
- `DurableTaskLeaseSession` automatic mutation facade
- durable session refresh before authority evaluation
- stale execution-evidence derivation conflicts when lease state changes between read and derive

### Credentials and runtime

- persistent connection metadata
- AES-256-GCM local encrypted secret store
- safe reconnect cleanup
- GitHub brokered execution without returning the token to the agent
- GitHub REST mappings for repository access plus evidence-derived `issue.list` / `issue.comment`
- Google REST provider mappings for Gmail thread reads and Calendar event mutations
- short-lived signed local agent-instance tokens
- local CLI/daemon

### Engineering quality

- adversarial authorization and provenance tests
- execution-evidence substitution, tampering, replay, cross-lease and selector tests
- provider-derived-authority conformance attacks against Google and GitHub
- transport invariance across direct SDK, MCP and brokered execution
- real AI SDK agent-loop unauthorized/unmapped/completed tests with zero underlying effects
- durable restart, tamper, stale-writer, alias, conflict and stale-evidence tests
- Node 20 and Node 22 CI
- coverage and packed-package checks
- independent clean-consumer npm registry verification
- live GitHub read and evidence-derived mutation proofs
- CodeQL

## What is different from OAuth, IAM and MCP authorization?

Agent Authority is **not trying to replace them**.

OAuth/IAM answer who or what may access a provider and with which standing scopes. MCP authorization protects an MCP transport. Agent Authority operates at a different boundary:

```text
human task
    |
    v
temporary task authority
    |
    v
exact agent-originated effect
    |
    +--> existing OAuth / IAM / MCP / SDK / CLI
```

The project should consume existing identity/authentication mechanisms and emerging standards rather than invent another login or token format.

The contribution we are testing is operational: **make task-scoped, provenance-aware least privilege usable inside ordinary agent stacks.**

## Example use cases

### Support / sales

> Handle this customer request.

Bind later actions to the customer, thread, ticket or meeting discovered from the authorized task path.

### Finance

> Refund the customer from this ticket, but never more than the original charge.

Discover customer -> order -> charge through authorized reads, then bind the refund to those concrete facts and amount ceiling.

### Coding / operations

> Fix issue #42, open a PR, do not merge or deploy production.

Keep repo/issue/branch authority bounded as subagents and tools change.

### Personal / company operating agents

> Handle this email.

Allow a natural workflow across mail, calendar, CRM and internal systems without turning every connected account into ambient agent authority.

## Security principles

1. **Task before credential.** A provider token is not task authority.
2. **Mission is the ceiling.** Task Leases cannot override explicit denies.
3. **No side effect before authorization.** Denied and step-up actions never execute.
4. **Authority lineage matters.** Provider-derived authority should bind the exact allowed receipt and guarded output to a reviewed extractor.
5. **No silent resource expansion.** A different concrete resource becomes an authority delta.
6. **Task authority ends with the task.** Completion and expiry are independent from provider credential lifetime.
7. **Authority may shrink, never silently grow.** Delegation, transport and recovery must preserve non-amplification.
8. **The evaluated request must be the executed request.** Request hashes, grants and idempotency protect the boundary.
9. **Durable authority is versioned authority.** Stale workers do not get last-writer-wins over newer Task Lease state.
10. **Credentials stay out of model context where Agent Authority owns them.**
11. **Security gaps are documented, not marketed away.**

See [SECURITY.md](SECURITY.md).

## Current limitations

This is still a validation implementation.

- Durable Task Lease persistence is currently a trusted-local-host reference backend using authenticated files and a local filesystem lock; it is not distributed consensus, a remote database protocol, or hostile-host containment.
- A worker refreshes durable state before evaluation, but another worker can still change the lease after an `ALLOW` decision and before asynchronous remote provider I/O begins. Remote effect + receipt + Task Lease state are not yet one crash-safe distributed transaction.
- A crashed local worker may leave a per-lease lock directory requiring explicit recovery; Agent Authority does not silently guess that a lock is stale.
- Transport and harness proofs cover configured Agent Authority execution boundaries, not a malicious host that exposes a separate unguarded tool, credential, shell or network path.
- `deriveFromEvidence()` proves consistency with the exact output returned through the trusted Agent Authority runtime boundary, but the output is not cryptographically attested by Gmail, GitHub, or another remote provider.
- The legacy `derive()` API remains host-trusted for compatibility; audit provenance distinguishes it from `execution-evidence-v1` derivation.
- Source-data changes do not yet automatically invalidate already-derived authority facts.
- Bindings currently target top-level request context fields.
- Approved authority deltas are surfaced but not automatically applied back into a live durable lease.
- GitHub token-stdin is a developer bridge, not final browser OAuth onboarding.
- The encrypted local vault is not an OS keychain/KMS/HSM backend.
- Remote authenticated deployment and a production approval UX are not complete.

These are follow-on validation problems. We are intentionally not solving them with a giant policy language or another agent framework.

## What we are deliberately not building

- another agent harness
- another OAuth or identity protocol
- an MCP replacement
- a connector marketplace
- a giant proprietary policy DSL
- an enterprise dashboard before the enforcement primitive proves adoption

## Contributing

The best contribution is not another abstract feature. It is a real integration or adversarial case that answers:

> **Can this agent complete the intended task while being technically unable to use the same underlying account authority for an unrelated effect?**

We especially want:

- framework integrations around `guard.run()`;
- trustworthy operation -> resource-context mappings;
- Task Lease examples from real workflows;
- derived-authority / provenance attacks;
- durable-state and multi-worker attacks;
- MCP and non-MCP conformance cases;
- secure persistence and extraction-verification designs that stay simple.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare**.

**Give your agent a task, not your account.**

</div>
