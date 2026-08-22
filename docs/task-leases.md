# Task Leases and Derived Authority

Agent Authority's current product thesis is simple:

> Give an agent a task, not standing account permissions.

A **Task Lease** is a temporary enforcement context around an existing mission. The mission remains the maximum authority ceiling. The lease can only narrow that authority as the task discovers concrete resources.

## Why this exists

A human request often does not contain every resource identifier the agent will need.

Example:

> Handle the demo request in this email thread.

At task start the runtime may know only the Gmail thread ID. During authorized execution it discovers the sender email. That sender may then become the only attendee the agent is allowed to use when creating a calendar event.

Without a task-aware authority layer, the application usually chooses between two bad options:

1. give the agent broad `calendar.write` / `mail.send` permissions; or
2. ask the human to approve every individual tool call.

Task Leases aim for a third option: **task-bounded autonomy**.

## Core model

```text
Human-approved task
        |
        v
  authority roots
        |
 authorized execution
        |
        +--> ALLOW receipt
        +--> exact output hash evidence
        |
        v
 trusted adapter extractor
        |
        v
  derived facts
        |
 exact action bindings
        |
        v
      effect
```

### Authority root

A value explicitly trusted at task entry.

Examples:

- `gmail.thread = thread:91`
- `github.issue = 42`
- `invoice.id = INV-2026-18`

Roots do not require a prior execution receipt because they come from the task's trusted entry boundary.

### Derived fact

A value learned while performing the task.

Examples:

- sender email discovered from an authorized Gmail thread read;
- customer ID discovered from an authorized support-ticket lookup;
- order ID discovered from an authorized customer lookup.

A derived fact must reference an `ALLOW` receipt from the same Task Lease and at least one parent authority fact.

Agent Authority now exposes two derivation modes:

- `derive()` — compatibility path where the trusted host supplies both `value` and `selector`;
- `deriveFromEvidence()` — stricter path where the host does **not** supply the authority value.

For provider-derived authority, prefer `deriveFromEvidence()`.

### Execution evidence

After an allowed `guard.run()` effect succeeds, the guard returns:

```js
{
  output,
  receipt,
  evidence
}
```

The execution-evidence record binds:

- the receipt ID and receipt hash;
- mission and Task Lease identity;
- service and action;
- request hash;
- a hash of the exact returned output.

If downstream code changes the output and tries to reuse the original evidence, derivation fails with `evidence_output_mismatch`.

This is an integrity mechanism inside the trusted host/runtime boundary. It is **not** provider-signed remote attestation.

### Trusted adapter extractor

The adapter extractor identifies which normalized provider-output field may become authority.

For Gmail, the current extractor accepts only a `gmail:thread.read` receipt and selects:

```text
output.sender_email
```

The extractor returns only an ID and selector. It does not return the authority value.

Task Lease resolves the selector itself after checking the execution evidence. This prevents ordinary host code from doing this:

```text
Gmail returned customer@example.com
host claims attacker@example.com
while reusing the original Gmail receipt
```

The stricter path rejects output/evidence substitution rather than recording the host's claimed value.

### Binding

A binding narrows an otherwise permitted action to the exact value held by an authority fact.

```js
{
  service: 'calendar',
  action: 'event.create',
  context_field: 'attendee_email',
  fact_id: 'fact:requester-email'
}
```

If `fact:requester-email` has not been established, the action is denied.

If it has value `customer@example.com`, this request can proceed:

```js
{
  service: 'calendar',
  action: 'event.create',
  context: { attendee_email: 'customer@example.com' }
}
```

This request does not proceed automatically:

```js
{
  service: 'calendar',
  action: 'event.create',
  context: { attendee_email: 'other@example.com' }
}
```

It returns `REQUIRE_APPROVAL` with `authority_delta_required`.

## Non-amplification rule

A Task Lease is not a second policy engine and cannot grant a new action class.

The existing mission is always evaluated first.

```text
mission says DENY
      |
      v
Task Lease cannot override it
```

The lease can only add restrictions to an action that the mission already allows.

This is the key invariant:

```text
lease authority <= mission authority
```

Authority may stay the same or shrink. It must never grow silently.

## Evidence-verified Gmail -> Calendar example

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

await guard.run({
  service: 'calendar',
  action: 'event.create',
  context: { attendee_email: senderFact.value }
}, () => calendar.createEvent({ attendee: senderFact.value }));
```

Notice that `deriveFromEvidence()` has no `value` argument. The fact value comes from the exact output already bound to the authorized read.

The older `derive()` API remains available for integrations that have not adopted the evidence contract yet. Facts created through that API record `derivation_mode: host-trusted` so audit code can distinguish the weaker path.

## Task completion

Task authority should not outlive the task.

```js
lease.complete('demo request handled');
```

After completion, every guarded action returns `DENY` with `task_lease_completed` even if the underlying OAuth token or provider connection still exists.

A lease may also have its own `expires_at` independent of provider credential expiry.

## Authority delta

When the agent asks to use a concrete value outside an established binding, Agent Authority returns a step-up signal rather than silently broadening the lease.

```text
current task authority
        +
requested new resource
        |
        v
authority_delta_required
```

The existing approval store can handle the human decision. Automatically applying approved deltas to a live Task Lease is a later milestone; the current implementation deliberately stops at the safe enforcement signal.

## Current security properties

The implementation tests that:

- a bound action cannot run before its fact exists;
- derived facts require an `ALLOW` receipt from the same mission and Task Lease;
- explicit mission denies cannot be overridden by lease bindings;
- an exact derived resource can execute;
- a different resource becomes an authority delta and the effect does not run;
- completed and expired leases stop execution;
- Task Lease receipts include the lease ID and lease hash;
- successful guarded effects produce output-bound execution evidence;
- `deriveFromEvidence()` ignores any caller-supplied `value` and resolves the trusted selector itself;
- modified provider output is rejected;
- modified execution evidence is rejected;
- execution evidence cannot be replayed under another receipt or Task Lease;
- the Gmail extractor rejects the wrong service/action;
- dangerous selector paths such as `__proto__` fail closed.

## Current limitations

This is still a validation implementation.

1. **Trusted host/adapter boundary:** execution evidence is produced by Agent Authority around the host effect, not signed by Gmail, Calendar, or another provider. A malicious host that can bypass or replace Agent Authority remains outside the guarantee.
2. **Provider attestation:** output hashes prove consistency with what the guarded effect returned; they do not cryptographically prove what the remote provider emitted on the wire.
3. **Source invalidation:** a source resource changing later does not yet invalidate already-derived facts automatically.
4. **In-memory lease state:** TaskLease instances are currently process-local. Durable lease persistence/recovery is not implemented yet.
5. **Top-level binding fields:** bindings target top-level request context fields. A general nested policy language is intentionally deferred.
6. **Step-up application:** authority deltas are surfaced but approved deltas are not yet automatically applied back into the lease.
7. **Adapter semantics:** each provider still needs a reviewed operation -> authority-field mapping. The Google sender extractor is the first concrete contract.

These constraints are deliberate. The project should improve the evidence contract from real provider cases rather than build a universal semantic policy language.

## Validation target

The longer-term product thesis is validated when the same Task Lease can safely govern a real multi-step workflow across more than one execution transport, for example:

```text
one human task
     |
     +--> ordinary SDK through guard.run()
     |
     +--> MCP tool through Agent Authority gateway
     |
     +--> brokered provider execution

same authority lineage
same non-amplification rule
same completion boundary
```
