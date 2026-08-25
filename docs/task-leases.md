# Task Leases and Derived Authority

Agent Authority's product thesis is:

> Give an agent a task, not standing account permissions.

A **Task Lease** is a temporary enforcement context around an existing Mission. The Mission remains the authority ceiling. The lease can only narrow that authority as the task operates on explicit or discovered resources.

## Why Task Leases exist

A human task often does not contain every resource identifier the agent will need.

Example:

> Handle the demo request in this email thread.

At task start the runtime may know only the Gmail thread ID. During authorized execution it can discover the sender email. That sender may then become the only attendee the task is allowed to use when creating a Calendar event.

Task Leases provide **task-bounded autonomy** instead of choosing between broad standing permission and approval on every tool call.

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
        +--> exact output evidence
        |
        v
 reviewed extractor
        |
        v
  derived facts
        |
 typed task bindings
        |
        v
      effect
```

## Authority roots

A root is a value explicitly trusted at task entry.

Examples:

- `gmail.thread = thread:91`
- `github.repository = acme/app`
- `invoice.id = INV-2026-18`
- `allowed_channels = [general, random]`

Roots do not need a prior execution receipt because they enter through the task's trusted boundary.

## Derived facts

A derived fact is learned while performing the task, for example a sender email, issue number, order ID, payment ID or payment amount.

A derived fact must remain in the same Task Lease lineage and descend from existing task authority.

There are two derivation modes:

- `derive()` — compatibility path where a trusted host supplies the value and selector;
- `deriveFromEvidence()` — preferred strict path where the caller does **not** supply the authority value.

For authority-relevant provider data, prefer `deriveFromEvidence()` or the task-first `task.authorityFrom()` facade.

## Execution evidence

An allowed guarded effect returns:

```js
{
  output,
  receipt,
  evidence
}
```

Execution evidence binds Mission/Task Lease identity, service/action, request hash, ALLOW receipt identity/hash and a hash of the exact returned output.

If downstream code changes the output while reusing the original evidence, strict derivation fails.

This is an integrity mechanism inside the trusted runtime/adapter boundary. It is not remote-provider cryptographic attestation.

## Reviewed extractors

A reviewed extractor identifies which normalized provider-output selector may become authority. It returns an extractor ID and selector, not the authority value.

Task Lease verifies the evidence and resolves the selector itself. That blocks the ordinary substitution pattern:

```text
provider-shaped output says customer@example.com
caller claims attacker@example.com
caller tries to reuse original ALLOW evidence
```

The strict path rejects the mismatch because the caller never gets to choose the derived fact value.

## Bindings and typed relations

A binding narrows an otherwise Mission-permitted action using an authority fact.

The Community Preview supports only three relations:

```text
exact   request == established fact
oneOf   request is one member of an established finite set
max     numeric request <= established numeric ceiling
```

`exact` is the default, so old bindings remain valid.

### Exact

```js
{
  service: 'calendar',
  action: 'event.create',
  context_field: 'attendee_email',
  fact_id: 'fact:requester-email'
}
```

If the fact is `customer@example.com`, that attendee can proceed. Another attendee becomes `authority_delta_required`.

### oneOf

```js
{
  service: 'slack',
  action: 'add_user_to_channel',
  context_field: 'channel',
  fact_id: 'fact:allowed-channels',
  relation: 'oneOf'
}
```

If `fact:allowed-channels` contains `['general', 'random']`, only those two concrete channel values match. Another channel requires authority expansion.

`oneOf` was added because the pinned AgentDojo Slack task `user_task_11` exposed exactly this finite-set requirement. We chose a narrow relation instead of a wildcard or general expression language.

### max

```js
{
  service: 'payments',
  action: 'refund.create',
  context_field: 'amount_minor',
  fact_id: 'fact:payment-amount',
  relation: 'max'
}
```

If the evidence-derived payment amount is `12500`, a refund request for `5000` or `12500` is inside that per-effect ceiling; `15000` requires authority expansion.

`max` is **not cumulative accounting**. If multiple mutations are possible, provider/application business state and idempotency remain authoritative for aggregate totals.

### Fail-closed behavior

- unknown relation names are rejected;
- an unresolved fact denies the action;
- missing bound context denies the action;
- invalid relation/fact shapes deny the action;
- a valid but out-of-relation value becomes `authority_delta_required`;
- blocked/step-up requests do not execute the guarded callback.

## Non-amplification rule

A Task Lease is not a second permission system that can create new action classes.

The Mission is evaluated first:

```text
Mission says DENY
      |
      v
Task Lease cannot override it
```

Core invariant:

```text
Task Lease authority <= Mission authority
```

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

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });

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

`deriveFromEvidence()` has no `value` parameter. The Task Lease resolves the fact from the exact evidence-bound output.

## Task completion and expiry

```js
lease.complete('demo request handled');
```

After completion, guarded actions return `task_lease_completed` even if the underlying provider credential still exists.

A lease may also have its own `expires_at`, independent of provider credential expiry.

## Authority delta

When an otherwise permitted action requests a value outside a binding relation, Agent Authority returns a step-up signal:

```text
established task authority
        +
requested out-of-relation value
        |
        v
authority_delta_required
```

The delta records the service, action, context field, relation, requested value and current authority fact ID.

Automatic safe application of an approved delta back into a live durable task remains future work. The current implementation stops at the safe enforcement signal.

## Durable local recovery

Task Lease state is no longer limited to in-memory proof. The repository includes authenticated local persistence/recovery with:

- exact Mission-hash binding;
- principal/agent validation;
- authority fact graph/lineage validation;
- binding persistence including typed relations;
- durable completion and expiry;
- local stale-writer compare-and-swap protection;
- per-lease locking and refresh before security-critical evaluation.

Old snapshots that predate the relation field recover their bindings as `exact`.

This is a trusted-local-host reference implementation, not distributed consensus or a transaction spanning arbitrary remote provider effects.

## Current security properties

The test/evidence suite covers:

- Mission ceiling and explicit deny precedence;
- unresolved facts fail closed;
- same-Mission / same-Task-Lease derivation lineage;
- strict output/evidence integrity;
- replay, tampering and cross-lease substitution rejection;
- exact / oneOf / max binding behavior;
- blocked effects executing zero callbacks;
- durable relation recovery and backward-compatible exact snapshots;
- completion and expiry;
- provider extractor operation/selector validation;
- live GitHub read/mutation boundaries;
- transport invariance across demonstrated SDK/MCP/broker paths.

See `docs/evidence.md` for the current executable evidence inventory.

## Current limitations

1. **Trusted adapter/host boundary:** current evidence is not cryptographic remote-provider attestation.
2. **Bypass paths:** an agent with a separate provider credential/path can bypass Agent Authority.
3. **Source invalidation:** changes to source resources do not automatically revoke already-derived facts.
4. **Step-up application:** approved deltas are not yet automatically applied to a live durable task.
5. **Remote-effect coupling:** arbitrary provider effect + local Task Lease state are not one crash-atomic distributed transaction.
6. **Relation vocabulary:** only `exact`, `oneOf`, and `max` exist; unsupported workflow shapes should fail visibly rather than trigger a general policy DSL.
7. **Cumulative state:** `max` is a per-effect ceiling, not a budget/accounting ledger.
8. **Provider semantics:** every provider integration still needs reviewed operation-to-resource mappings/extractors.

The project should extend these boundaries from real workflow or benchmark evidence rather than speculative authorization machinery.
