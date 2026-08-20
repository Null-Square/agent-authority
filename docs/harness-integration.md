# Agent Harness Integration

Agent Authority is designed to work with many agent runtimes without requiring the model provider to adopt a new protocol first.

## Where Agent Authority sits

Agent Authority is **not a model provider and not an agent harness**. It is an authority/control plane between an agent's proposed sensitive action and the system that can actually perform that action.

```text
User
  |
  | connect accounts once + approve missions
  v
Agent Authority Wallet / Control Plane
  |
  +----------------------+----------------------+
  |                      |                      |
Codex                 Claude Code            OpenClaw
  |                      |                      |
  +----------- proposed tool/action -----------+
                         |
                         v
                 Agent Authority Runtime
                 policy / approval / audit
                         |
                allow / deny / approve
                         |
                         v
                  Connection Fabric
            OAuth | MCP | API | CLI | browser
                         |
                         v
                    External service
```

The **default integration** should be a local sidecar or hosted control-plane API. This makes Agent Authority usable by almost any harness without requiring the harness author to redesign their runtime.

When a harness exposes a trusted pre-tool execution hook, a native plugin can provide a stronger integration by routing all sensitive tool calls through Agent Authority automatically. The authority semantics remain the same in both modes.

### Integration modes

1. **Universal sidecar/API — default.** Any agent or harness calls Agent Authority before sensitive actions. Lowest adoption friction.
2. **Native harness/plugin middleware — preferred when available.** A trusted plugin intercepts tool actions before execution and sends them through Agent Authority. Harder for an agent to bypass accidentally.
3. **MCP authority proxy.** Existing MCP clients and servers work through an authority-aware proxy without every server adopting the mission format.
4. **CLI credential helper.** Commands receive temporary credentials only inside the authorized child process.
5. **Hosted authority service.** Multiple machines and agents share the same user/org connection wallet, policy, approval and audit layer.

A harness should not need to become "an Agent Authority harness." It should merely know how to ask Agent Authority to authorize/execute a sensitive action.

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
return authority.execute(mission, request);
```

The preferred production form is `authority.execute(...)`: the provider credential remains inside Agent Authority rather than being returned to the agent process.

## 2. Local sidecar for coding agents

Run `npm start` next to the coding-agent process and call:

- `GET /health`
- `GET /v1/connections`
- `POST /v1/evaluate`
- `POST /v1/prepare`
- `POST /v1/execute`
- `POST /v1/revoke`

A harness can use localhost IPC/HTTP even when it cannot embed the JavaScript library directly.

Good targets for early experiments include Codex, Claude Code, Cursor, IDE agents, CI agents, desktop agents, and autonomous terminal workflows.

## 3. OpenClaw

OpenClaw should integrate with Agent Authority **around tools, not by replacing OpenClaw's agent harness**.

OpenClaw defines an agent harness as the low-level executor for a prepared agent turn. Its native Codex harness, for example, owns Codex-native thread execution while OpenClaw continues to own channels, visible transcript state, tool policy and approvals. Agent Authority solves a different problem: whether a tool/service action is authorized under a human-approved mission.

Recommended OpenClaw topology:

```text
OpenClaw
  |
  | Codex / Claude / ACP / embedded runtime
  v
proposed sensitive tool call
  |
  v
Agent Authority plugin or sidecar
  |
  +--> deny
  +--> require approval
  +--> execute through connected account
  |
  v
GitHub / Google / Cloudflare / MCP / other service
```

Two practical OpenClaw integration paths:

### A. Sidecar first

An OpenClaw tool/plugin calls the local Agent Authority HTTP API. This requires the least coupling and lets us ship immediately.

### B. Trusted native plugin later

Where OpenClaw exposes a suitable pre-execution tool/policy seam, a trusted Agent Authority plugin should automatically wrap sensitive tools. The plugin should still delegate policy, connections, credentials, receipts and revocation to the external Agent Authority control plane rather than duplicating them inside OpenClaw.

OpenClaw can also run external coding harnesses through ACP. Agent Authority should remain outside those harnesses as the common service-authority layer so a Codex ACP session and a Claude Code ACP session can reuse the same connected accounts and mission semantics.

Important distinction: **model-provider login and service authorization are separate concerns.** OpenClaw/Codex/Claude may still need their own model/subscription authentication. Agent Authority's first target is the GitHub/Google/Cloudflare/SaaS/cloud credentials that agents use to perform work. Provider-model authentication can be bridged later where safe and useful.

## 4. MCP proxy

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

## 5. Connector/plugin platform

Connector providers already know how to call hundreds of SaaS APIs. Agent Authority can wrap those connectors rather than rebuilding every integration.

```text
agent -> authority -> connector adapter -> SaaS
```

This is especially important for OAuth and API-key services: the connector holds or exchanges credentials while the authority layer decides whether the specific mission can invoke the action.

## 6. CLI credential helper

A future helper should support flows conceptually like:

```bash
agent-authority exec \
  --mission mission.json \
  --service github \
  --action repo.write \
  -- git push
```

The helper should expose an ephemeral token/environment only to the child process, not to the LLM prompt or durable agent memory.

## 7. Browser-only legacy applications

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
5. use a credential mechanism without exposing a permanent root secret to the model,
6. move between at least two harnesses without reconnecting the user's provider account.
