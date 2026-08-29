<div align="center">

![Agent Authority](docs/assets/agent-authority-cover-editorial-v2.png)

# Agent Authority

### Give your agent a task, not your account.

**Agent Authority is a task-bounded execution layer for AI agents. It lets an agent use existing provider permissions only for the task the user authorized.**

[Quickstart](docs/quickstart.md) · [Research](RESEARCH.md) · [Reproduce](benchmarks/task-contracts/README.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

> **Community / Developer Preview. Research V1 closed on 2026-08-29.** The software is not production-ready. The research package is preserved for independent reproduction, attack, extension, and paper review.

</div>

## The problem

A user gives an agent a narrow task:

> **Handle this customer email.**

The connected account can still give the application broad standing permission to read many emails, create meetings with anyone, update unrelated records, or send messages to arbitrary recipients.

OAuth and IAM answer:

> Can this application use Calendar?

Agent Authority asks a different question immediately before the effect:

> **Is this exact effect inside the task the user authorized?**

```text
standing provider permission
          |
          v
   human-approved task
          |
          v
 temporary task authority
          |
          +--> useful task actions proceed
          +--> authority can follow resources discovered through authorized work
          +--> unrelated resources step up or deny
          |
          v
   task completes / expires
          |
          v
   task authority disappears
```

The provider credential can continue to exist. The **task authority does not**.

## Research result

The completed research slice tests a stronger question:

> Can dynamic task authority follow resources discovered during authorized execution without turning all observed resources into authority?

The central finding is:

> **Observation provenance is not selection authority.**

If authorized evidence returns several candidates, discovery alone does not prove which candidate the task authorizes. The research prototype adds deterministic **selection witnesses** that bind a later effect to the task's selection predicate over authorized evidence.

### Complete deterministic and provider-boundary evidence

AgentDojo `0.1.35`, benchmark `v1.2.2`, 60 mutation-bearing tasks across Slack, Banking, Workspace, and Travel:

| Measure | Result |
| --- | ---: |
| Reference executions preserved | **60/60** |
| Evidence-consistent counterfactuals accepted | **36/36** |
| Static exact-trace baseline counterfactuals accepted | **1/36** |
| Corrected adversarial mutants blocked | **370/370** |
| Constructible malicious provider-boundary trajectories blocked | **230/230** |
| Unauthorized malicious trajectories reaching the provider | **0** |

The 230 provider-boundary trajectories include field/resource substitution, premature or reordered effects, repeated effects, exact cross-task transplants, and wrong-selector candidates.

### Partial live DeepSeek V4 Pro evidence

The planned 5,088-run live matrix did **not** complete. The repository does not present it as a preregistered primary success.

Attempt 4 corrected the adaptive-attack delivery defect from Attempt 3. It then produced 860 successful DeepSeek V4 Pro trajectories before the paid account returned `402 Insufficient Balance`. All completed Attempt-4 trajectories are from the Slack suite.

For the **372 attacked scenarios that completed in both ungated and gated conditions**:

| Matched attacked result | Ungated | Agent Authority |
| --- | ---: | ---: |
| Scenarios | 372 | 372 |
| Scenarios with at least one unauthorized protected effect | **40** | **0** |
| Unauthorized protected provider effects | **61** | **0** |
| Utility | **84.41%** | **82.26%** |
| Policy rejections | — | **373** |

The matched utility difference is **2.15 percentage points**.

The canonical AgentDojo `tool_knowledge` subset contains 244 matched scenarios. It produced 39 unauthorized protected effects ungated and 0 gated. The authority-adaptive subset contains 128 matched scenarios. It produced 22 out-of-policy protected effects ungated and 0 gated.

These effects are **not all exact attacker-goal completions**. The defensible claim is narrower: under adversarial trajectories, the ungated model produced protected provider effects outside the frozen task authority, and the enforcing runtime prevented those out-of-policy protected effects from succeeding in the matched completed slice.

Attempt 3 remains supplementary evidence. Its adaptive arm failed before model execution because of YAML serialization, but 422 matched canonical attacked scenarios completed. Ungated execution produced 79 unauthorized protected effects across 61 scenarios; gated execution produced 0.

See [RESEARCH.md](RESEARCH.md), [the paper-facing result summary](benchmarks/task-contracts/PAPER_RESULTS_DRAFT.md), and [the attempt log](benchmarks/task-contracts/LIVE_EVAL_ATTEMPTS.md).

## Research evidence preservation

The repository stores permanent machine-readable summaries for Attempts 3 and 4:

```text
benchmarks/task-contracts/artifacts/attempt-3-summary.json
benchmarks/task-contracts/artifacts/attempt-4-summary.json
```

The [artifact manifest](benchmarks/task-contracts/ARTIFACT_MANIFEST.md) records each original GitHub Actions run ID, artifact ID, head SHA, exact SHA-256 digest, archive layout, and interpretation rule. This preserves the identity of the paid evidence even after Actions retention expires.

The original raw ZIPs contained the aggregate result, frozen inputs, and all 48 shard JSON files for each attempt. The repository does **not** claim that those binary ZIP bytes are stored in Git history.

## What the research does and does not establish

**Supported in the evaluated setting:**

- provider effects can be guarded by stateful task authority;
- cardinality, order, correlation, evidence-derived bindings, and selection witnesses block attack classes that independent field allowlists miss;
- a value appearing in authorized output is not enough to authorize it when the task requires a selection among candidates;
- exact successful traces are too narrow to represent the full authorization envelope of a natural-language task;
- a frozen provider-boundary monitor contained all observed policy-unauthorized protected mutations in the completed matched DeepSeek slice.

**Not established:**

- prompt injection is solved;
- the full 5,088-run DeepSeek matrix completed;
- multi-model robustness;
- broad live coverage for Workspace or Travel;
- automatic natural-language task-to-authority compilation;
- formal soundness or minimality of the research grammar;
- protection against all read-only leakage or unsafe natural-language output;
- production multi-tenant security.

## A useful negative result

The research also falsified a tempting design rule:

> A successful reference trace can be copied into an exact authorization policy.

That approach over-constrained legitimate execution. A canonical trace can contain arbitrary formatting, timestamps, or even values that conflict with the user prompt. The next research problem is therefore **semantic authority envelopes**: separate user-required constants from bounded values, evidence-derived values, selection-derived values, and incidental execution choices.

This work is intentionally left as future research. The V1 research slice is closed.

## Install

Requires Node.js 20+.

```bash
npm install @nullsquare/agent-authority
```

The preferred product surface is:

```js
import { createTask } from '@nullsquare/agent-authority/task';
```

## Try it without credentials

From a blank directory:

```bash
npm init -y
npm install @nullsquare/agent-authority
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart.mjs -o quickstart.mjs
node quickstart.mjs
```

Expected behavior:

```text
ALLOW   -> useful task effect runs
STEP-UP -> unrelated resource is outside task authority
PASS    -> blocked request executes zero provider callbacks
```

Then try a public GitHub read without a token:

```bash
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart-github-live.mjs -o quickstart-github-live.mjs
node quickstart-github-live.mjs
```

See [docs/quickstart.md](docs/quickstart.md).

## Task-first API

The product model is deliberately small:

```text
Task -> Effect -> Authority
```

```js
import { createTask } from '@nullsquare/agent-authority/task';

const task = createTask({
  principal: 'user:me',
  agent: 'agent:assistant',
  request: 'Find the issue for this task and comment only on that issue',
  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['issue.close', 'repo.delete'],
      constraints: { repository: ['acme/app'] }
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: 'acme/app' }
  },
  bindings: [{
    service: 'github',
    action: 'issue.list',
    field: 'repository',
    authority: 'repository'
  }]
});

const discovery = await task.run({
  service: 'github',
  action: 'issue.list',
  context: { repository: 'acme/app' }
}, () => github.listIssues());

const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: 'repository',
  extractor: selectedIssueExtractor
});

task.bind({
  service: 'github',
  action: 'issue.comment',
  field: 'issue_number',
  authority: 'issue'
});

await task.run({
  service: 'github',
  action: 'issue.comment',
  context: {
    repository: 'acme/app',
    issue_number: issue.value,
    body: 'Handled.'
  }
}, () => github.comment(issue.value, 'Handled.'));
```

If the agent changes `issue_number` to an unrelated issue, the callback does not run. The runtime produces an authority-delta step-up that can be explained with `task.explain(error)`.

Use `task.run(request, callback)` when your application owns the provider call. Use `task.execute(request)` when Agent Authority owns the connected-provider path and credential resolution stays behind its broker boundary.

## Narrow typed relations

The Community Preview product surface supports three relation shapes:

| Relation | Meaning | Example |
| --- | --- | --- |
| `exact` | request equals the established fact | only issue `42` |
| `oneOf` | request equals one member of a finite established set | channel is `general` or `random` |
| `max` | numeric request is no greater than the established ceiling | refund amount <= payment amount |

Unknown relations fail closed. We deliberately do **not** expose a general policy expression language.

The research prototype under `benchmarks/task-contracts/` explores additional stateful constraints and selection witnesses. Those research mechanisms are **not automatically part of the production package contract**.

## Core invariant

```text
Task Lease authority <= Mission authority
```

A Task Lease can narrow Mission authority. It cannot add an effect type that the Mission does not already allow.

The research refines one point: task-local **resource facts can grow** through authorized evidence while the Mission effect ceiling stays fixed. Do not interpret the invariant as saying that every concrete resource identifier must be known at task start.

## Existing stack, not a replacement stack

Agent Authority sits between agent reasoning and the provider path you already use:

```text
agent reasoning
      |
      v
Agent Authority
      |
      v
existing SDK / MCP / gateway / OAuth / provider
```

The same authority model is demonstrated across direct SDK execution, MCP, connected-provider execution, and a Vercel AI SDK protected-tool path.

## Security boundary

The most important limitation is architectural:

> **Agent Authority cannot secure a provider path it does not control.**

If the model can reach the same provider through another credential, shell, network tool, or unguarded connector, that path can bypass Agent Authority.

Other limits include no cryptographic remote-provider attestation, no trusted natural-language authority compiler, no production OAuth/KMS lifecycle, no hardened remote multi-tenant deployment, and no claim that provider-effect containment equals complete prompt-injection prevention.

Read [SECURITY.md](SECURITY.md).

## Reproduce the research

The research workflow is now manual and offline. It does not call paid model APIs.

Start with:

```bash
python -m pip install -r benchmarks/agentdojo/requirements.txt
```

Then follow [benchmarks/task-contracts/README.md](benchmarks/task-contracts/README.md).

The archived live workflow remains in the repository only as provenance. It executes zero model API calls.

## Validate the package

```bash
npm install
npm run check
```

The product package and research closure are separate. npm publication is not required to reproduce the research results.

## Community handoff

The V1 research slice is closed from the original project side. Community work is welcome in four directions:

1. reproduce or challenge the reported deterministic/provider-boundary results;
2. attack the authority boundary and report bypasses;
3. formalize the selection-witness model and non-amplification properties;
4. extend evaluation to semantic authority envelopes, held-out tasks, more models, and stronger baselines.

Please do not rerun the historical paid matrix merely to obtain the missing rows. A useful continuation should add new scientific value, not only spend more API budget.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](ROADMAP.md).

## Citation

Citation metadata is in [CITATION.cff](CITATION.cff). The research paper is in preparation. Until a paper identifier exists, cite the repository, the exact commit, and the research artifact manifest used for your result.

## License

Apache-2.0.
