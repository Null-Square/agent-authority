# Task Lease transport invariance

Agent Authority treats SDK calls, MCP calls and brokered provider execution as execution paths, not separate authority models.

The property under test is:

```text
same Task Lease + same established authority fact
                     |
          +----------+----------+
          |          |          |
       direct       MCP      brokered
       guard.run()  gateway   provider
          |          |          |
          +----------+----------+
                     |
              same authority
```

Changing the transport must not broaden task authority.

## Executable proof

`test/transport-invariance.test.js` creates one Task Lease and one derived authority fact.

The fact is first established from a brokered provider result using the strict evidence path:

```text
Task Lease root
    |
    v
brokered item.discover
    |
    +--> Task-Lease ALLOW receipt
    +--> exact output hash evidence
    |
    v
reviewed test extractor
    |
    v
deriveFromEvidence()
    |
    v
fact:selected-item = alpha
```

That exact Task Lease and fact are then used through three execution paths:

1. ordinary in-process `guard.run()`;
2. `MissionMcpGateway` configured with the Task Lease;
3. `ExecutingAuthorityRuntime.executeTaskLease()` with a brokered provider adapter.

For `item = alpha`, every path allows execution.

For `item = beta`, every path returns the same task-level authority delta:

```text
authority_delta_required
```

The blocked direct callback, MCP upstream call and brokered provider operation all remain unexecuted.

After the Task Lease is completed, all three paths return:

```text
task_lease_completed
```

Again, no blocked execution reaches the host callback or provider boundary.

## Broker behavior

`ExecutingAuthorityRuntime.executeTaskLease()` evaluates the Task Lease before adapter readiness or provider execution.

A lease-level `require_approval` result is returned as-is. Brokered execution does not consume a mission-level one-time approval to bypass the narrower Task Lease. Applying an explicitly approved authority delta back into a live Task Lease is separate roadmap work.

Successful brokered Task Lease execution returns execution evidence bound to the Task-Lease receipt and exact provider output, so strict derived authority can originate from brokered execution as well as from `guard.run()`.

## MCP behavior

`MissionMcpGateway` remains backward-compatible with Mission-only use, but now accepts exactly one authority source:

```text
mission OR lease
```

When configured with a Task Lease, each tool call is evaluated through that lease before `upstream.callTool()` can run.

MCP result metadata includes:

```text
io.nullsquare.agent-authority/decision
io.nullsquare.agent-authority/code
io.nullsquare.agent-authority/receipt_hash
io.nullsquare.agent-authority/task_lease_id
```

The remote MCP handler and loopback proxy can pass the same Task Lease into the gateway.

## What this proves

- Task-Lease narrowing is no longer specific to the direct SDK guard;
- MCP cannot silently fall back to Mission-only authority when explicitly configured with a Task Lease;
- brokered provider execution can enforce the same Task Lease before credential-backed execution;
- one derived fact can constrain all three execution paths;
- task completion invalidates the same authority across all three paths;
- broker credentials may remain connected after task authority disappears.

## What this does not prove yet

- a hostile harness cannot bypass Agent Authority through an entirely separate unguarded tool path;
- Task Lease state survives process restart;
- the same lease is serialized and recovered across separate processes or hosts;
- an approved authority delta is durably applied back into a running lease;
- provider outputs are cryptographically attested by providers.

The remaining M4 target is at least one real harness/tool-middleware integration where executable tool calls cannot bypass the Task Lease boundary.
