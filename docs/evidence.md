# Executable Evidence

Agent Authority is a security-sensitive Community / Developer Preview. Claims in this project should be backed by executable evidence, not architecture diagrams or favorable prompts alone.

This page records the strongest properties the repository currently demonstrates and the boundary of each claim.

## Core claim under test

> An effect placed behind an Agent Authority Task Lease cannot use the host's broader provider access for a request outside the task authority unless that authority expands explicitly.

This applies only to effects that actually pass through the Agent Authority enforcement boundary. A separate unguarded provider path remains outside the guarantee.

## Strict execution-bound derived authority

The preferred provider-data path is:

```text
ALLOW receipt
    +
exact guarded output
    |
    v
execution evidence
(receipt/request/output integrity)
    |
    v
reviewed adapter extractor
(selector only)
    |
    v
TaskLease.deriveFromEvidence()
    |
    v
derived authority fact
```

`deriveFromEvidence()` does not accept the authority value. The extractor identifies a reviewed selector; the Task Lease verifies the evidence and resolves that selector from the bound output itself.

The authority-evidence tests cover:

- caller value substitution;
- modified output under unchanged evidence;
- modified evidence;
- replay under another ALLOW receipt;
- cross-Task-Lease substitution;
- wrong provider operation;
- unsafe selector paths.

The legacy `TaskLease.derive()` path remains available as `host-trusted` compatibility behavior and has a larger trust boundary.

### Boundary of the strict claim

Execution evidence is integrity inside the trusted Agent Authority runtime/adapter boundary. It is **not cryptographic remote-provider attestation**. The adapter/host still originates the normalized provider output before Agent Authority binds evidence to it.

A malicious host that bypasses the gate or deliberately executes a different effect can violate the intended architecture.

## Two-provider extractor conformance

The same strict primitive is exercised through reviewed mappings for:

```text
Google Gmail
thread.read -> sender_email -> email.address authority

GitHub
issue.list -> selected_issue_number -> github.issue.number authority
```

The shared conformance suite checks positive derivation, output tampering, replay, cross-lease reuse and wrong-operation extraction for both provider families.

This is evidence that strict derived authority is a reusable provider primitive rather than one provider-specific demo.

## Typed Task Lease relations

The Community Preview adds only three task binding relations:

```text
exact   request == established fact
oneOf   request is one member of established finite set
max     numeric request <= established numeric ceiling
```

Tests prove:

- `exact` remains the backward-compatible default;
- `oneOf` permits only members of the established finite set;
- `max` permits equal/smaller numeric effects and steps up an over-limit effect;
- blocked relation mismatches execute zero guarded callbacks;
- invalid relation fact shapes fail closed;
- unknown relation names are rejected;
- typed relations survive Task Lease snapshot recovery;
- snapshots created before the relation field default back to `exact` on recovery.

`max` is a per-effect ceiling, not cumulative accounting. Aggregate provider state remains a provider/application responsibility.

## AgentDojo external oracle validation

The external benchmark harness pins:

```text
agentdojo package     0.1.35
benchmark version     v1.2.2
suite                 slack
selected user tasks   5, 6, 7, 8, 11
```

The extractor uses AgentDojo's public suite registry and task objects. The Node oracle compiler maps only legitimate mutation resource/destination fields into Agent Authority bindings.

The first run exposed a genuine finite-set gap: `user_task_11` needs `add_user_to_channel.channel` to accept exactly `{general, random}`. Instead of widening to a wildcard, Agent Authority added the narrow `oneOf` relation.

The Community Preview regression gate is:

```text
selected tasks              5
mapped tasks                5
mapping coverage            100%
mapped-task completion      100%
unrelated-target block rate 100%
unauthorized effects        0
relations exercised         exact, oneOf
```

The benchmark mutates each relevant destination/resource field to an unrelated value and asserts that `authority_delta_required` occurs before the attack callback runs.

### What the oracle proves

- the deterministic authority model can express all five selected legitimate workflows;
- the finite-set workflow can be represented without wildcard authority;
- unrelated target mutations are blocked before effect execution in the oracle harness;
- external workflow evidence can drive a narrow product relation without introducing a general policy DSL.

### What the oracle does not prove

- natural-language task-to-authority compilation;
- that an LLM chose the correct tool sequence;
- official AgentDojo model utility/security scores;
- prompt-injection resistance in a model-in-the-loop run.

See [`benchmarks/agentdojo/README.md`](../benchmarks/agentdojo/README.md).

## Live evidence-derived GitHub mutation

Public fixture: issue `#9` in this repository.

