# Contributing to Agent Authority

Agent Authority is being developed in public. Contributions are welcome across code, protocol design, security review, documentation, integrations, interoperability testing, and approval UX.

## Start here

1. Read `README.md`, `docs/architecture.md`, and `docs/harness-integration.md`.
2. Search existing issues before opening a new one.
3. Small fixes can go directly to a PR. Architectural changes should begin with an issue describing the competing approaches and security tradeoffs.

## Local setup

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm test
npm run demo
npm start
```

Node.js 20+ is required. The MVP intentionally has no runtime dependencies.

## Contributions we especially want

- OAuth/OIDC token-exchange adapters
- MCP authorization proxy experiments
- cloud temporary-credential adapters
- safe CLI credential injection
- agent-runtime identity proofs
- capability vocabulary proposals
- recursive delegation/attenuation designs
- signed action receipts and verification
- human approval UX
- browser-only legacy compatibility research
- formal threat-model analysis
- integrations with coding-agent and general agent harnesses

## Security rule

Do not hide trust assumptions. If an adapter cannot prevent credential exfiltration, document that limitation rather than presenting it as secure isolation.

Never commit passwords, API keys, OAuth refresh tokens, session cookies, customer data, or private production configuration.

## Pull requests

Please include:

- the problem being solved
- the authority/security boundary affected
- tests for executable behavior
- docs when architecture or behavior changes
- interoperability impact

Run:

```bash
npm run check
```

before opening a PR.

## Protocol proposals

Do not add a new wire format simply because it is elegant. Explain why existing OAuth/OIDC/MCP/workload-identity mechanisms cannot represent the requirement, whether the change belongs in the mission model or adapter layer, how delegation is attenuated, downgrade/confused-deputy risks, legacy compatibility, and how actions are audited.

Disagreement is useful. Critique designs and assumptions, not contributors.
