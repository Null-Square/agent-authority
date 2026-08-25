# Announcement copy — v0.5.0 Community Preview

**Agent Authority v0.5.0 is now in Community Preview: give your agent a task, not your account.**

AI agents increasingly operate through credentials that are broader than the task a user actually requested. OAuth and IAM can say an application may use GitHub, Gmail, Calendar, Slack, or another provider. They do not by themselves answer whether one specific effect belongs to the task the user authorized.

Agent Authority adds a task-bounded effect boundary. A task can begin with explicit authority, discover resources through authorized execution, derive downstream authority from evidence-bound provider output, and then block unrelated effects before their callbacks or provider operations execute.

The v0.5.0 Community Preview includes:

- a task-first JavaScript API with first-class TypeScript declarations;
- narrow `exact`, `oneOf`, and `max` task-authority relations rather than a general policy DSL;
- evidence-derived resource lineage through reviewed extractors;
- coding, support/communications, and bounded-finance workflow proofs;
- connected GitHub execution with credentials kept behind the broker boundary;
- authenticated durable local Task Lease recovery;
- direct SDK, MCP, connected-provider, and Vercel AI SDK execution paths using the same Task Lease model;
- a pinned AgentDojo Slack oracle benchmark that already exposed a real product gap and drove the addition of `oneOf`.

For the selected pinned AgentDojo oracle set, the v0.5 regression gate is:

```text
selected tasks              5
mapped tasks                5
mapping coverage            100%
mapped-task completion      100%
unrelated-target block rate 100%
unauthorized effects        0
```

That is **oracle / upper-bound mapping evidence**, not a model-in-the-loop prompt-injection score.

Install the published Community Preview with:

```bash
npm install @nullsquare/agent-authority@0.5.0
```

Or try the credential-free quickstart from a blank directory:

```bash
npm init -y
npm install @nullsquare/agent-authority@0.5.0
curl -fsSL https://raw.githubusercontent.com/Null-Square/agent-authority/main/examples/quickstart.mjs -o quickstart.mjs
node quickstart.mjs
```

We are releasing now because the next evidence should come from outside the project. We want developers to try the API, security researchers to attack the enforcement boundary, benchmark users to reproduce or challenge the results, and agent builders to bring real workflows the current authority model cannot express.

Two concrete community validation tracks are already open:

- [#43 — first-time developer quickstart feedback](https://github.com/Null-Square/agent-authority/issues/43)
- [#50 — model-in-the-loop AgentDojo validation](https://github.com/Null-Square/agent-authority/issues/50)

If you can break the enforcement claim, simplify the integration, reproduce the benchmark, or show a legitimate workflow that does not fit `exact` / `oneOf` / `max`, that is exactly the contribution we want.

**Give your agent a task, not your account.**

This is a Community / Developer Preview, not production IAM, not a sandbox, and not a claim that prompt injection is solved. The repository documents the trust assumptions, bypass boundary, and incomplete protections explicitly in `SECURITY.md`.

## Short form

**Agent Authority v0.5.0 Community Preview:** give your agent a task, not your account.

Task-bounded effect authority for AI agents, with evidence-derived resource lineage, `exact` / `oneOf` / `max` bindings, coding + support + finance proofs, connected GitHub, durable local tasks, TypeScript DX, and a pinned AgentDojo oracle benchmark.

The goal now is external validation: try it, break it, benchmark it, or bring a workflow that does not fit.

Not production-ready. Not a prompt-injection cure. The security boundary and current gaps are documented publicly.