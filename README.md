<div align="center">

![Agent Authority — mission-scoped authorization for AI agents](docs/assets/agent-authority-cover.svg)

# Agent Authority

### A protocol-neutral permission boundary for AI agents

**Give an agent a bounded mission. Keep provider credentials outside the model. Enforce the mission before a tool call leaves the harness.**

[Validate in 5 minutes](docs/validation.md) · [CLI](docs/cli.md) · [Architecture](docs/architecture.md) · [Harness integration](docs/harness-integration.md) · [OpenClaw](docs/openclaw-integration.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: public pre-alpha / executable v0.3 branch.** Mission policy, agent-instance auth, one-time approvals, durable revocation/budgets, credential isolation, idempotency, harness action grants, a GitHub provider boundary, and a read-only MCP policy gateway are implemented. The project is intentionally validating one narrow path before expanding provider coverage.

</div>

## The problem

Authentication tells a service **who** is calling. Agents also need an enforceable answer to:

> **What is this agent allowed to accomplish right now, for this human-approved mission?**

Giving every harness a broad provider token does not answer that question.

Agent Authority separates durable account connection from short-lived agent authority:

```text
Human / organization
        |
        | mission + approval
        v
+---------------------------+
|      Agent Authority      |
| policy / auth / audit     |
+-------------+-------------+
              |
        allow / deny /
      require approval
              |
              v
       tool / provider
```

A mission can restrict service, action, resource, expiry, budget, delegation depth and approval requirements.

## What Agent Authority is not

It is **not** another agent harness, **not** a replacement for OAuth, and **not** an MCP-only product.

MCP is the first high-leverage gateway integration because multiple hosts already speak it. The core authority engine remains independent of transport:

```text
                  Agent Authority
                         |
                 mission decision
                         |
          +--------------+--------------+
          |              |              |
         MCP          native API      harness bridge
          |              |              |
       tools/call      provider        existing connector
```

If the ecosystem changes transport, the mission semantics do not need to change.

## Validate the core idea in 5 minutes

Requirements: Node.js 20+.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
git checkout hardening/product-runtime-v0.3
npm install
npm link

aauth setup --principal user:local
aauth doctor
```

Terminal A — run the tiny validation upstream:

```bash
npm run demo:mcp-upstream
```

Terminal B — put Agent Authority in front of it:

```bash
aauth mcp proxy \
  --upstream http://127.0.0.1:8791/mcp \
  --mission examples/missions/chatgpt-web-validation.json \
  --service mcp:validation-upstream
```

The upstream advertises:

- `github_repo_metadata` — read-only; reads real public GitHub metadata
- `dangerous_demo_write` — harmless fake write tool used to prove blocking

The mission permits only `github_repo_metadata` and only for `Null-Square/agent-authority`.

The gateway must reject an out-of-mission repository and reject the write tool even if a client knows its name. Hiding tools is UX; blocking `tools/call` is the enforcement boundary.

See the complete [validation guide](docs/validation.md).

## MCP host / ChatGPT validation

The gateway binds loopback only in v0.3. Do not expose it unauthenticated to the public internet.

For hosted OpenAI products, OpenAI Secure MCP Tunnel can connect a local/private MCP server without a public inbound endpoint. Point the tunnel at:

```text
http://127.0.0.1:8790/mcp
```

Custom MCP availability varies by product plan and rollout. A UI limitation is not a reason to weaken the gateway security model.

## Quick local authority setup

```bash
aauth setup
aauth doctor
aauth status
```

Run the local authority daemon:

```bash
aauth serve
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

The daemon binds loopback by default and `/v1/*` operations require short-lived signed agent-instance bearer tokens.

## Connect once

The first native provider is GitHub. The current developer flow reads the token from stdin so it does not appear in shell history:

```bash
printf %s "$GITHUB_TOKEN" | aauth connect github --token-stdin
aauth connections
```

The credential is encrypted in the local Agent Authority vault and is not returned to the model. Browser/device onboarding remains a later UX milestone; it is not required to validate the authority layer.

## Mission example

```json
{
  "version": "0.1",
  "mission_id": "mission:fix-agent-authority",
  "principal": { "id": "user:local" },
  "agent": { "id": "agent:codex:session-42" },
  "objective": "Fix the approved issue in Agent Authority",
  "resources": [
    {
      "service": "github",
      "allow": ["repo.read", "repo.contents.read", "repo.contents.write", "pull_request.create"],
      "deny": ["repo.delete", "billing.*"],
      "constraints": {
        "repository": ["Null-Square/agent-authority"]
      }
    }
  ],
  "constraints": {
    "max_delegation_depth": 1,
    "expires_at": "2026-08-20T22:00:00Z"
  }
}
```

Evaluate locally:

```bash
aauth mission validate mission.json
aauth mission evaluate mission.json \
  --service github \
  --action repo.read \
  --repository Null-Square/agent-authority
```

Every sensitive request resolves to:

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

## Human approval

Policy can return `REQUIRE_APPROVAL`. Approvals are durable, one-time and bound to the exact mission + request fingerprint:

```bash
aauth approvals list --status pending
aauth approvals approve approval:...
aauth approvals deny approval:...
```

A request cannot be modified after approval and reuse of a consumed approval is rejected.

## Agent-instance authentication

The daemon does not trust localhost by itself. Issue short-lived agent credentials:

```bash
aauth agent token \
  --agent agent:codex:session-42 \
  --mission mission:fix-agent-authority \
  --ttl 1h
```

Tokens bind principal, agent, capabilities, expiry and optionally mission ID.

## Two execution modes

Agent Authority supports two useful trust models.

### Broker mode

```text
Agent
  -> Agent Authority
       -> encrypted provider connection
            -> service
```

Agent Authority performs the authorized provider action without exposing the long-lived credential to the model.

### Harness-governance mode

```text
Agent
  -> Agent Authority decision / signed action grant
       -> trusted harness middleware
            -> harness-owned connector
```

This is useful when a platform already owns OAuth credentials that cannot and should not be exported to Agent Authority.

## Implemented now

- mission validation and policy evaluation
- explicit deny precedence and resource/context constraints
- expiry, cumulative budgets and delegation attenuation
- durable mission revocation
- receipts
- short-lived signed agent-instance authentication
- durable one-time human approvals
- mutation idempotency ledger
- persistent connection metadata
- AES-256-GCM local encrypted secret store
- GitHub authenticated execution without returning credentials to the model
- signed harness action grants
- read-only MCP policy gateway using the official MCP v2 SDK
- MCP `tools/list` and enforced `tools/call` path
- canonical web-validation mission and real public-GitHub validation upstream
- JavaScript SDK and CLI
- adversarial tests, CI and CodeQL

## Current validation target

Before expanding providers, v0.4 should prove one thing well:

```text
ChatGPT / another MCP host
        |
        v
 Agent Authority
        |
   SAME MISSION
        |
        v
 authorized upstream tool
```

And the same core mission evaluator should remain usable from non-MCP integrations.

We are deliberately **not** building a dashboard, connector marketplace, custom authentication protocol, enterprise control plane or dozens of provider adapters during this validation phase.

## Security principles

1. Mission before credential.
2. The model does not receive long-lived provider secrets.
3. Deny wins.
4. Authority may shrink during delegation, never expand.
5. Resource constraints matter as much as service scopes.
6. Approval is bound to the exact action.
7. Revocation and budgets survive daemon restarts.
8. Side-effecting retries require idempotency protection.
9. Transport protocols remain replaceable adapters.
10. Security gaps are documented rather than hidden.

Do **not** put passwords, refresh tokens, cookies, API keys, customer secrets or production credentials in missions, issues, logs or pull requests. See [SECURITY.md](SECURITY.md).

## Contributing

We want security reviewers, agent-harness authors, MCP maintainers, OAuth/OIDC engineers and developers who can make the abstraction smaller or prove where it fails.

If you can bypass an authority decision, broaden a mission without permission, replay an approval, duplicate a side effect or leak a credential, that is a valuable bug report.

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare** for the agentic internet.

</div>
