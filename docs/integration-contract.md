# Integration contract

Agent Authority should fit an existing agent stack without becoming its harness, connector catalog, or identity provider.

The core contract is intentionally small:

```text
proposed action
      |
      v
Agent Authority mission evaluation
      |
      +-- DENY ------------> no side effect
      |
      +-- REQUIRE_APPROVAL -> no side effect until approved
      |
      +-- ALLOW -----------> execute through the host's existing connection
      |
      v
receipt
```

A proposed action is described semantically:

```json
{
  "service": "github",
  "action": "repo.read",
  "context": {
    "repository": "Null-Square/agent-authority"
  }
}
```

The mission remains the authority source. The transport does not.

## 1. In-process guard — smallest integration

For an application that already has an SDK/client connection:

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createAuthorityGuard } from '@nullsquare/agent-authority/guard';

const guard = createAuthorityGuard({ mission, runtime: new AuthorityRuntime() });

const { output, receipt } = await guard.run({
  service: 'stripe',
  action: 'refund.create',
  context: { account: 'acct_123', amount: 2000, currency: 'USD' }
}, () => stripe.refunds.create({ payment_intent: 'pi_123' }));
```

The callback is never invoked on DENY or REQUIRE_APPROVAL. The host retains its provider credentials.

Use this for Node/TypeScript agents, workers, backend services, SDK wrappers, and custom tool runtimes.

## 2. MCP gateway — existing MCP hosts

For ChatGPT, Claude, Codex, OpenClaw, IDEs, or other MCP-capable hosts:

```text
host -> Agent Authority MCP gateway -> existing MCP server
```

The gateway enforces the same mission model before forwarding `tools/call`. MCP is an adapter, not Agent Authority's core abstraction.

## 3. Brokered execution — keep credentials outside the host

When the host should not own the provider credential:

```text
agent -> Agent Authority -> credential broker -> provider
```

Agent Authority resolves the connected account internally and returns only sanitized provider output.

## Integration invariant

Regardless of transport, an integration is conformant only if:

1. the side effect cannot occur before an ALLOW decision (or a completed approval flow),
2. the request evaluated is the request executed,
3. mission/resource constraints cannot be bypassed by switching transport,
4. long-lived credentials are not copied into model context by Agent Authority,
5. a receipt can identify the mission, agent, service, action, and request hash.

This invariant is more important than any specific protocol.

## What Agent Authority does not require

Adopting Agent Authority should not require replacing:

- the agent harness,
- OAuth/OIDC,
- MCP,
- the provider SDK,
- existing secret storage,
- an organization's IAM system.

Those systems can remain in place. Agent Authority adds the bounded human authority decision immediately before an agent-originated side effect.
