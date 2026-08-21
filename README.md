<div align="center">

![Agent Authority — mission-scoped authorization for AI agents](docs/assets/agent-authority-cover.svg)

# Agent Authority

### A protocol-neutral authority layer for AI agent actions

**Give an agent a bounded human-approved mission. Enforce it immediately before side effects—through SDKs, MCP, brokered credentials, or harness middleware.**

[Validate in 5 minutes](docs/validation.md) · [Integration contract](docs/integration-contract.md) · [CLI](docs/cli.md) · [Architecture](docs/architecture.md) · [Harness integration](docs/harness-integration.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: public pre-alpha / v0.3 validation milestone.** Core mission policy, receipts, local persistence, agent-instance authentication, one-time approvals, mutation idempotency, credential isolation, a protocol-neutral `guard.run()` API, harness action grants, GitHub brokered execution, and an MCP v2 policy gateway are implemented and covered by CI. Production OAuth onboarding, OS keychain backends, remote authenticated deployment, and additional provider adapters remain future work.

</div>

## What problem it solves

Existing authentication answers questions such as **who is the user?**, **which application has a token?**, and **which provider scopes were granted?** Agent Authority adds a different decision immediately before an agent-originated side effect:

> **Is this specific agent allowed to perform this specific action, on this specific resource, for this human-approved mission, right now?**

The authority decision is independent of how the service was authenticated.

```text
Human / organization
        |
        | mission
        v
+----------------------------+
|       Agent Authority      |
| policy / approval / audit  |
+-------------+--------------+
              |
      ALLOW / DENY / APPROVAL
              |
       existing execution path
              |
   SDK | MCP | OAuth | CLI | API
              |
              v
         external service
```

Agent Authority is **not another agent harness**, **not an OAuth replacement**, and **not an MCP product**. MCP is one integration transport around the same authority engine.

## Validate in 5 minutes

Requirements: Node.js 20+.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm test
```

### Fastest protocol-neutral demo

The smallest integration wraps an existing side effect:

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createAuthorityGuard } from '@nullsquare/agent-authority/guard';

const guard = createAuthorityGuard({ mission, runtime: new AuthorityRuntime() });

const { output, receipt } = await guard.run({
  service: 'github',
  action: 'repo.read',
  context: { repository: 'Null-Square/agent-authority' }
}, () => github.repos.get({ owner: 'Null-Square', repo: 'agent-authority' }));
```

If the mission returns `DENY` or `REQUIRE_APPROVAL`, the callback is never invoked.

Run the included public-data demo:

```bash
npm run demo:guard
```

Then prove resource scoping by requesting another repository:

```bash
npm run demo:guard -- someone/other-repo
```

The second command is blocked before its GitHub fetch callback executes.

### MCP host demo

The repository also includes a small validation MCP upstream and Agent Authority proxy:

```bash
agent-authority setup --principal user:local
npm run demo:mcp-upstream
```

In another terminal:

```bash
agent-authority mcp proxy \
  --upstream http://127.0.0.1:8791/mcp \
  --mission examples/missions/web-validation.json \
  --service mcp:validation
```

The official MCP v2 client integration test verifies that only the mission-authorized read-only tool can reach upstream. See [the complete validation guide](docs/validation.md).

## Three integration modes

### 1. In-process guard

Best when an application already owns its SDK/API connection:

```text
agent code -> guard.run() -> existing SDK
```

The host keeps its credential. Agent Authority controls whether the callback may execute.

### 2. MCP gateway

Best when a host already talks MCP:

```text
ChatGPT / Claude / Codex / OpenClaw / IDE
                 |
                 v
        Agent Authority MCP
                 |
                 v
          existing MCP server
```

### 3. Brokered execution

Best when the agent should not receive or own the provider credential:

```text
agent -> Agent Authority -> encrypted credential broker -> provider
```

All three use the same mission evaluator and receipt model. See [Integration contract](docs/integration-contract.md).

## Mission-scoped authority

```json
{
  "version": "0.1",
  "mission_id": "mission:fix-agent-authority",
  "principal": { "id": "user:local" },
  "agent": { "id": "agent:codex:session-42", "harness": "codex" },
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
    "expires_at": "2026-08-21T22:00:00Z"
  }
}
```

Every sensitive request resolves to:

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

The important invariant is simple: **the side effect cannot occur before authority is granted, and the request evaluated must be the request executed.**

## Connect once

The first native brokered provider is GitHub. The current developer onboarding flow reads the token from stdin so it does not appear in shell history:

```bash
printf %s "$GITHUB_TOKEN" | agent-authority connect github --token-stdin
agent-authority connections
```

The credential is encrypted in the local Agent Authority vault and is never returned to the model. Browser/device OAuth remains a future onboarding milestone.

## Local authority home

By default:

```text
~/.agent-authority/
  config.json
  missions/
  state/
    connections.json
    revocations.json
    usage.json
    approvals.json
    idempotency.json
  vault/
    master.key
    agent-auth.key
    secrets.enc.json
  receipts/
```

Override with `AGENT_AUTHORITY_HOME` or `--home`.

The encrypted-file vault is a local pre-alpha backend; OS keychain/KMS/HSM/enterprise vault backends are future production options.

## Implemented now

- mission validation and deterministic policy evaluation
- explicit deny precedence
- wildcard action scopes
- resource/context constraints
- expiry and cumulative mission budgets
- delegation depth and child-authority attenuation
- durable mission revocation
- action receipts and request hashes
- agent-instance signed bearer tokens for the local sidecar
- one-time approvals bound to the exact mission + request
- mutation idempotency and conservative uncertain-state handling
- protocol-neutral `guard.run()` enforcement for ordinary SDK/API calls
- signed harness action grants bound to exact mission + request
- MCP v2 read-only mission gateway and loopback proxy
- persistent connection metadata
- AES-256-GCM local encrypted secret store
- GitHub brokered execution without exposing its token to the agent
- safe reconnect cleanup for replaced provider credentials
- CLI: setup, doctor, status, connections, serve, connect/disconnect GitHub, mission validate/evaluate, approvals, agent tokens, MCP proxy
- Node 20/22 CI, coverage, package checks, and CodeQL

## Security principles

1. Mission before credential.
2. No side effect before an authority decision.
3. The request evaluated must be the request executed.
4. Deny wins.
5. Authority may shrink during delegation, never expand.
6. Resource constraints matter as much as provider scopes.
7. Human approval is a policy outcome, not an afterthought.
8. Mutation retries must not silently duplicate side effects.
9. Revocation and budgets survive daemon restarts.
10. Authentication protocols and transports remain replaceable adapters.
11. Long-lived provider secrets must not enter model context through Agent Authority.
12. Security gaps are documented rather than hidden.

See [SECURITY.md](SECURITY.md).

## What we are deliberately not building yet

To keep the project useful and small, the current validation phase is **not** trying to become:

- a new agent harness,
- an OAuth replacement,
- an MCP replacement,
- a connector marketplace,
- an enterprise dashboard,
- a custom identity protocol.

The project will expand only where real integrations show the authority boundary needs more capability.

## Contributing

We want agent-framework authors, security engineers, OAuth/OIDC implementers, MCP maintainers, SDK/tool authors, cloud IAM specialists, and developers who can challenge the abstraction.

The most valuable contributions right now are integrations that prove this invariant in another stack:

> An unauthorized agent-originated side effect cannot reach the provider, while an authorized one can, using the stack's existing authentication and execution machinery.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare** for the agentic internet.

**Agent Authority is a protocol-neutral policy enforcement layer for agent actions.**

</div>
