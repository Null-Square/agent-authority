# v0.4.7 connected-execution candidate

This candidate closes a concrete adoption gap between the task-first API and the existing credential broker/provider runtime.

## Candidate changes

- `task.execute(request)` executes through an `ExecutingAuthorityRuntime` while preserving the current Task Lease as the narrowest authority object.
- connected deny/step-up outcomes use the same public error classes as `task.run()`.
- successful connected execution returns sanitized provider output, receipt and execution evidence that can feed `task.authorityFrom()`.
- `@nullsquare/agent-authority/runtime-env` exposes the existing local encrypted runtime composition for developer onboarding.
- a sole active provider account can be resolved when requests omit `account_id`; multiple active accounts remain ambiguous and fail closed.
- default disconnect can remove that sole connection without requiring the caller to know an auto-detected provider account ID.
- the connected GitHub quickstart proves the local encrypted vault + credential broker + live provider path without copying credentials into task/model context.

## Security boundary

This does not create a GitHub token, OAuth flow, GitHub App, KMS, or new identity format. Provider-side least privilege still comes from GitHub. Agent Authority adds a task boundary underneath that connected account authority.

The local encrypted vault remains a trusted-local-host developer reference backend.

## Release gate

Before version publication:

- unit/adversarial tests must prove credential isolation and zero provider execution on task authority delta;
- packed consumer must import and execute the new public surfaces;
- live connected GitHub workflow must pass through the encrypted local runtime;
- Node 20/22, coverage, AI SDK, existing live GitHub proofs and CodeQL must remain green;
- registry verification must be performed after npm publication before the public release marker is updated.
