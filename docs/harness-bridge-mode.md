# Harness-Managed Connector Mode

Agent Authority supports two complementary execution modes.

## 1. Brokered execution

Agent Authority owns the provider connection and executes the provider request itself.

```text
agent -> Agent Authority -> provider adapter -> provider
```

The agent never sees the long-lived provider credential.

This is the preferred mode when Agent Authority can safely own or exchange the credential.

## 2. Harness-managed connector execution

Some agent platforms already own provider authentication internally and do not expose their OAuth tokens to plugins or models. Examples include hosted agent products, IDE connectors, enterprise harnesses, and ChatGPT-style connected apps.

In that environment the boundary becomes:

```text
model / planner
     |
     | proposes exact action
     v
Agent Authority
     |
     | signed short-lived Action Grant
     v
trusted harness connector middleware
     |
     | verifies grant + exact request hash
     v
platform-managed connector
     |
     v
provider
```

Agent Authority does **not** need the provider secret in this mode.

The harness must be trusted to enforce the grant. The model should not be able to bypass the connector middleware and invoke the privileged connector directly.

## Action Grant

`issueHarnessActionGrant()` creates a short-lived signed token containing only authority metadata and a hash of the exact operation:

- principal ID
- agent ID
- mission ID
- service
- action
- exact request fingerprint
- issued-at time
- expiration time
- grant ID

The raw provider credential is never present in the grant.

Default integrations should keep grants very short-lived (for example 15-30 seconds). The implementation rejects TTL values greater than five minutes.

## Exact-request binding

A grant for:

```text
github.repo.read
repository = Null-Square/agent-authority
```

must not authorize:

```text
github.repo.read
repository = Null-Square/another-repository
```

Changing any request field changes the request fingerprint and verification fails.

The same applies to mission, principal and agent substitution.

## Recommended connector wrapper

A harness integration should place grant verification in trusted middleware immediately before its platform-managed connector:

```js
import { createHarnessConnectorGate } from '@nullsquare/agent-authority/harness-bridge';

const gate = createHarnessConnectorGate({ key: trustedGrantVerificationKey });

async function githubConnector(args, authorityContext) {
  gate.verify({
    grant: authorityContext.grant,
    mission: authorityContext.mission,
    request: authorityContext.request
  });

  return platformGitHubConnector(args);
}
```

Do not perform verification inside the LLM prompt, model tool description, or other model-controlled context.

## Hosted-harness proof of concept

A hosted harness can therefore use Agent Authority even if it cannot export its internal OAuth tokens:

```text
ChatGPT / OpenClaw / IDE / enterprise agent
              |
              v
       Agent Authority policy
              |
              v
        signed Action Grant
              |
              v
     harness-owned connector
```

This mode is intentionally provider-neutral. The same authority runtime can govern a GitHub connector, Gmail connector, Drive connector, Calendar connector, CRM connector or any future platform connector, provided the harness exposes a trustworthy interception point before execution.

## Security requirements

A production harness bridge should also implement:

1. one-time grant consumption or a connector-side replay ledger for mutations;
2. idempotency for side-effecting operations;
3. result receipts posted back to the authority audit ledger;
4. independent harness identity binding;
5. provider/account/resource normalization before request hashing;
6. connector middleware that cannot be bypassed by the model.

Harness mode is not a weaker policy model; it is a different credential-ownership model.
