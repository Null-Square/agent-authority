<div align="center">

![Agent Authority](docs/assets/agent-authority-cover.svg)

# Agent Authority

### Give your agent a task, not your account.

**Protect the tools your agent already uses. Keep your framework, provider SDKs, OAuth connections, and credentials. Agent Authority makes sure an agent-originated effect is inside the human-approved task before the tool's real `execute()` callback can run.**

[Validate](docs/validation.md) · [Task Leases](docs/task-leases.md) · [Integration contract](docs/integration-contract.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: public pre-alpha / v0.5 adoption validation.** Task Leases, derived authority, protocol-neutral tool protection, Vercel AI SDK `ToolLoopAgent` validation, live GitHub validation, approvals, revocation, idempotency, credential isolation, MCP v2 gateway, CI and CodeQL are implemented. This is not production-ready yet.

</div>

## The problem

Agent applications often give an LLM access to broad connected accounts so it can complete narrow tasks.

A user says:

> **Handle the demo request in this email thread.**

The agent may need to:

```text
read one Gmail thread
        |
        v
 discover sender
        |
        v
create one Calendar event
with that sender
```

The underlying credentials may permit reading every email and creating meetings with anyone.

OAuth/IAM can answer:

> Can this application use Calendar?

Agent Authority adds a narrower runtime question:

> **Is this exact tool effect justified by the task the human authorized?**

## Put Agent Authority around existing tools

The primary v0.5 integration is `protectTools()`.

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';
import { protectTools } from '@nullsquare/agent-authority/protect-tools';

const lease = createTaskLease({
  mission,
  request: 'Handle demo thread 91',
  roots: [
    { fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread:91' }
  ],
  bindings: [{
    service: 'calendar',
    action: 'event.create',
    context_field: 'attendee',
    fact_id: 'fact:sender'
  }]
});

const safeTools = protectTools(existingTools, {
  lease,
  runtime: new AuthorityRuntime(),
  mappings: {
    readThread: {
      service: 'gmail',
      action: 'thread.read',
      context: ({ input }) => ({ thread: input.threadId }),
      derive: [{
        fact_id: 'fact:sender',
        kind: 'email.address',
        from: ['fact:thread'],
        selector: 'output.sender',
        value: ({ output }) => output.sender
      }]
    },
    createMeeting: {
      service: 'calendar',
      action: 'event.create',
      context: ({ input }) => ({ attendee: input.attendee })
    }
  }
});
```

Then give `safeTools` to the framework exactly where you previously passed `existingTools`.

```text
agent framework
      |
      v
 protected tool.execute()
      |
      v
   Task Lease
      |
 ALLOW / DENY / STEP-UP
      |
      v
 original tool.execute()
      |
      v
 existing SDK / API / provider
```

A blocked or step-up action never calls the original `execute()`.

### Fail closed by default

If `existingTools` contains a tool with no authority mapping, setup fails.

```text
readThread       mapped   ✓
createMeeting    mapped   ✓
sendEmail        missing  -> setup error
```

Pure local/non-sensitive tools can be deliberately left unwrapped with `allowUnmapped: true`, but that opt-out is explicit.

## Real framework proof: Vercel AI SDK

The repository includes a genuine Vercel AI SDK 6 `ToolLoopAgent` validation using real `tool()` objects and `MockLanguageModelV3`.

```bash
npm install
npm run demo:vercel-ai
```

The framework/model chooses the tool calls itself.

Authorized run:

```text
ToolLoopAgent chooses readThread(thread:91)
        |
        v
Agent Authority -> ALLOW
        |
provider read executes
        |
output.sender = customer@example.com
        |
Agent Authority derives fact:sender
        |
ToolLoopAgent chooses createMeeting(customer@example.com)
        |
        v
Agent Authority -> ALLOW
        |
Calendar effect executes
```

Adversarial run:

```text
model chooses createMeeting(attacker@example.com)
        |
        v
Agent Authority -> authority_delta_required
        |
        X
original Calendar execute() is never called
provider effect count = 0
```

The important property is not that the model behaved well. The test intentionally makes the model choose the wrong effect and checks that the provider callback still cannot run.

## Task-bounded autonomy

Agent Authority is trying to avoid this trade-off:

```text
broad standing account permission
              OR
human approval on every tool call
```

The target is:

```text
one meaningful task boundary
        |
        v
temporary bounded authority
        |
        +--> normal task effects proceed
        +--> unrelated resources are blocked
        +--> genuine expansion becomes step-up
        |
        v
task completes -> task authority disappears
```

Provider credentials may continue to exist. The **Task Lease does not**.

## Derived authority

Many concrete resources do not exist in the original prompt. The agent discovers them while working.

```text
human-approved root
Gmail thread #91
        |
 authorized read
        |
        v
 derived fact
customer@example.com
        |
        v
Calendar attendee must equal that sender
```

A later request for `customer@example.com` may proceed.

A request for `attacker@example.com` cannot silently inherit the same authority. It becomes an `authority_delta_required` step-up.

The invariant remains:

```text
Task Lease authority <= Mission authority
```

A Task Lease can narrow existing mission authority. It cannot grant an action the mission does not already allow or override an explicit deny.

See [Task Leases and Derived Authority](docs/task-leases.md).

## Repeated agent reads are safe

Agent loops frequently repeat reads. If the same protected read derives the same fact with the same mapping/provenance, Agent Authority treats it as an idempotent replay.

If the derived value or provenance changes after authority was established:

```text
derived_fact_conflict
```

The existing fact is preserved rather than silently changing task authority underneath the running agent.

## Live provider proof

The repository also runs a live GitHub API validation in CI:

```bash
npm run demo:live-github
```

It grants the task exactly one repository:

```text
Null-Square/agent-authority
```

The allowed repository causes one real `api.github.com` request.

Then the same code requests another repository:

```text
octocat/Hello-World
```

Agent Authority returns `authority_delta_required` before `fetch()` runs. The outbound-call counter remains `1`.

This demonstrates the core property at a real external API boundary: underlying connectivity exists, but unrelated task authority does not.

## Existing frameworks stay in place

Agent Authority is not an agent harness and does not require one protocol.

### Existing tool objects — primary v0.5 path

```text
Vercel AI SDK / custom tool runtime / future framework adapters
                    |
                    v
              protectTools()
                    |
                    v
                Task Lease
```

### Direct SDK guard

```text
agent code -> guard.run() -> existing SDK / API
```

Useful when an application does not expose framework-style tool objects.

### MCP gateway

```text
MCP host -> Agent Authority -> existing MCP server
```

MCP is a transport integration, not the product identity.

### Brokered execution

```text
agent -> Agent Authority -> isolated credential -> provider
```

Useful when the agent should not own the provider credential at all.

The long-term requirement is that changing transport must not broaden the same task authority.

## What `protectTools()` guarantees

For a protected executable tool:

1. its description/schema/metadata are preserved;
2. tool input is mapped to semantic authority context before execution;
3. mission policy remains the maximum authority ceiling;
4. Task Lease bindings restrict concrete resources;
5. `DENY` and `REQUIRE_APPROVAL` never invoke the original `execute()`;
6. successful outputs can establish explicitly mapped derived facts;
7. identical derivation replay is idempotent;
8. conflicting derived facts cannot silently replace existing task authority;
9. unmapped tools fail setup by default.

## What is implemented

### Task authority

- deterministic `ALLOW / DENY / REQUIRE_APPROVAL`
- explicit deny precedence
- resource/context constraints
- expiry and budgets
- delegation attenuation
- durable mission revocation
- Task Leases
- explicit authority roots
- same-lease provenance-bound derived facts
- required parent lineage and trusted extraction selector
- exact context-field bindings
- authority-delta step-up signal
- immediate task completion/expiry enforcement
- Task Lease IDs/hashes in receipts

### Developer enforcement

- `protectTool()` / `protectTools()`
- fail-closed unmapped-tool handling
- semantic input -> authority context mapping
- trusted output -> derived authority mapping
- repeated-derivation replay protection
- protocol-neutral `guard.run()`
- one-time human approvals
- mutation idempotency
- signed harness action grants
- Vercel AI SDK `ToolLoopAgent` validation
- MCP v2 gateway/proxy

### Credentials/runtime

- persistent connection metadata
- AES-256-GCM development secret store
- safe reconnect cleanup
- GitHub brokered execution without returning the token to the model
- short-lived local agent-instance tokens
- local CLI/daemon

### Validation

- adversarial authorization tests
- network-boundary provider test
- live GitHub API validation
- Vercel AI SDK model-selected tool validation
- Node 20/22 CI
- coverage
- package checks
- CodeQL

## What Agent Authority is not

It is deliberately not:

- another agent harness;
- an OAuth replacement;
- a new identity protocol;
- an MCP replacement;
- a connector marketplace;
- a universal proprietary policy language;
- a dashboard-first enterprise product.

OAuth/IAM and provider authentication remain underneath Agent Authority. They answer who can access the account. Agent Authority attempts to keep each agent task narrower than that standing connectivity.

## Current trust boundaries and limitations

This is still a pre-alpha implementation.

- **Only protected execution paths are protected.** If a framework or application also gives the model an unwrapped alternate tool, raw provider client, shell, browser, or credential path, Agent Authority cannot intercept that bypass.
- Task Lease state is currently process-local.
- Derived-value extraction is trusted to the host/tool mapping. The receipt + selector are recorded, but v0.5 does not cryptographically prove that a value came from a provider response.
- Bindings currently target top-level semantic request-context fields.
- Approved authority deltas are surfaced but not automatically applied to a running lease.
- A derivation conflict is detected after the authorized source tool returns; for mutating source tools that means the source effect may already have happened. Prefer derivation mappings on authoritative reads unless the adapter has stronger transactional semantics.
- Production OAuth onboarding, OS keychain/KMS/HSM storage, remote authenticated deployment, and production approval UX are not complete.

We document these gaps instead of marketing them away.

## Validate it yourself

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
npm run demo:task-lease
npm run demo:vercel-ai
npm run demo:live-github
```

See [the validation guide](docs/validation.md) for what each layer proves and does not prove.

## Contributing

The highest-value contribution answers this question in another real stack:

> **Can the agent complete the intended task while being technically unable to reuse the same connected account for an unrelated effect?**

We especially want:

- framework integrations around `protectTools()`;
- trustworthy provider/tool output -> authority-fact mappings;
- adversarial tests for authority expansion and provenance substitution;
- cross-service Task Lease examples;
- simple persistence and extraction-verification designs.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare**.

**Keep your agent. Keep your tools. Bound the task.**

</div>
