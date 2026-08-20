# Agent Harness Integration

Agent Authority is designed to work with many agent runtimes without requiring the model provider to adopt a new protocol first.

## Recommended boundary

```text
LLM / planner
     |
     v
Agent harness
     |
     | proposed tool action
     v
Agent Authority
     |
     +--> deny
     +--> require human approval
     |
     +--> allow
            |
            v
      credential adapter
            |
            v
          tool/service
```

The authority runtime should ideally execute **outside the model context** so a prompt-injected or compromised agent cannot simply rewrite its own permissions.

## 1. Tool middleware

For a custom agent harness, wrap each sensitive tool:

```js
const decision = authority.evaluate(mission, {
  service: 'github',
  action: 'repo.write',
  context: { repository: 'Null-Square/example' }
});

if (decision.result.decision === 'deny') throw new Error(decision.result.reason);
if (decision.result.decision === 'require_approval') return requestHumanApproval(decision);
return githubTool.execute(args);
```

This is the simplest integration and should be our first interoperability target.

## 2. Local sidecar for coding agents

Run `npm start` next to the coding-agent process and call:

- `GET /health`
- `POST /v1/evaluate`
- `POST /v1/prepare`
- `POST /v1/revoke`

A harness can use localhost IPC/HTTP even when it cannot embed the JavaScript library directly.

Good targets for early experiments include coding-agent CLIs, IDE agents, CI agents, desktop agents, and autonomous terminal workflows.

## 3. MCP proxy

```text
MCP client
    |
    v
Agent Authority MCP proxy
    |      |
    |      +--> mission evaluation
    |      +--> approval callback
    |      +--> upstream credential brokerage
    |      +--> receipt
    v
Upstream MCP server
```

The proxy lets existing MCP clients gain mission-scoped controls without requiring every MCP server to understand Agent Authority.

## 4. Connector/plugin platform

Connector providers already know how to call hundreds of SaaS APIs. Agent Authority can wrap those connectors rather than rebuilding every integration.

```text
agent -> authority -> connector adapter -> SaaS
```

This is especially important for OAuth and API-key services: the connector holds or exchanges credentials while the authority layer decides whether the specific mission can invoke the action.

## 5. CLI credential helper

A future helper should support flows conceptually like:

```bash
agent-authority exec \
  --mission mission.json \
  --service github \
  --action repo.write \
  -- git push
```

The helper should expose an ephemeral token/environment only to the child process, not to the LLM prompt or durable agent memory.

## 6. Browser-only legacy applications

For services with no API or usable OAuth integration, the adapter may need an isolated browser/session broker. The preferred model is:

```text
agent -> high-level browser action -> authority -> isolated authenticated browser
```

The agent should not receive raw passwords, long-lived cookies, or unrestricted browser access. This area is high risk and should remain experimental until isolation and anti-exfiltration boundaries are well tested.

## Human approval UX

Approval must be portable across harnesses. A decision should include enough data for terminal, IDE, mobile, or web approval surfaces to explain:

- mission objective
- agent identity
- requested service/action
- resource being affected
- financial or destructive impact
- expiration/delegation context

The human approves the **action under the mission**, not a generic permanent permission.

## Integration acceptance test

A harness integration is successful when the same mission can:

1. allow a safe action,
2. deny a forbidden action,
3. pause for approval,
4. revoke the mission and stop future actions,
5. use a credential mechanism without exposing a permanent root secret to the model.
