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

In v0.4, a derived fact must reference an `ALLOW` receipt from the same mission. It may also reference existing parent facts.

### Binding

A binding narrows an otherwise permitted action to the exact value held by an authority fact.

```js
{
  service: 'calendar',
  action: 'event.create',
  context_field: 'attendee',
  fact_id: 'fact:requester-email'
}
```

If `fact:requester-email` has not been established, the action is denied.

If it has value `customer@example.com`, this request can proceed:

```js
{
  service: 'calendar',
  action: 'event.create',
  context: { attendee: 'customer@example.com' }
}
```

This request does not proceed automatically:

```js
{
  service: 'calendar',
  action: 'event.create',
  context: { attendee: 'other@example.com' }
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

## Example

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';

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
      context_field: 'attendee',
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
  context: { thread: 'thread:demo-91' }
}, () => gmail.readThread('thread:demo-91'));

lease.derive({
  fact_id: 'fact:sender-email',
  kind: 'email.address',
  value: read.output.sender,
  from: ['fact:thread'],
  receipt: read.receipt,
  selector: 'output.sender'
});

await guard.run({
  service: 'calendar',
  action: 'event.create',
  context: { attendee: read.output.sender }
}, () => calendar.createEvent({ attendee: read.output.sender }));
```

Run the self-contained example:

```bash
npm run demo:task-lease
```

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

The existing approval store can handle the human decision. Automatically applying approved deltas to a live Task Lease is a later milestone; v0.4 deliberately stops at the safe enforcement signal.

## Current security properties

The v0.4 implementation tests that:

- a bound action cannot run before its fact exists;
- derived facts require an `ALLOW` receipt;
- the receipt must belong to the same mission;
- explicit mission denies cannot be overridden by lease bindings;
- an exact derived resource can execute;
- a different resource becomes an authority delta and the effect does not run;
- completed and expired leases stop execution;
- Task Lease receipts include the lease ID and lease hash.

## Current limitations

This is still a validation implementation.

1. **Extraction trust:** the trusted host/adapter supplies the derived value and selector. Agent Authority records lineage but does not yet cryptographically prove that the selected output field contained that value.
2. **In-memory lease state:** TaskLease instances are currently process-local. Durable lease persistence/recovery is not implemented yet.
3. **Top-level binding fields:** v0.4 binds top-level request context fields only. Nested JSON-path policy is intentionally deferred.
4. **Step-up application:** authority deltas are surfaced but approved deltas are not yet automatically applied back into the lease.
5. **Adapter semantics:** providers still need trustworthy mappings from an external operation to `service`, `action`, and resource context fields.

These constraints are deliberate. The next work should be driven by real integrations rather than by adding a general policy language.

## Validation target

The product thesis is validated when the same Task Lease can safely govern a real multi-step workflow across more than one execution transport, for example:

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
