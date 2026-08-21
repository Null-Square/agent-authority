# Integration contract

Agent Authority should fit an existing agent stack without becoming its harness, connector catalog, or identity provider.

The core contract is intentionally small:

```text
human task
   |
   v
Task Lease
   |
   v
proposed action
   |
   v
Agent Authority evaluation
   |
   +-- DENY ------------> no side effect
   |
   +-- REQUIRE_APPROVAL -> no side effect until authority expands explicitly
   |
   +-- ALLOW -----------> execute through the host's existing connection
   |
   v
receipt / derived facts / task completion
```

The mission remains the static authority ceiling. The Task Lease is the temporary task boundary developers should normally integrate against.

## Action model

A proposed action is described semantically:

```json
{
  "service": "calendar",
  "action": "event.create",
  "context": {
    "attendee": "customer@example.com"
  }
}
```

A Task Lease may bind that context value to a fact legitimately discovered earlier in the same task.

```text
Gmail thread root
      |
authorized read receipt
      |
derived sender fact
      |
Calendar attendee binding
```

A different attendee is not silently authorized. It becomes an authority delta.

## 1. In-process guard — primary developer path

For an application that already owns its SDK/client connection:

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';

const lease = createTaskLease({ mission, roots, bindings });
const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });

await guard.run({
  service: 'calendar',
  action: 'event.create',
  context: { attendee: 'customer@example.com' }
}, () => calendar.createEvent(...));
```

The callback is never invoked on `DENY` or `REQUIRE_APPROVAL`. The host retains its provider credentials.

This is the clearest adoption path today because it does not require MCP, a daemon, or a new authentication flow.

## 2. MCP gateway — adapter for MCP hosts

For ChatGPT, Claude, Codex, OpenClaw, IDEs, or other MCP-capable hosts:

```text
host -> Agent Authority MCP gateway -> existing MCP server
```

The gateway should enforce the same Task Lease immediately before forwarding `tools/call`. MCP is an adapter, not Agent Authority's core abstraction.

## 3. Brokered execution — credential isolation

When the host should not own the provider credential:

```text
agent -> Agent Authority -> credential broker -> provider
```

Agent Authority resolves the connected account internally and returns only sanitized provider output. The same Task Lease semantics must still apply.

## Conformance invariant

Regardless of transport, an integration is conformant only if:

1. the side effect cannot occur before an `ALLOW` decision or completed step-up;
2. the request evaluated is the request executed;
3. the mission remains the authority ceiling;
4. derived authority is anchored to an `ALLOW` receipt from the same Task Lease and existing parent facts;
5. a different concrete resource cannot silently inherit authority;
6. task completion or expiry stops later task actions;
7. switching transport cannot broaden authority;
8. a receipt can identify the mission, Task Lease, agent, service, action, and request hash.

This invariant is more important than any specific protocol.

## What Agent Authority does not require

Adopting Agent Authority should not require replacing:

- the agent harness;
- OAuth/OIDC;
- MCP;
- provider SDKs;
- existing secret storage;
- an organization's IAM system.

Those systems can remain in place. Agent Authority adds the temporary task-authority decision immediately before an agent-originated side effect.

## Current trust boundary

The v0.4 prototype records provenance for derived facts, including source receipt and selector. The trusted host/adapter still supplies the extracted value. This is an explicit validation-stage trust assumption, not a cryptographic guarantee.
