# npm release contract

The public package name is `@nullsquare/agent-authority`.

Before any publication:

1. the release commit must pass CI, CodeQL, live GitHub validation, current AI SDK integration validation, task-first utility/demo gates, and packed-consumer validation;
2. `npm pack` must contain the documented public exports;
3. a fresh Node.js 20 consumer must install the tarball and run the current public behavior smoke test;
4. the optional AI SDK integration must import without making `ai` a production dependency;
5. the registry package must be public and its repository metadata must point to `https://github.com/Null-Square/agent-authority`.

After publication, verify from a fresh project with:

```bash
npm install @nullsquare/agent-authority@0.4.7
```

Then run the same consumer smoke flows through the registry-installed package. Registry verification is part of the release gate; a successful `npm publish` command alone is not sufficient.

The repository includes `.github/workflows/verify-npm-registry.yml`, which verifies registry visibility, a clean Node.js 20 install, and current public behavior from the registry artifact.

For v0.4.7 the registry consumer exercises the existing v0.4.6 contract plus connected provider execution:

- `createTask()` from `@nullsquare/agent-authority/task`;
- explicit task permissions and named authority roots;
- task-first allow / `authority_delta_required` behavior;
- `task.explain()` for established-vs-requested authority deltas;
- durable local-state opt-in through `JsonFileTaskLeaseStore` without changing normal task calls;
- execution evidence and the reviewed Google/GitHub authority extractors;
- `ExecutingAuthorityRuntime.executeTaskLease()` and `MissionMcpGateway` transport surfaces;
- `JsonFileTaskLeaseStore`, `DurableTaskLeaseSession`, and the lower-level Task Lease APIs;
- `task.execute(request)` for connected-provider execution;
- the public `@nullsquare/agent-authority/runtime-env` export;
- safe sole-account connection resolution while multiple active accounts remain ambiguous/fail closed;
- connected execution where the credential is broker-internal, the task-authorized resource executes, and an unrelated resource is blocked before a second provider call;
- the requirement that the optional `ai` package is not installed as a production dependency.

This makes the registry artifact verification cover both application-owned task effects (`task.run`) and broker-owned connected provider effects (`task.execute`) together with the durability/evidence/transport surfaces they compose.

The v0.4.7 independent registry verification passed after publication: npm visibility succeeded, a fresh Node.js 20 consumer installed the exact `@nullsquare/agent-authority@0.4.7` artifact, the optional AI SDK was absent, and both the ordinary package smoke and connected-execution smoke passed.

The deterministic task utility fixture is also part of the source-release gate. It currently requires:

```text
normal task completion rate = 100%
false approval rate = 0%
true authority-delta step-up rate = 100%
unauthorized effect rate = 0%
```

This fixture is a regression gate, not a real-world performance benchmark.

## npm vs GitHub release surfaces

Publishing to the public npm registry does not automatically create either a GitHub Release or a GitHub Packages entry.

- **npm registry** — `npm publish --access public` publishes `@nullsquare/agent-authority` to `registry.npmjs.org` / npmjs.com. This is the package users install with `npm install`.
- **GitHub Releases** — a separate GitHub object, normally backed by a Git tag such as `v0.4.7`. A release must be created explicitly or by release automation.
- **GitHub Packages** — a separate package registry. It only appears when the package is published to GitHub's npm registry (`npm.pkg.github.com`); publishing to npmjs.com does not populate it.

Agent Authority currently uses npmjs.com as its public package registry. Therefore an empty GitHub **Packages** section is expected unless the project intentionally adopts dual publication. A GitHub **Release** is still useful for source-release discoverability and should track published versions, but it is independent from npm publication.
