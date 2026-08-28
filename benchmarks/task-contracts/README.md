# Task-contract and selection-witness research pilot

This directory is an **offline research prototype**. It does not change the production Agent Authority runtime.

## Research question

Can a task-local authorization contract acquire authority for resources discovered during authorized execution while remaining bounded, rejecting unauthorized near-neighbor effects, and avoiding task-specific policy code?

A second question emerged from the experiments:

> When execution discovers several candidate resources, what evidence is sufficient to authorize one selected resource?

The current hypothesis is that **provenance alone is insufficient**. A value appearing in an authorized candidate list, or appearing as an argument in a prior agent request, does not prove that the task authorizes that value. Dynamic authority should require one of:

1. an explicit task root;
2. authorized returned evidence that identifies the value; or
3. a deterministic **selection witness** that proves the selected value satisfies the task's selection predicate over the observed candidate set.

Unresolved dynamic-looking values fail closed and remain statically fenced.

## Evidence hierarchy

The directory now contains three distinct experiment layers.

### 1. Annotated reference pilot

`run-pilot.mjs` is the older stateful reference experiment. It uses curated authority projections and lineage annotations. It remains useful as an upper-bound/reference grammar experiment, but it is **not** the primary annotation-free result.

### 2. Direct AgentDojo annotation-free pilot

`extract-agentdojo-pilot.py` executes the selected AgentDojo ground-truth workflows directly. Provider/action-level schemas project authority-relevant effects. The automatic lineage and strict contract compilers do not consume task IDs or the curated `origins`, `produces`, or `requires` annotations as authorization rules.

The strict compiler is `strict-output-or-witness-contract`:

- task-root literals may remain static authority;
- returned authorized evidence may create dynamic bindings;
- deterministic selector witnesses may create dynamic bindings;
- prior request arguments do not mint new dynamic authority;
- ambiguous list membership is not sufficient authority;
- unresolved dynamic candidates are statically fenced;
- action count, precedence, static tuples, and projected field constraints are enforced.

### 3. Controlled selector-witness generalization pilot

`run-selector-witness-pilot.mjs` isolates the selection-witness primitive. A contract is compiled from one successful trace, then evidence is changed so a **different resource becomes the correct winner**.

The pilot covers:

- unique prefix selection;
- unique argmax by measured cardinality;
- unique argmin by measured cardinality;
- tied extrema;
- incomplete candidate measurement;
- circular request provenance.

The positive cases must follow changed evidence to the new winner. The negative cases must fail closed.

## Current reproducible result

GitHub Actions run `33150550495`, commit `d1a9da9e5653411ba79ce28935f478183bb6d153`, passed the complete research workflow.

### Automatic lineage over direct AgentDojo execution

```text
selected AgentDojo tasks              20
gold lineage bindings                 21
eligible gold bindings                20
recovered gold bindings               19
gold lineage recall                 90.5%
eligible lineage recall             95.0%
static inference share               9.5%
task-specific inference rules           0
```

### Strict annotation-free contract

```text
base utility                         20/20   100%
evidence-consistent variants         11/11   100%
field-wise baseline variants          1/11     9.1%
strict authorization mutants        141/141  100%
field-wise baseline mutants          88/141   62.4%
inferred dynamic bindings                17
output-derived bindings                  16
AgentDojo selector bindings               1
unresolved dynamic candidates             9
unresolved candidates statically fenced   9
unsafe unresolved candidates              0
```

The strict mutant denominator differs from the earlier permissive automatic compiler because request-only values are no longer treated as dynamic authority and therefore are not generalized into the same transplant space. Do not claim that `141/141` directly replaces the older `141/144`; they test different inferred contracts.

### Controlled selector-witness pilot

```text
cases                                      6/6
positive selector kinds                      3
  prefix                                      1
  unique argmax                               1
  unique argmin                               1
winner-changing counterfactuals accepted    3/3
negative cases blocked                      6/6
tie produces authority?                      no
incomplete measurement produces authority?   no
prior request argument mints authority?       no
```

This is the strongest current evidence for the selection-witness mechanism because the authorized resource changes when the evidence changes. It is not merely a memorized identifier or a static fence.

## Important AgentDojo limitation

The direct AgentDojo suite does not yet provide a clean broad evaluation of semantic extremum witnesses.

For example, Slack task 10 asks for the channel with the smallest number of **messages**, while its ground-truth workflow measures channels with `get_users_in_channel`. Some extremum workflows also do not establish a complete, unique measurement over every candidate returned by `get_channels`.

