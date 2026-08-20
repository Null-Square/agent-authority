# Architecture

Agent Authority is a **mission-scoped authority control plane** for AI agents. It sits above authentication mechanisms and below agent intent/tool execution.

## Placement

```text
Human / organization
        |
        | approves mission
        v
Mission Manifest
        |
        v
Authority Runtime  <---- policy / approvals / revocation / receipts
        |
        | only after ALLOW
        v
Credential + transport adapters
OAuth | MCP | API key | cloud IAM | CLI | browser/legacy | future protocols
        |
        v
Services and tools
```

The model or agent should not be trusted with permanent root credentials. The preferred enforcement point is outside the model process: tool middleware, local sidecar, connector wrapper, MCP proxy, or remote control plane.

## Core primitives

### Principal
The human or organization that owns the authority.

### Agent
The runtime identity acting under delegated authority. This may be a coding-agent session, autonomous workflow, subagent, CI job, MCP client, or future workload identity.

### Mission
A durable statement of *why* the agent is acting and the authority granted for that objective.

### Capability
A normalized service/action pair such as `github:repo.write` or `cloudflare:workers.deploy`.

### Constraint
Limits such as expiration, monetary budget, resource boundary, rate, environment, delegation depth, or execution window.

### Approval
A policy outcome requiring the runtime to return to a human before execution.

### Receipt
A tamper-evident record of the mission, requested action, decision, and delegation context. The MVP hashes receipts; signatures and append-only persistence are roadmap items.

## Decision pipeline

1. Validate mission structure.
2. Check mission revocation and expiry.
3. Check delegation depth and contextual constraints.
4. Resolve service/resource policy.
5. Apply explicit deny rules before broad allows.
6. Determine whether human approval is required.
7. Emit an action receipt.
8. Only on `allow`, resolve a credential/transport adapter.
9. Adapter obtains or injects the minimum practical credential for the requested action.
10. Service call occurs outside or behind the authority boundary.

## Why adapters matter

The authority model must not depend on every service adopting a new protocol. Existing OAuth, API-key, CLI, cloud IAM, MCP, enterprise SSO, and browser-session systems can be hidden behind adapters. A future agent-native auth standard should be implemented as another adapter.

This lets the project solve a different problem from authentication itself: **portable bounded authority over heterogeneous authentication systems**.

## Security invariants

- explicit deny overrides allow
- child missions may only attenuate parent authority
- revoked/expired missions fail closed
- root credentials stay outside the mission manifest and model context
- approval is evaluated before credential dispatch
- receipts identify the principal, agent, mission, service, action, and decision
- unknown services/actions fail closed

## Deployment modes

### Embedded middleware
Best when the application controls tool execution.

### Local sidecar
Best for coding agents and developer harnesses. Agent calls a localhost authority API before sensitive operations.

### MCP proxy
Best for MCP-compatible clients. The proxy evaluates mission policy before forwarding tool calls and can broker upstream OAuth.

### Connector platform
Best for a provider with many SaaS integrations. Existing connectors become credential/transport adapters behind the authority layer.

### Hosted enterprise control plane
Best for shared policy, centralized approvals, audit, revocation, compliance, and workload identity.

## What is deliberately not decided yet

- canonical signed mission token format
- universal capability vocabulary
- agent runtime identity standard
- receipt signature/log format
- browser-session isolation design
- how mission semantics map into emerging IETF agent authorization work

These should be validated through implementations and interoperability tests before being frozen into a protocol.
