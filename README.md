<div align="center">

![Agent Authority](docs/assets/agent-authority-cover-editorial-v2.png)

# Agent Authority

### Give your agent a task, not your account.

**Agent Authority is a task-bounded execution layer for AI agents. It narrows broad provider credentials to the exact effects and resources justified by the user's current task.**

[Quickstart](docs/quickstart.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md) · [Evaluation](benchmarks/task-contracts/README.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

> **Community / Developer Preview.** The project is suitable for experimentation and evaluation; review the security boundary before deploying it around sensitive provider credentials.

</div>

## Why Agent Authority

OAuth and IAM typically answer whether an application may use a provider. Agents need a narrower question immediately before a side effect:

> **Is this exact effect inside the task the user authorized?**

A provider credential may be able to access thousands of resources. Agent Authority creates temporary task-local authority that can be narrower than that credential, can follow resources discovered through authorized work, and disappears when the task completes or expires.

```text
provider credential
       |
       v
user-authorized task
       |
       v
task-local authority
       |
       +--> authorized reads establish evidence
       +--> justified resources can become task-authorized
       +--> unrelated effects deny or require approval
       |
       v
provider effect
```

## Install

Requires Node.js 20+.

```bash
npm install @nullsquare/agent-authority
```

The preferred API is task-first:

```js
import { createTask } from '@nullsquare/agent-authority/task';

const task = createTask({
  principal: 'user:me',
  agent: 'agent:assistant',
  request: 'Find the relevant issue and comment only on that issue',
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

If the agent substitutes an unrelated issue number, the callback does not run. The runtime returns an authority-delta decision that can be explained or routed to an approval flow.

Use `task.run(request, callback)` when your application owns the provider call. Use `task.execute(request)` when Agent Authority owns the connected-provider execution path.

## Core model

The public API is deliberately small:

```text
Task -> Effect -> Authority
```

The key invariant is:

```text
Task Lease authority <= Mission authority
```

A Task Lease can narrow a Mission; it cannot add a protected effect type that the Mission does not permit. Concrete resource facts may be established during authorized execution without expanding the Mission's effect ceiling.

### Typed relations

The Community Preview API currently exposes three narrow relation shapes:

| Relation | Meaning | Example |
| --- | --- | --- |
| `exact` | request equals the established fact | only issue `42` |
| `oneOf` | request is one member of an established finite set | channel is `general` or `random` |
| `max` | numeric request is no greater than an established ceiling | refund amount <= payment amount |

Unknown relations fail closed. Agent Authority intentionally does not expose a general policy-expression language.

## Execution boundary

Agent Authority sits between agent reasoning and the provider path you already use:

```text
agent / planner
      |
      v
Agent Authority
      |
      v
SDK / MCP / gateway / OAuth / provider
```

The repository includes direct SDK, MCP, connected-provider, GitHub, Google, and Vercel AI SDK examples. Changing transport must not broaden task authority.

## Evidence-derived authority

Open-world tasks often discover concrete resource identifiers only after execution begins. Agent Authority binds derived authority to reviewed evidence rather than to arbitrary values proposed by the model.

The evaluation prototype under `benchmarks/task-contracts/` explores richer stateful constraints, including:

- action cardinality;
- precedence;
- tuple/correlation preservation;
- output-derived evidence;
- arithmetic derivation;
- deterministic selection witnesses.

A key evaluated case is selection among several legitimately observed candidates: seeing a resource in authorized output is not, by itself, proof that the task selected that resource for a later protected effect.

## Evaluation snapshot

The reproducible AgentDojo evaluation covers 60 mutation-bearing tasks across Slack, Banking, Workspace, and Travel.

| Measure | Result |
| --- | ---: |
| Reference executions preserved | **60/60** |
| Evidence-consistent counterfactuals accepted | **36/36** |
| Single-trace field-wise comparator counterfactuals accepted | **1/36** |
| Corrected adversarial mutants blocked | **370/370** |
| Provider-boundary malicious trajectories blocked | **230/230** |
| Malicious protected effects reaching the provider | **0** |

A completed matched live-model slice contains 372 attacked Slack scenarios. Ungated execution produced 61 policy-unauthorized protected effects across 40 scenarios; gated execution produced 0. The deterministic and provider-boundary suites remain the primary reproducible evidence.

See [`benchmarks/task-contracts/README.md`](benchmarks/task-contracts/README.md) for methodology, artifact provenance, and offline reproduction commands.

## Security boundary

Agent Authority can only mediate provider paths it controls. If the same agent can reach the provider through another credential, shell, network path, or unguarded connector, that path can bypass the monitor.

The Community Preview also does not provide a trusted natural-language policy compiler, cryptographic remote-provider attestation, or a hardened multi-tenant credential service. These boundaries are documented in [`SECURITY.md`](SECURITY.md).

## Try it

From a blank directory:

```bash
npm init -y
npm install @nullsquare/agent-authority
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart.mjs -o quickstart.mjs
node quickstart.mjs
```

Then explore:

- [`docs/quickstart.md`](docs/quickstart.md) — first protected effect;
- [`docs/architecture.md`](docs/architecture.md) — components and trust boundaries;
- [`docs/evidence.md`](docs/evidence.md) — derived authority and evidence binding;
- [`docs/task-leases.md`](docs/task-leases.md) — task-local authority lifecycle;
- [`docs/transport-invariance.md`](docs/transport-invariance.md) — consistency across execution paths.

## Validate

```bash
npm install
npm run check
```

The benchmark suite is offline by default and does not require paid model calls.

## Contributing

Bug reports, provider-boundary bypasses, benchmark reproductions, and focused improvements are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Citation

Citation metadata is available in [`CITATION.cff`](CITATION.cff). When reporting benchmark results, cite the repository and the exact commit used.

## License

Apache-2.0.
