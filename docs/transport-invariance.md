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

## Executable transport proof

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

## AI SDK harness proof

`test/integrations/ai-sdk.integration.mjs` drives the current Vercel AI SDK `ToolLoopAgent` with the output of `protectAiSdkTools()` as its executable tool set.

The positive path asks the model to use the task-bound GitHub issue. The protected tool executes exactly once.

The same real agent loop then exercises three adversarial paths:

```text
unrelated issue
    -> AuthorityApprovalRequiredError
    -> authority_delta_required
    -> underlying effect count remains 0

executable tool with no Agent Authority mapping
    -> UnmappedAiSdkToolError
    -> ai_sdk_tool_unmapped
    -> underlying effect count remains 0

completed Task Lease
    -> AuthorityDeniedError
    -> task_lease_completed
    -> underlying effect count remains 0
```

The AI SDK represents tool execution failures in the generated result as `tool-error` content parts rather than requiring `agent.generate()` itself to reject. The proof therefore checks both sides of the boundary: the harness records the exact Agent Authority error and the protected underlying side effect never runs.

This matters because the model is not calling the wrapped function directly in these cases. The real `ToolLoopAgent` selects and invokes the tool through its normal tool loop, and the Agent Authority wrapper remains the executable boundary.

## What this proves

- Task-Lease narrowing is not specific to the direct SDK guard;
- MCP cannot silently fall back to Mission-only authority when explicitly configured with a Task Lease;
- brokered provider execution enforces the same Task Lease before credential-backed execution;
- one evidence-derived fact can constrain direct SDK, MCP and brokered execution;
- task completion invalidates the same authority across those execution paths;
- broker credentials may remain connected after task authority disappears;
- a configured Vercel AI SDK `ToolLoopAgent` whose executable tool set is passed through `protectAiSdkTools()` cannot use its normal tool path to bypass Task-Lease narrowing;
- executable AI SDK tools without an Agent Authority request mapping fail closed before their underlying effect executes.

## Boundary of the claim

This is an execution-boundary guarantee, not hostile-host containment.

It does **not** prove that a malicious application host cannot deliberately give the model another unwrapped tool, direct provider credential, shell, network client or other execution channel outside Agent Authority.

It also does not yet prove that:

- Task Lease state survives process restart;
- the same lease can be serialized and safely recovered across separate processes or hosts;
- an approved authority delta is durably applied back into a running lease;
- provider outputs are cryptographically attested by providers.

M4 is complete for configured Agent Authority execution boundaries: direct SDK, MCP, brokered execution and the Vercel AI SDK `ToolLoopAgent` protected-tool path now preserve task authority without silent expansion. Durability, cross-process recovery and hostile-host containment are separate problems.
