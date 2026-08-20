<div align="center">

![Agent Authority — mission-scoped authorization for AI agents](docs/assets/agent-authority-cover.svg)

# Agent Authority

### The permission and credential control plane for AI agents

**Connect accounts once. Give each agent a bounded mission. Keep long-lived credentials outside the model.**

[CLI](docs/cli.md) · [Architecture](docs/architecture.md) · [Harness integration](docs/harness-integration.md) · [OpenClaw](docs/openclaw-integration.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: public pre-alpha / executable v0.2.** The policy runtime, persistent local authority home, encrypted local vault, GitHub provider boundary, CLI, sidecar API, delegation controls and receipts are implemented. Browser OAuth, additional native providers, production keychain backends and MCP proxying are still under active development.

</div>

## Why Agent Authority

AI agents increasingly need GitHub, Google, Slack, Cloudflare, AWS, CRMs, MCP servers, CLIs and legacy applications. Today each harness tends to repeat authentication or receive broad credentials directly.

Agent Authority separates **account connection** from **agent permission**:

```text
Human connects GitHub once
        |
        v
Agent Authority connection vault
        |
        +---- Codex mission A
        +---- Claude Code mission B
        +---- OpenClaw mission C
        +---- custom/MCP agent mission D
```

The account connection can persist for months. A mission can last minutes or hours and can restrict service, action, resource, budget, delegation depth and approval requirements.

## Where it sits

Agent Authority is **not another agent harness** and **not a replacement for OAuth or MCP**.

```text
Human / organization
        |
        | missions + approvals
        v
+---------------------------+
|      Agent Authority      |
| policy / vault / audit    |
+-------------+-------------+
              ^
              | authority API / SDK / plugin
   +----------+----------+
   |          |          |
 Codex   Claude Code   OpenClaw / other agents
   |          |          |
   +----------+----------+
              |
              v
      credential adapters
 OAuth | MCP | API key | cloud IAM | CLI | browser
              |
              v
 GitHub / Google / Cloudflare / AWS / SaaS / legacy
```

The universal baseline is a local sidecar/API. Native plugins are ergonomic integrations, not architectural requirements.

## Quick start

Requirements: Node.js 20+.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm link

agent-authority setup
agent-authority doctor
agent-authority status
```

Run the local authority daemon:

```bash
agent-authority serve
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

The daemon binds to loopback by default.

## Connect once

The first native provider is GitHub. The current safe developer onboarding flow reads the token from stdin so it does not appear in shell history:

```bash
printf %s "$GITHUB_TOKEN" | agent-authority connect github --token-stdin
agent-authority connections
```

The credential is encrypted in the local Agent Authority vault and is not returned to agents. Browser/device OAuth is the next onboarding milestone so the final UX becomes simply:

```text
agent-authority connect github
→ browser/device consent
→ connected
```

See [CLI and configuration](docs/cli.md).

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
  vault/
    master.key
    secrets.enc.json
  receipts/
```

Override with `AGENT_AUTHORITY_HOME` or `--home`.

Secrets are not written to `config.json`, mission files, receipts or connection listings. The current encrypted-file vault is a local pre-alpha backend; OS keychain/KMS/HSM/enterprise vault backends are planned for production deployments.

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
    "expires_at": "2026-08-20T22:00:00Z"
  }
}
```

Validate or evaluate locally:

```bash
agent-authority mission validate mission.json
agent-authority mission evaluate mission.json \
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

Only an allowed action reaches a credential/provider adapter.

## Implemented now

- mission validation and policy evaluation
- explicit deny precedence
- wildcard action scopes
- resource/context constraints
- expiry
- cumulative mission budgets
- delegation depth and child-authority attenuation
- durable mission revocation
- action receipts
- persistent connection metadata
- AES-256-GCM local encrypted secret store
- durable usage state
- CLI: setup, doctor, status, connections, serve, connect/disconnect GitHub, mission validate/evaluate
- local HTTP sidecar
- JavaScript SDK
- strict GitHub REST action mapping
- GitHub authenticated execution without returning the token to the model
- OpenClaw/tool-wrapper integration example
- automated tests and CI

## Next production milestones

1. **Browser/device OAuth onboarding** — GitHub first, then a reusable OAuth/OIDC engine for Google/Microsoft/Slack.
2. **Pluggable secure key stores** — macOS Keychain, Windows Credential Manager/DPAPI, Linux Secret Service, remote KMS/HSM/vault.
3. **Authenticated local transport** — bind agent instances to the authority daemon instead of trusting any localhost process.
4. **Human approval service** — terminal first, then web/mobile/passkey approval.
5. **MCP authority proxy** — make existing MCP servers authority-aware without rewriting each server.
6. **Provider capability registry** — normalized capabilities plus provider-specific mappings.
7. **Append-only receipt/audit store** and signed mission/receipt experiments.
8. **Installer, releases and upgrade channel** for npm/binaries.
9. **Threat-model hardening** for prompt injection, confused deputy, credential exfiltration and cross-agent attacks.

See [ROADMAP.md](ROADMAP.md).

## Harness integration

The preferred boundary is outside the model process:

```text
LLM / planner
     |
agent harness
     |
proposed action
     v
Agent Authority
  |      |       |
 DENY  APPROVE  ALLOW
                 |
           provider adapter
                 |
              service
```

Integrations can use:

- HTTP sidecar
- JavaScript SDK
- native harness/plugin wrapper
- MCP proxy
- CLI credential helper
- connector-platform adapter

See [Harness Integration](docs/harness-integration.md).

## Security principles

1. Mission before credential.
2. Agents do not receive long-lived provider secrets.
3. Deny wins.
4. Authority may shrink during delegation, never expand.
5. Resource constraints matter as much as service scopes.
6. Approval is a policy outcome, not an afterthought.
7. Revocation and budgets survive daemon restarts.
8. Receipts are first-class.
9. Authentication protocols remain replaceable adapters.
10. Explicit security gaps are documented rather than hidden.

Do **not** put passwords, refresh tokens, cookies, API keys, customer secrets or production credentials in missions, issues, logs or pull requests. See [SECURITY.md](SECURITY.md).

## Contributing

We want protocol reviewers, OAuth/OIDC implementers, MCP maintainers, agent framework authors, security engineers, cloud IAM specialists, connector platforms, browser isolation experts, cryptography reviewers and UX contributors.

If you think the abstraction overlaps an existing standard, creates a security failure or can be made smaller, please open an issue. Early criticism is useful.

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare** for the agentic internet.

**Keywords:** AI agent authorization · agent authentication · AI agent security · delegated authorization · agent identity · OAuth for AI agents · MCP authorization · Model Context Protocol security · credential broker · coding agent authentication · LLM agent permissions · mission-scoped authorization · agent permission system

</div>
