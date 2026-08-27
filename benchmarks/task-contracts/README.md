# Task-contract feasibility pilot

This directory is an **offline research prototype**. It does not change the production Agent Authority runtime.

## Research question

Can a compact, task-local, stateful authorization contract be synthesized from trusted successful task traces and then reject small authorization-boundary mutations that a field-wise allowlist would admit?

The pilot tests five contract families:

- finite value constraints;
- tuple relations across correlated fields;
- dataflow bindings to values established earlier in the trace;
- effect cardinality;
- prerequisite / precedence facts.

The prototype deliberately does **not** synthesize arbitrary natural-language semantics and does not treat free-form message text as general authority. `send_email` extracts only a typed date token for one correlation stress case.

## Pilot tasks

The fixtures cover 20 representative AgentDojo workflows across Slack, Banking, Workspace, and Travel. The authority-relevant traces are manually projected from AgentDojo ground-truth workflows that were inspected during the feasibility audit.

This is an important limitation: the current pilot is **not yet direct end-to-end AgentDojo extraction**. It is intended to falsify the contract grammar and synthesis design before changing the product runtime.

## Baselines

`compileFieldwise()` learns allowed values independently per action field. It ignores history, cross-field correlations, repetitions, and causal value flow.

`compileStateful()` additionally learns:

- per-action count ceilings;
- tuple relations for correlated static fields;
- dataflow bindings for values established by earlier events;
- prerequisite facts.

## Authorization mutants

The pilot generates these near-neighbor negative traces:

- field replacement;
- repeated authorized effect;
- value transplant from a different valid environment;
- consumer-before-producer order violation;
- adjacent stronger action;
- exhaustive unseen cross-product recombinations for repeated multi-field effects.

## Run

```bash
node benchmarks/task-contracts/run-pilot.mjs
```

The runner exits non-zero if a feasibility gate fails.

## Current local feasibility result

After expanding the cross-field stress test, the tested prototype produced:

```text
pilot tasks                         20
representation                     100%
stateful training acceptance       100%
field-wise held-out acceptance      20%
stateful held-out acceptance       100%
field-wise mutant block rate        51.3%
stateful mutant block rate         100%
mutants tested                     150
cross-product mutants               12
contract families                    5
feasibility decision                GO
```

These values are **prototype results**, not publication claims. They are based on curated authority projections and synthetic environment variants. They must be reproduced by a direct AgentDojo extractor before they can be used as research evidence.

## Go/no-go gates

The runner currently requires:

- at least 85% pilot representation;
- at most six contract families;
- 100% training trace acceptance;
- at least 95% mutant blocking;
- at least 90% held-out trace acceptance;
- measurable improvement over the field-wise baseline for both mutant blocking and held-out dynamic traces.

## Next validation step

Replace the curated fixture layer with a direct extractor over AgentDojo task objects and provider/tool authority schemas. Keep the synthesizer and verifier unchanged where possible. If direct extraction requires task-specific policy code or a much larger grammar, treat that as a redesign/stop signal rather than hiding it with exceptions.