The live proof uses explicit roots for the repository and fixture marker, executes a reviewed `github:issue.list`, derives the selected issue number through strict execution evidence, and then performs one real issue-comment mutation on that exact issue.

The adversarial path attempts another issue and observes:

```text
authority_delta_required
zero additional task-side provider mutations
```

After Task Lease completion, reuse of the previously valid issue is denied.

The temporary validation comment is cleaned up outside the proof path.

This proves a real provider mutation can be bounded to a resource selected from an authorized provider result while broader underlying GitHub capability still exists.

It does not prove GitHub cryptographically attested Agent Authority's normalized output, and it is bypassable if an agent independently receives another GitHub credential/path.

## Live GitHub read boundary

The live public GitHub quickstart models Mission-level `repo.read` more broadly than the current task. One authorized repository causes one network call. An unrelated repository becomes an authority delta before a second network call occurs.

A connected GitHub workflow also packs the candidate into a fresh consumer, creates a fresh Agent Authority home, passes the GitHub Actions credential through the broker path, checks that the raw credential is not exposed in public task/connection state or plaintext under the home, runs the authorized request, and blocks an unrelated repository at the Task Lease.

## Coding workflow proof

The task-first coding example exercises:

```text
repository
  -> issue
  -> base SHA
  -> task branch
  -> exact changed path
  -> draft PR
```

Adversarial attempts include writing to `main`, writing an unrelated path, creating a PR from the wrong branch and attempting merge. The first three require authority expansion before mutation; merge is explicitly denied.

This is the current self-contained coding-agent product proof.

## Support / communications proof

The support example and tests model:

```text
authorized Gmail-shaped thread
   -> reviewed sender extraction
   -> exact sender email authority
   -> Calendar-shaped attendee effect
```

A different thread or attendee executes zero provider-shaped callbacks. Completion removes the remaining task authority.

A controlled connected-account Gmail -> Calendar smoke has also been exercised. Public GitHub Actions reproduction remains a separate gate because it requires repository Google OAuth secrets.

## Operations / finance proof

The finance example exercises:

```text
ticket
   -> order
   -> payment
   -> payment amount + currency
   -> partial refund
```

Payment ID and currency stay exact. The evidence-derived payment amount is bound with `relation: 'max'` so a legitimate partial refund can proceed while an over-refund steps up.

The example executes exactly one legitimate refund. It also proves that an unrelated payment, over-limit amount, wrong currency and post-completion retry do not run another refund callback.

The example explicitly notes that `max` does not track cumulative refund state across multiple mutations.

## Durable local Task Lease recovery

Authenticated local Task Lease persistence/recovery is implemented and tested. Recovery validates:

- exact Mission identity/hash;
- principal and agent identity;
- authenticated stored state;
- authority fact lineage;
- binding state including typed relations;
- completion and expiry state.

The durable session refreshes before security-critical evaluation and uses local stale-writer compare-and-swap protection plus per-lease locking.

### Durability boundary

This does **not** make arbitrary remote provider effects and local Task Lease state one distributed transaction. A crash or race around asynchronous provider I/O still requires provider idempotency / recovery design.

## Network-boundary integration

The guard network test uses a local HTTP provider with a deliberately broad bearer credential and observes at the server boundary that:

- the authorized resource reaches the provider;
- an unrelated resource does not create another request;
- completed task authority does not create another request;
- the broad credential can still exist while task authority is narrower.

## Transport invariance

The same authority model is exercised across:

- direct guard/SDK execution;
- MCP gateway execution;
- brokered connected-provider execution;
- task-first `task.execute()`;
- Vercel AI SDK protected-tool integration.

The demonstrated transport must not broaden the semantic request authority.

## Continuous checks

Pull requests currently run combinations of:

- Node.js 20 and 22 tests;
- coverage;
- syntax/package checks;
- packed fresh-consumer tests;
- task-first demos including coding and finance proofs;
- deterministic utility benchmark;
- Vercel AI SDK integration;
- live GitHub read/mutation checks where permitted;
- connected GitHub validation;
- pinned AgentDojo oracle validation;
- CodeQL.

The live Google workflow remains opt-in because repository OAuth secrets are required.

## Evidence standard for new claims

A new security/product claim should ideally include:

1. a positive path that performs useful intended work;
2. an adversarial path that attempts to exceed authority;
3. observation at or immediately before the real effect/provider boundary;
4. a reproducible test or public CI run;
5. a statement of what the evidence does **not** prove.

Prefer a smaller claim with strong executable evidence over a broader claim that depends on trusting the model, prompt or architecture diagram.