The strict compiler therefore correctly fails closed for those cases instead of inventing a task-specific rule. The controlled selector pilot exists to test the primitive under complete and internally consistent evidence.

## Security interpretation

The experiments distinguish three concepts that must not be conflated:

1. **Discovery provenance** — a value appeared during authorized execution.
2. **Selection evidence** — evidence proves why this value, rather than another discovered candidate, satisfies the task predicate.
3. **Authority** — the selected value is permitted as an argument to a later effect, still under the Mission/effect ceiling.

A multi-candidate discovery result establishes candidate membership, not selection authority.

A prior agent-supplied request argument also cannot be used to justify itself later. This prevents circular provenance of the form:

```text
agent chooses X -> reads X -> X is now considered authorized -> mutate X
```

The strict prototype requires returned evidence or a selection witness instead.

## Candidate formal model

Let:

- `M` be the Mission/effect authority ceiling;
- `A_t` be task-local authority facts at step `t`;
- `e_t` be an effect request;
- `o_t` be the returned output of an authorized effect;
- `sigma_t` be execution evidence binding the output to that effect;
- `S(P, C, E)` be a deterministic selection witness for task predicate `P`, candidate set `C`, and measurements/evidence `E`.

An effect may execute only if it remains inside `M` and its required bindings are satisfied by `A_t`.

New resource authority may be added only from a trusted task root, verified authorized output, or a valid selection witness:

```text
A_(t+1) = A_t union derive(o_t, sigma_t) union select(S(P, C, E))
```

while the effect ceiling remains bounded:

```text
Effects(A_(t+1)) subseteq M
```

The task's known resource authority can therefore grow during execution without increasing the Mission's effect authority.

## Candidate properties to formalize

1. **Mission non-amplification** — derived task authority never permits an effect outside `M`.
2. **Causal authority provenance** — every non-root authority fact has an authorized evidence path from task roots.
3. **No request self-authorization** — an agent-supplied request value cannot become dynamic authority solely because it was supplied in a prior request.
4. **Selection soundness** — a selection witness authorizes only a value satisfying the declared selector over the evidenced candidate set.
5. **Ambiguity fail-closed** — ties or incomplete evidence do not create generalized selector authority.
6. **Counterfactual consistency** — if the evidenced candidate state changes and a different unique value satisfies the same selector, authority follows the new value.
7. **Lifecycle/delegation non-amplification** — completion, expiry, revocation, and delegated leases cannot increase authority.

These are research targets, not yet formal proofs.

## What the current result does not prove

Do not claim that the current pilot proves:

- general natural-language intent compilation;
- arbitrary semantic predicates;
- prompt-injection resistance against a model-in-loop benchmark;
- cryptographic remote provider attestation;
- production multi-tenant security;
- completeness of selector inference;
- superiority to PAuth, Bounded Agents, AgentFlow, Progent, or other research baselines.

The current evidence establishes a reproducible mechanism-level feasibility result and a concrete failure mode for provenance-only dynamic authority.

## Next publication gates

Before a strong journal submission, the research should add:

1. formal operational semantics for roots, evidence, selectors, derivation, effects, and revocation;
2. proofs or machine-checked arguments for non-amplification and selection soundness;
3. a larger open-world task benchmark with complete semantic selector ground truth;
4. model-in-loop and compromised-model adversarial evaluation;
5. explicit baseline implementations/comparisons against nearby authorization approaches;
6. ablations for output provenance, request provenance, selector witnesses, static fencing, cardinality, and precedence;
7. runtime overhead and user-step-up cost measurements;
8. independent bypass/red-team attempts.

Until those gates are complete, treat this branch as a promising research prototype, not a finished Q1 paper result.

## Run

The complete research workflow runs in `.github/workflows/task-contract-pilot.yml`.

The principal local commands are:

```bash
python benchmarks/task-contracts/extract-agentdojo-pilot.py > /tmp/agentdojo-task-contract-pilot.json
node benchmarks/task-contracts/analyze-automatic-lineage.mjs /tmp/agentdojo-task-contract-pilot.json
node benchmarks/task-contracts/run-strict-automatic-contract-pilot.mjs /tmp/agentdojo-task-contract-pilot.json
node benchmarks/task-contracts/run-selector-witness-pilot.mjs
```

Each gate exits non-zero on failure.
