# Account Connections: authorize once, reuse across agents

The user experience goal is simple:

> Connect each account once to Agent Authority. Reuse that connection from any authorized agent or harness without handing the agent the long-lived credential.

Agent Authority cannot literally authenticate every internet service with one universal login: GitHub, Google, Microsoft, Slack, AWS, and legacy systems each control their own authorization. The abstraction therefore separates **provider consent** from **agent authority**.

## User setup flow

```text
1. Install / open Agent Authority
            |
            v
2. Create local or cloud Authority identity
            |
            v
3. Connect accounts once
   GitHub  [Connect]
   Google  [Connect]
   Slack   [Connect]
   Cloudflare [Connect]
            |
            v
4. Provider OAuth / credential setup happens once
            |
            v
5. Agent Authority stores only a connection record + vault reference
            |
            v
6. Any approved agent/harness can request actions through Agent Authority
```

Later sessions should not repeat provider login. Reauthorization is needed only when the provider revokes/expires the grant, the user disconnects the account, or the requested action needs scopes that were never granted.

## Runtime flow

```text
Agent / harness
    |
    | service=github, action=repo.read
    v
Agent Authority
    |
    +-- 1. identify principal + agent + mission
    +-- 2. evaluate mission policy
    +-- 3. resolve connected account
    +-- 4. refresh/exchange credential if needed
    +-- 5. execute through provider adapter
    +-- 6. sanitize response
    +-- 7. emit receipt
    v
Agent receives result, not credential
```

The credential broker must live outside model context. A prompt-injected agent should not be able to ask the system to print its GitHub refresh token or Google session cookie because those objects are never tool outputs.

## We do not build every integration from scratch

Coverage is layered.

### 1. Generic auth engines

One implementation can serve many providers:

- OAuth/OIDC Authorization Code + PKCE
- OAuth device flow where appropriate
- API key / PAT vault storage
- cloud STS / workload-identity exchange
- CLI credential helpers
- isolated browser-session brokerage

Providers then supply thin profiles: endpoints, scopes, refresh behavior, account discovery, and capability mappings.

### 2. Native provider adapters

We should build native adapters for strategically important services where security and UX justify direct support, initially GitHub, Google, Cloudflare, and one enterprise identity/cloud platform.

### 3. MCP compatibility

An authority-aware MCP proxy can wrap existing MCP servers. The MCP server keeps using its normal OAuth/authentication mechanism; Agent Authority adds mission policy, approval, delegation and receipts before forwarding the call.

### 4. Connector networks

Existing connector platforms can sit behind an Agent Authority adapter:

```text
agent -> Agent Authority -> connector network -> SaaS API
```

This can provide broad early coverage without making the authority project maintain hundreds of unrelated SaaS SDKs.

## Connection object

A safe connection record contains metadata and a vault reference, never the secret itself:

```json
{
  "connection_id": "connection:...",
  "principal_id": "user:123",
  "service": "github",
  "account_id": "octocat",
  "auth_kind": "oauth",
  "credential_ref": "vault:...",
  "scopes": ["repo", "read:user"],
  "status": "active"
}
```

The model-facing API should omit `credential_ref` as well.

## Scope step-up

A user might initially connect Google with calendar read permission. Months later an agent mission may require Gmail send. The correct behavior is not to grant a giant permanent scope during onboarding.

Instead:

```text
requested capability
      |
      v
existing connection sufficient? -- yes --> continue
      |
      no
      v
request provider scope step-up + human approval
      |
      v
update connection grant
```

This keeps the initial consent small while allowing smooth expansion.

## Mission consent vs provider consent

These are intentionally different events.

**Provider consent**: “Agent Authority may access my GitHub account under these provider scopes.” This is normally done once and reused.

**Mission consent**: “This coding agent may maintain repository X for the next two hours, but may not delete repositories or change billing.” This can be short-lived and task-specific.

The provider connection is durable. The mission authority is bounded.

## Multiple accounts

The same principal may connect multiple accounts or organizations:

```text
github/personal
github/null-square
google/personal
google/work
```

A mission can select an `account_id`, and organization policy can restrict which account a given agent is allowed to use.

## Future protocols

New agent-auth protocols should plug into the connection/credential boundary rather than replacing Mission Manifests. OAuth Rich Authorization Requests can carry fine-grained authorization details, and OAuth Token Exchange already defines delegation/impersonation token exchange primitives. Agent Authority should map to such standards when providers support them rather than inventing incompatible token mechanics.

## Production security requirements

The current in-memory secret store is explicitly development-only. Production versions need:

- encrypted at-rest credentials
- OS keychain, HSM/KMS, or dedicated vault backing
- refresh-token rotation support
- provider revocation handling
- no secret values in logs/receipts/errors
- process/IPC authentication between harness and sidecar
- anti-confused-deputy resource binding
- explicit capability-to-provider-operation mappings
- audit trail for connection creation, scope changes, use, and revocation
