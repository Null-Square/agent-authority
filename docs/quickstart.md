# Fresh-install quickstart

This quickstart is for a developer who wants to understand Agent Authority before connecting an account or learning Mission/Task Lease internals.

It uses the real public task-first API and the reviewed GitHub issue-number authority extractor from the published npm package. The first provider callback is a local provider-shaped fixture, so **no GitHub token, OAuth setup, repository checkout, or custom extractor is required**.

## 1. Create a blank project

```bash
mkdir agent-authority-quickstart
cd agent-authority-quickstart
npm init -y
npm install @nullsquare/agent-authority
```

Requires Node.js 20+.

## 2. Get the credential-free fixture quickstart

Download or copy `examples/quickstart.mjs` from this repository into the blank project as `quickstart.mjs`.

For example on macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart.mjs -o quickstart.mjs
```

The file imports only published package exports:

```js
import { createTask } from '@nullsquare/agent-authority/task';
import { AuthorityApprovalRequiredError } from '@nullsquare/agent-authority/guard';
import { githubIssueListSelectedNumberAuthorityExtractor } from '@nullsquare/agent-authority/providers/github';
```

## 3. Run it

```bash
node quickstart.mjs
```

Expected shape:

```text
ALLOW -> task discovered issue #42 and the exact comment effect ran
STEP-UP -> The task established authority for 42 but this action requested 7.
PASS -> useful task work ran; unrelated standing permission did not become task authority
```

## What happened

The task starts with authority over one repository and one task-selection marker:

```text
repository + marker
      |
      v
authorized issue discovery
      |
      v
reviewed extractor + execution evidence
      |
      v
issue #42 becomes downstream task authority
      |
      +--> comment on #42 -> ALLOW
      +--> comment on #7  -> STEP-UP before callback
```

The important point is not the fixture itself. It is that the callback which represents the provider effect executes for the task-derived issue and does **not** execute for the unrelated issue even though the Mission-level GitHub permission includes `issue.comment`.

The quickstart counts callbacks and fails if the unrelated effect executes.

## 4. Next step: call real GitHub with no credential

The second quickstart uses the same published package in the same blank project, but the callback now makes a real network request to GitHub's public API.

```bash
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart-github-live.mjs -o quickstart-github-live.mjs
node quickstart-github-live.mjs
```

Default behavior:

```text
Standing GitHub permission -> repo.read
Task authority -> Null-Square/agent-authority
GitHub mode -> public API; no credential required
ALLOW -> real GitHub returned Null-Square/agent-authority
STEP-UP -> The task established authority for "Null-Square/agent-authority" but this action requested "octocat/Hello-World".
PASS -> broader standing repo.read permission could not reach an unrelated repository for this task
```

This example deliberately models the **standing capability as broader than the task**. Mission-level `github:repo.read` is allowed without a repository constraint. The Task authority root then binds `repo.read` to exactly `Null-Square/agent-authority`.

The allowed request performs one real `fetch()` to GitHub. The unrelated repository request reaches the Task authority check, becomes `authority_delta_required`, and does not execute a second `fetch()`.

You can inspect another public repository by passing it as the first argument:

```bash
node quickstart-github-live.mjs owner/repository
```

An optional `GITHUB_TOKEN` may be supplied for authenticated GitHub API access, but no token is required for the default public-repository path.

## Replace the fixture with your provider call

The first quickstart's discovery callback is the only intentionally fake provider piece:

```js
const discovery = await task.run(request, async () => {
  return providerShapedOutput;
});
```

In an application, keep the Agent Authority request and replace the callback with the SDK/provider call you already use. For the built-in GitHub extractor, use the normalized output produced by the Agent Authority GitHub adapter. If your provider/output shape is different, use a reviewed extractor for that mapping rather than trusting arbitrary model-selected values.

The live GitHub quickstart shows the even simpler direct-boundary case: an application can put its existing `fetch()` or SDK call inside `task.run()` while Task authority remains narrower than the standing account/app capability.

## Evidence boundaries

The credential-free fixture is an **adoption quickstart**, not a live-provider security proof. The live GitHub quickstart is a real-provider onboarding proof, but it is read-only and uses a public repository by default.

Separate repository evidence already covers:

- a real GitHub issue discovery -> exact issue comment mutation through the task-first API;
- Gmail sender -> Calendar attendee authority;
- SDK, MCP and broker transport invariance;
- durable local Task Lease recovery/session behavior;
- adversarial execution-evidence tests.

The public Gmail -> Calendar GitHub Actions proof remains separately gated on repository Google OAuth secrets. Authenticated/private-repository onboarding and production OAuth/KMS UX also remain separate product work.

## Automated fresh-install gates

`.github/workflows/verify-quickstart.yml` repeats the fixture developer path in a blank temporary project:

1. resolve the latest public `@nullsquare/agent-authority` version from npm;
2. create a new empty npm project;
3. install only that registry package;
4. copy the quickstart file;
5. confirm the optional AI SDK was not installed;
6. run `node quickstart.mjs`.

`.github/workflows/verify-live-quickstart.yml` repeats the real-provider path from another blank Node 20 project and requires exactly one live GitHub request before the unrelated repository is blocked.

Both gates have passed against `@nullsquare/agent-authority@0.4.6`. They catch documentation/example drift against the actually published package. They do **not** substitute for timing a first-time external developer, so the roadmap's under-10-minute human adoption gate remains open until that evidence exists.
