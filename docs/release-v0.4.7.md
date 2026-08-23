# v0.4.7 connected execution

v0.4.7 closes a concrete adoption gap between the task-first API and the existing credential broker/provider runtime.

## What shipped

- `task.execute(request)` executes through an `ExecutingAuthorityRuntime` while preserving the current Task Lease as the narrowest authority object.
- connected deny/step-up outcomes use the same public error classes as `task.run()`.
- successful connected execution returns sanitized provider output, receipt and execution evidence that can feed `task.authorityFrom()`.
- `@nullsquare/agent-authority/runtime-env` exposes the existing local encrypted runtime composition for developer onboarding.
- a sole active provider account can be resolved when requests omit `account_id`; multiple active accounts remain ambiguous and fail closed.
- default disconnect can remove that sole connection without requiring the caller to know an auto-detected provider account ID.
- the connected GitHub quickstart proves the local encrypted vault + credential broker + live provider path without copying credentials into task/model context.
- the CLI version is now derived from `package.json` instead of a stale hard-coded constant.

## Security boundary

This release does not create a GitHub token, OAuth flow, GitHub App, KMS, or new identity format. Provider-side least privilege still comes from GitHub. Agent Authority adds a task boundary underneath that connected account authority.

The local encrypted vault remains a trusted-local-host developer reference backend.

## Release evidence

The exact v0.4.7 candidate passed:

- Node 20 and Node 22 test lanes;
- coverage;
- packed-package consumer smoke;
- connected-execution packed consumer smoke;
- Vercel AI SDK integration;
- live GitHub read proof;
- live evidence-derived GitHub mutation proof;
- encrypted connected-GitHub onboarding proof;
- CodeQL.

After merge, the independent `Verify npm registry` workflow resolved version `0.4.7`, confirmed it was visible on npm, installed that exact registry artifact into a fresh Node 20 consumer, confirmed the optional AI SDK was absent, and successfully ran both the ordinary public package smoke and the connected-execution smoke.

That registry proof is the basis for marking v0.4.7 published.
