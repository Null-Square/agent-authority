# v0.4.8 — coding task authority lineage

v0.4.8 extends the task-first product proof from issue-scoped actions to a complete self-contained coding-agent workflow:

```text
selected issue
    |
    v
exact base branch
    |
    v
evidence-derived base commit SHA
    |
    v
one planned task branch
    |
    v
provider-confirmed task branch
    |
    v
one exact changed file
    |
    v
provider-confirmed changed path
    |
    v
one draft pull request
```

Merge and deployment remain outside task authority.

## Provider additions

The GitHub adapter now supports:

- `git.ref.read`
- `git.ref.create`

Repository paths, Git branch names and full Git SHAs are validated before provider I/O. Unsafe traversal-like paths and malformed refs fail closed.

The release adds reviewed authority extractors for:

- the exact branch returned by an authorized `git.ref.create`;
- the exact path returned by an authorized `repo.contents.write`.

The existing reviewed extractors establish the selected issue, base commit SHA and created pull-request number.

## Coding proof

`test/task-product-coding.test.js` proves the brokered execution chain. Branch creation is impossible until both the selected issue and exact base SHA have been established. File writes are then bound to the provider-confirmed task branch and one target path. Pull-request creation is bound to that branch, the base branch, issue and provider-confirmed changed path.

Adversarial cases prove zero additional provider calls for:

- writing directly to the base branch;
- changing an unrelated file;
- opening a PR from an unrelated head branch;
- attempting `pull_request.merge`;
- reusing task authority after completion.

All three mutations — branch creation, file write and PR creation — pass through the existing idempotency execution guard.

`examples/task-first-coding.js` exposes the same authority shape as a runnable product demo.

## Release evidence

Before merge, the exact v0.4.8 candidate passed:

- Node 20 and Node 22 tests;
- 144 unit/adversarial/product tests;
- coverage;
- packed-package consumer validation;
- the coding product demo;
- current Vercel AI SDK integration;
- connected GitHub quickstart;
- live GitHub read validation;
- live evidence-derived GitHub issue mutation validation;
- CodeQL.

After publication, the independent registry verifier resolved `@nullsquare/agent-authority@0.4.8`, confirmed it was visible on npm, installed it into a fresh Node 20 project and passed all three consumer contracts:

1. base task/durability/evidence contract;
2. connected-provider execution contract;
3. coding authority-lineage contract through public `@nullsquare/agent-authority/providers/github-coding` exports.

## Boundary of the claim

The full branch/file/PR lineage above is currently a self-contained provider-shaped product proof. The repository already has live GitHub evidence for public reads and issue-derived mutations, but v0.4.8 does **not** yet claim that CI created and cleaned a real temporary branch, file commit and draft PR through this complete lineage.

That live mutation proof is a separate evidence gate. Merge and deployment remain intentionally outside the coding task.

## Next validation milestone

The next security question is empirical rather than architectural: how well does exact task-resource lineage preserve useful agent work under indirect prompt injection compared with provenance/taint-style defenses?

The planned external benchmark pins AgentDojo, starts with the Slack suite, and measures benign utility and attacked security separately. Deterministic replay/upper-bound tests must be reported separately from model-in-the-loop AgentDojo results.