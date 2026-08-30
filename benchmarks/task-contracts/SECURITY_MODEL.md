# Task Authority Security Model

This document describes the operational model used by the task-contract evaluation harness. It is technical documentation for the reference monitor and its executable checks.

## Scope

The monitor mediates **protected provider effects**: provider mutations that must pass an authorization decision before execution.

The central distinction is:

> A value can be legitimately observed during authorized execution without being the value selected by the task for a later protected effect.

For multi-candidate evidence, dynamic authority therefore requires a selection relation in addition to provenance.

## System assumptions

The security properties below rely on five reference-monitor assumptions.

**A1 — Complete mediation.** Every protected provider effect in scope is submitted to the monitor before the provider mutation executes.

**A2 — Mission integrity.** The Mission and trusted task-root facts are established outside model control and are not writable by the model after task start.

**A3 — Evidence integrity.** Evidence accepted as provider output is bound to the authorized invocation that produced it. A model-generated request containing the same value is not equivalent to provider output evidence.

**A4 — Witness correctness.** Each deterministic selection verifier implements its declared selector semantics. Unique-winner selectors return a resource only when the required evidence is present and exactly one candidate satisfies the selector.

**A5 — Task isolation.** Evidence and derived authority are scoped to a task or lease identity.

These assumptions define the trusted computing base. Deployment code must preserve them for the model below to apply.

## State

Let:

- `M` be the finite set of protected effect types permitted by the Mission;
- `R` be the set of trusted task-root authority facts;
- `A_t` be task-local resource/value authority before step `t`;
- `H_t` be verified authorized execution history before step `t`;
- `K_t(a)` be the number of successful protected effects of action type `a` before step `t`;
- `O_t` be the set of actions observed before step `t` for precedence checks;
- `F` be unresolved values held behind static task-instance fences;
- `C` be a finite candidate set derived from authorized evidence;
- `P` be a task-rooted selection predicate;
- `E` be the evidence required to evaluate `P` over `C`;
- `S(P,C,E)` be a deterministic selection function returning a resource `r` or `⊥`.

A task state is:

`Σ_t = (M, R, A_t, H_t, K_t, O_t, F)`.

`M` is fixed for the task lifetime. `A_t` may grow with concrete resource facts; growth of `A_t` never adds a new protected effect type to `M`.

## Authority derivation

### Trusted roots

If a value is a trusted task root, it is initially authorized.

```text
r ∈ R
──────
r ∈ A_0
```

### Verified output

A non-ambiguous value may be derived from verified output of an already authorized execution when the contract permits that output relation.

```text
a ∈ M    authorized(a,q,Σ_t)    verifyOutput(a,q,o)=true    extract_i(o)=r
────────────────────────────────────────────────────────────────────────
r ∈ A_{t+1}
```

Request arguments are not a derivation source.

### Selection witness

When authorized evidence contains multiple candidates, membership alone is insufficient.

```text
C = candidates(H_t)    complete(P,C,E,H_t)    S(P,C,E)=r
────────────────────────────────────────────────────────
r ∈ A_{t+1}
```

For selectors requiring uniqueness, `S(P,C,E)=⊥` on ties, incomplete measurements, unsupported predicates, or inconsistent evidence.

### Static fence

If a dynamic value cannot be justified by evidence or a selection relation, the evaluator may preserve only a concrete task-instance value under a static fence. This is a fail-closed compatibility rule, not generalized dynamic authority.

### Request non-derivation

Request occurrence alone creates no authority.

```text
r occurs in request arguments
─────────────────────────────
(no derivation)
```

## Protected-effect authorization

A protected request `(a,q)` is admitted only when every applicable rule succeeds:

1. **Effect ceiling:** `a ∈ M`.
2. **Cardinality:** `K_t(a) < maxCount(a)`.
3. **Precedence:** required predecessor actions are present in `O_t`.
4. **Static fields:** statically fenced fields match allowed task-root or task-instance values.
5. **Dynamic fields:** dynamic values are justified by verified output or a valid selection witness.
6. **Correlation:** if a tuple relation exists, the projected argument tuple belongs to the authorized relation.

Only after these checks may the provider mutation execute and update task-local history.

## Selection semantics

### Unique prefix

For prefix `p`:

`S_prefix(p,C)=r` iff `{x ∈ C | startsWith(x,p)} = {r}`.

Zero or multiple matches return `⊥`.

### Unique maximum/minimum

Let `m_E(x)` be the evidenced measurement for candidate `x`.

`S_max(C,E)=r` iff every required candidate has a measurement and `r` is the unique candidate with maximal `m_E(x)`.

Minimum is analogous. Missing measurements or ties return `⊥`.

### Aggregate frequency

Let `freq_E(x)` be the aggregate count induced by complete authorized evidence over the declared aggregation scope.

`S_freq(C,E)=r` iff `r` is the unique declared maximum or minimum frequency winner and the aggregation scope is complete. Ties or incomplete evidence return `⊥`.

## Security properties

### Mission non-amplification

No reachable state can authorize a protected effect outside `M`.

Derivation rules can add resource/value facts but cannot modify `M`, and the authorization rule requires membership in `M` for every protected effect.

### No request self-authorization

A value that appears only in model-supplied request arguments cannot become dynamic authority.

Every positive dynamic derivation requires a trusted root, verified provider output, or a valid selection witness; request occurrence has no authority-producing rule.

### Selection soundness

If a selection derivation adds resource `r` to dynamic authority, then `r` belongs to the evidenced candidate set and satisfies the declared selector over the complete evidence required by that selector.

This follows from the selection rule plus witness correctness.

### Authorized observation does not imply selection

There are traces where `r ∈ C` but `S(P,C,E) ≠ r`. Therefore candidate membership in authorized output is weaker than selection authority.

The evaluation includes explicit wrong-candidate cases that isolate this difference while preserving legitimate utility.

### Ambiguity fails closed

For a unique-winner selector, ties and missing required measurements prevent selection-derived authority because the witness returns `⊥`.

### Cross-task non-transferability

Under task isolation, evidence created under one task identity cannot expand dynamic authority for a different task identity.

## Counterfactual consistency

A selector relation need not freeze the concrete winner from one execution. If authorized evidence changes while the task predicate remains the same, a different resource can become authorized when the same deterministic relation selects it uniquely.

This is why relation-based authority can preserve legitimate open-world behavior while remaining stricter than broad provenance membership.

## Code correspondence

| Security concept | Evaluation implementation |
| --- | --- |
| Mission effect ceiling | compiled action rules; unknown protected actions fail closed |
| cardinality | `maxCount` / `count_exceeded` |
| precedence | `precedenceActions` / `precedence_missing` |
| static fences | compiled field allowlists |
| tuple correlation | compiled tuple relation / `tuple_not_allowed` |
| verified output derivation | strict output evidence matching in `strict-automatic-contracts.mjs` |
| selection derivation | prefix, extremum, and aggregate-frequency witness paths |
| request non-derivation | strict source inference excludes request arguments |
| ambiguity handling | unique-winner and complete-measurement witness requirements |

The executable comparators in `evaluation-policies.mjs` deliberately remove individual premises to show which behaviors become admissible.
