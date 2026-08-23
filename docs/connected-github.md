# Connected GitHub quickstart

This path is for a developer who has already understood the credential-free quickstart and now wants Agent Authority to execute through an authenticated GitHub connection.

The product boundary is:

```text
GitHub token
   |
   v
Agent Authority encrypted local vault
   |
   v
CredentialBroker
   |
   v
GitHub provider adapter
   |
   v
task.execute(request)
```

The token is not placed in the task request, Mission, Task Lease, receipt, execution evidence, or public connection listing.

## 1. Create a project

```bash
mkdir agent-authority-connected
cd agent-authority-connected
npm init -y
npm install @nullsquare/agent-authority
```

Requires Node.js 20+.

## 2. Initialize the local Agent Authority home

```bash
npx agent-authority setup
```

By default this creates `~/.agent-authority`. Provider secrets are stored in the local encrypted vault, whose files are restricted to the local user. This is a trusted-local-host developer reference backend, not a hostile-host or production KMS boundary.

## 3. Connect GitHub without putting the token on the command line

Use a GitHub token that has only the provider permissions your application actually needs.

```bash
printf %s "$GITHUB_TOKEN" | npx agent-authority connect github --token-stdin
```

The CLI verifies ordinary user/PAT credentials against GitHub before storing them. The token is accepted only on stdin and is written into the encrypted Agent Authority vault rather than task/model context.

For CI installation tokens that do not support the `/user` verification endpoint, `--no-verify` is available for an already-trusted token source:

```bash
printf %s "$GITHUB_TOKEN" | npx agent-authority connect github --token-stdin --no-verify
```

Do not use `--no-verify` merely to bypass a failed or unknown credential.

GitHub recommends fine-grained personal access tokens with minimum repository/permission scope for user-scoped access, and GitHub Apps for long-lived organization integrations. Agent Authority does not replace those provider-side controls; it adds a narrower task boundary on top of them.

## 4. Run the connected task

Copy `examples/quickstart-github-connected.mjs` into the project, or run the repository example from a checkout.

The relevant application surface is intentionally small:

```js
import { createTask } from '@nullsquare/agent-authority/task';
import { createRuntimeEnvironment } from '@nullsquare/agent-authority/runtime-env';

const env = createRuntimeEnvironment();

const task = createTask({
  principal: env.config.principal_id,
  agent: 'agent:assistant',
  request: 'Inspect only acme/private',
  permissions: {
    github: {
      allow: ['repo.read'],
      constraints: {}
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: 'acme/private' }
  },
  bindings: [
    { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
  ],
  runtime: env.runtime
});

const result = await task.execute({
  service: 'github',
  action: 'repo.read',
  context: { repository: 'acme/private' }
});
```

Use `task.run(request, callback)` when your application owns the provider SDK call. Use `task.execute(request)` when Agent Authority's connected provider runtime should own credential resolution and provider execution.

## Standing permission vs task authority

The example deliberately leaves Mission-level `github:repo.read` broad while binding the Task Lease to one repository:

```text
connected GitHub account can read repositories
            |
            v
Mission permits github:repo.read
            |
            v
Task authority = acme/private
            |
            +--> acme/private -> ALLOW -> provider executes
            |
            +--> acme/other   -> STEP-UP -> provider does not execute
```

That is the product value: provider/IAM permission can remain broader than the exact task without becoming ambient agent authority.

## Multiple GitHub accounts

If there is exactly one active GitHub connection for the principal, requests that omit `account_id` resolve that sole connection. If multiple active GitHub accounts exist, Agent Authority does not guess: set `request.account_id` explicitly. Ambiguity fails closed.

## Automated proof

`.github/workflows/verify-connected-github.yml` installs the packed package into a blank Node 20 project, initializes a fresh Agent Authority home, connects the workflow's GitHub installation token through stdin, and runs the connected task against the live GitHub API.

The gate also checks that:

- the public connection listing does not contain `credential_ref` or the token;
- the raw token does not appear in plaintext under `AGENT_AUTHORITY_HOME`;
- an encrypted vault file is created;
- the unrelated repository is stopped by the Task Lease before connected provider execution;
- ordinary test/coverage/CodeQL/live-provider gates remain separate and must still pass.

The automated workflow uses the repository's GitHub Actions installation token on the current repository. That proves the authenticated brokered execution path; it does **not** claim public CI access to an unrelated private repository. A user-supplied fine-grained PAT or GitHub App token can use the same path for repositories that credential is permitted to access.
