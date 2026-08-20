<div align="center">

# Agent Authority

### Mission-scoped authorization for AI agents

**One human-approved mission. Any agent harness. Old and new authentication systems. Bounded authority, human approvals, delegation controls, and auditable action receipts.**

[Architecture](docs/architecture.md) · [Harness integration](docs/harness-integration.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> **Status: early public architecture + executable MVP.** We are building this in public and actively welcome protocol, security, identity, MCP, OAuth, agent-runtime, connector, and UX contributions.

</div>

## Why Agent Authority exists

AI agents increasingly need to work across GitHub, Google, Slack, Cloudflare, CRMs, cloud providers, MCP servers, CLIs, internal systems, and browser-only legacy applications.

Today the user is repeatedly forced to become the authentication bridge:

```text
agent needs GitHub      -> gh auth / OAuth
agent needs Google      -> browser consent
agent needs Cloudflare  -> API token
agent needs old ERP     -> password/browser session
agent needs MCP tool    -> another authorization flow
```

Agent Authority changes the abstraction.

Instead of giving an agent broad credentials, a human authorizes a bounded **mission**. The authority runtime evaluates each requested action and returns one of:

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

Only after the action is authorized does the runtime select the credential or transport adapter required by the underlying service.

```text
Human intent
    |
    v
+----------------------+
| Mission Manifest     |
| who / why / limits   |
+----------+-----------+
           |
           v
+----------------------+
| Authority Runtime    |
| policy + delegation  |
+----------+-----------+
           |
           v
+----------------------+
| Adapter Layer        |
| OAuth | MCP | API    |
| key   | CLI | legacy |
+----------+-----------+
           |
           v
 GitHub / Google / Cloudflare / SaaS / internal tools / future protocols
```

## The core idea

Authentication answers:

> **Who is this actor?**

Agent Authority additionally answers:

> **Who authorized this agent, for what objective, with which limits, for how long, with what delegation rights, and which actions must return to a human?**

The central object is a **Mission Manifest**, not a permanent API key.

```json
{
  "version": "0.1",
  "mission_id": "mission:deploy-nullsquare",
  "principal": { "id": "user:example" },
  "agent": { "id": "agent:coding:session-42", "harness": "local" },
  "objective": "Deploy the approved release",
  "resources": [
    {
      "service": "github",
      "allow": ["repo.read", "repo.write", "pull_request.*"],
      "deny": ["repo.delete", "billing.*"]
    },
    {
      "service": "cloudflare",
      "allow": ["workers.read", "workers.deploy"],
      "deny": ["account.delete", "billing.*"]
    }
  ],
  "constraints": {
    "max_delegation_depth": 2,
    "expires_at": "2026-08-20T22:00:00Z"
  },
  "approvals": [
    {
      "match": { "service": "cloudflare", "action": "dns.change" },
      "required": true
    }
  ]
}
```

## What makes this different

Agent Authority is **not an OAuth replacement** and **not an MCP competitor**. It is intended to sit above authentication mechanisms and normalize *authority* across them.

| Layer | Responsibility |
|---|---|
| Human / organization | Defines objective and approves authority |
| **Agent Authority** | Mission, policy, delegation, approvals, receipts |
| Identity/auth standards | OAuth, OIDC, MCP auth, workload identity, future agent auth |
| Credential adapters | token exchange, vault reference, temporary CLI env, browser session |
| Service | GitHub, Google, Cloudflare, internal API, legacy SaaS |

A future authentication protocol should become another adapter rather than forcing the mission model to be rewritten.

## Quick start

Requirements: Node.js 20+.

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm test
npm run demo
```

Run the local authority sidecar:

```bash
npm start
curl http://127.0.0.1:8787/health
```

## Harness integration

Agent Authority is intentionally harness-neutral. It can sit in several places:

1. **SDK/tool middleware** — evaluate an action before a tool executor runs it.
2. **Local sidecar** — run beside Codex-like, Claude-Code-like, Cursor-like, IDE, CI, desktop, or custom agents.
3. **MCP authorization proxy** — place an authority-aware proxy between an MCP client and upstream MCP servers.
4. **Connector/plugin wrapper** — wrap existing SaaS connectors so permission checks occur before credential use.
5. **CLI credential helper** — planned ephemeral credential injection for commands such as `git`, cloud CLIs, and deployment tools.

See [Harness Integration](docs/harness-integration.md).

## Legacy + future compatibility

The internet will remain heterogeneous. The mission model should stay stable while adapters evolve.

| System type | Adapter strategy |
|---|---|
| OAuth/OIDC | token exchange / short-lived access token |
| MCP | OAuth/MCP-aware adapter or proxy |
| API key | vault-held key + brokered request/scoped proxy |
| Cloud IAM | temporary workload/session credential |
| CLI | temporary process environment / credential helper |
| Enterprise SSO | organization identity/policy bridge |
| Browser-only legacy app | isolated authenticated browser/session broker |
| Future agent-auth protocol | native adapter |

## MVP scope

Implemented in the bootstrap:

- mission validation
- allow / deny policies
- explicit deny precedence
- wildcard action scopes
- mission expiry
- delegation-depth limits
- subagent authority attenuation
- mission revocation / kill switch
- budget caps
- human-approval outcomes
- action receipts
- adapter registry
- local HTTP sidecar
- JavaScript SDK
- automated tests

Still to build:

- real OAuth token exchange
- encrypted credential vault
- passkey/biometric approvals
- signed mission manifests
- production MCP proxy
- browser-session isolation
- recursive delegated sub-missions
- enterprise policy sync
- append-only receipt ledger

We prefer explicit gaps over security theater.

## Architecture principles

1. **Mission before credential.**
2. **Agents should not receive root secrets.**
3. **Deny wins.**
4. **Delegated authority can only shrink.**
5. **Human approval is a policy outcome.**
6. **Receipts are first-class.**
7. **Protocol neutral.**
8. **Legacy compatibility matters.**
9. **Local-first testing.**
10. **Open specification and interoperable implementation.**

## We want contributors

This project is public because the permission model between humans and autonomous agents should be inspectable and interoperable.

We especially welcome:

- OAuth/OIDC implementers
- MCP maintainers
- agent framework authors
- security and identity engineers
- cloud IAM specialists
- connector platforms
- browser automation experts
- cryptography reviewers
- policy-engine contributors
- product/UX contributors working on human approval flows

Early criticism is valuable. Open an issue if you think the abstraction is wrong, overlaps a standard, creates a security problem, or can be made simpler.

## Open research questions

- How should mission semantics map to OAuth authorization details?
- Which token format best supports attenuating delegation?
- How should an agent prove its runtime identity?
- How should browser-only legacy services be brokered safely?
- What should a portable capability vocabulary look like?
- How should approval work across terminal, IDE, mobile, and headless agents?
- Can services advertise agent capabilities through a well-known discovery document?

## Security

Do **not** put passwords, refresh tokens, session cookies, API keys, customer data, or production secrets in mission manifests, examples, issues, logs, or pull requests.

See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.

---

<div align="center">

Built in public by **NullSquare** for the agentic internet.

**Keywords:** AI agent authorization · agent authentication · AI agent security · delegated authorization · agent identity · OAuth for AI agents · MCP authorization · Model Context Protocol security · credential broker · coding agent authentication · LLM agent permissions · mission-scoped authorization

</div>
