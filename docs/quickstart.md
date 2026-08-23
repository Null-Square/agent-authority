# Fresh-install quickstart

This quickstart is for a developer who wants to understand Agent Authority before connecting an account or learning Mission/Task Lease internals.

It uses the real public task-first API and the reviewed GitHub issue-number authority extractor from the published npm package. The provider callback is a local provider-shaped fixture, so **no GitHub token, OAuth setup, repository checkout, or custom extractor is required**.

## 1. Create a blank project

```bash
mkdir agent-authority-quickstart
cd agent-authority-quickstart
npm init -y
npm install @nullsquare/agent-authority
```

Requires Node.js 20+.

## 2. Get the quickstart file

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

## Replace the fixture with your provider call

The discovery callback is the only intentionally fake provider piece:

```js
const discovery = await task.run(request, async () => {
  return providerShapedOutput;
});
```

In an application, keep the Agent Authority request and replace the callback with the SDK/provider call you already use. For the built-in GitHub extractor, use the normalized output produced by the Agent Authority GitHub adapter. If your provider/output shape is different, use a reviewed extractor for that mapping rather than trusting arbitrary model-selected values.

## What this quickstart does not prove

This is an **adoption quickstart**, not a live-provider security proof. It intentionally avoids credentials so a new developer can see the model first.

Separate repository evidence already covers:

- a real GitHub issue discovery -> exact issue comment mutation through the task-first API;
- Gmail sender -> Calendar attendee authority;
- SDK, MCP and broker transport invariance;
- durable local Task Lease recovery/session behavior;
- adversarial execution-evidence tests.

The public Gmail -> Calendar GitHub Actions proof remains separately gated on repository Google OAuth secrets.

## Automated fresh-install gate

`.github/workflows/verify-quickstart.yml` repeats the same developer path in a blank temporary project:

1. resolve the latest public `@nullsquare/agent-authority` version from npm;
2. create a new empty npm project;
3. install only that registry package;
4. copy the quickstart file;
5. confirm the optional AI SDK was not installed;
6. run `node quickstart.mjs`.

This catches documentation/example drift against the actually published package. It does **not** substitute for timing a first-time external developer, so the roadmap's under-10-minute human adoption gate remains open until that evidence exists.
