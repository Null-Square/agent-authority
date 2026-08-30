# Formal Model — Selection Authority Under a Fixed Effect Ceiling

Status: publication-extension formalization over the frozen V1 mechanism. This document does **not** claim machine-checked verification. It states the operational model, trusted assumptions, and paper-level proofs that the implementation is intended to refine.

## 1. Scope

The mechanism mediates **protected provider effects**. It does not prove confidentiality of arbitrary model output, safety of read-only actions, correctness of natural-language intent parsing, or integrity of a remote provider that executes outside the reference monitor.

The central distinction is:

> Observation provenance establishes that a value was seen on an authorized execution path. Selection authority additionally establishes that the value is the one selected by the task predicate over the complete authorized evidence required by that predicate.

## 2. Trusted assumptions

The theorems below are conditional on the following assumptions.

**A1 — Complete mediation.** Every protected provider effect in scope is submitted to the authority monitor before the provider mutation executes. There is no alternate provider write path using the same credential outside the monitor.

**A2 — Mission integrity.** The Mission `M` and task-root facts `R` are created by a trusted authority-construction step and are not writable by the model after task start.

**A3 — Evidence integrity.** An evidence record accepted as provider output is bound to the authorized action invocation that produced it. The model cannot forge a provider output record merely by placing the same value in a request or natural-language message.

**A4 — Witness correctness.** Each implemented witness verifier deterministically implements its declared selector semantics. For selectors requiring a unique winner, the verifier returns a resource only when all required candidate measurements are present and exactly one candidate satisfies the selector.

**A5 — Task isolation.** Evidence and derived authority are scoped to a task/lease identity. Evidence from another task is not accepted as evidence for the current task.

These assumptions identify the trusted computing base rather than hiding it. A production deployment would additionally need hardened credential isolation, durable evidence integrity, and provider-adapter assurance.

## 3. Objects

Let:

- `M` be the finite set of protected effect types permitted by the Mission.
- `R` be the set of trusted task-root authority facts.
- `A_t` be the set of task-local resource/value authority facts available before step `t`.
- `H_t` be the authorized execution history before step `t`.
- `K_t(a)` be the number of successful protected effects of action type `a` before step `t`.
- `O_t` be the set of read/action names observed before step `t` for precedence checks.
- `q_t` be the argument tuple of a requested effect.
- `a_t` be the requested action/effect type.
- `o_t` be a verified provider output.
- `C` be a finite candidate set derived from authorized evidence.
- `P` be a task-rooted selection predicate.
- `E` be the measurements/evidence required to evaluate `P` over `C`.
- `S(P,C,E)` be a deterministic selection witness function that returns either one resource `r` or `⊥`.
- `F` be the set of unresolved values conservatively frozen to task-instance values.

A task state is:

`Σ_t = (M, R, A_t, H_t, K_t, O_t, F)`.

`M` is fixed for the task lifetime. `A_t` may grow with concrete resource facts, but growth of `A_t` never adds a new effect type to `M`.

## 4. Authority derivation rules

### D1 — Root authority

If a value is a trusted task root, it is initially authorized.

```text
r ∈ R
──────
r ∈ A_0
```

### D2 — Verified output derivation

A non-ambiguous value may be derived from verified output of an already authorized execution.

```text
a ∈ M    authorized(a,q,Σ_t)    verifyOutput(a,q,o,σ)=true    extract_i(o)=r
──────────────────────────────────────────────────────────────────────────────
r ∈ A_{t+1}
```

The request arguments `q` are not themselves a derivation source.

### D3 — Selection derivation

When authorized evidence contains multiple candidates, membership alone is insufficient. Dynamic authority is added only for a verified unique selection.

```text
C = candidates(H_t)    complete(P,C,E,H_t)    S(P,C,E)=r
────────────────────────────────────────────────────────
r ∈ A_{t+1}
```

For selector families requiring uniqueness, `S(P,C,E)=⊥` on ties, incomplete measurements, unsupported predicates, or inconsistent evidence.

### D4 — Static fence

If a dynamic value cannot be justified by D2 or D3, V1 may preserve only the concrete task-instance value under a static fence.

```text
unresolved(r)    referenceValue(r)
──────────────────────────────────
r ∈ F
```

This preserves fail-closed behavior but is not evidence that the system inferred the full semantic envelope of the task.

### D5 — Request non-derivation

Request occurrence alone creates no authority.

```text
r occurs in q_t
───────────────
(no derivation)
```

## 5. Effect authorization

A protected effect request `(a,q)` is authorized only if all of the following hold:

1. **Effect ceiling:** `a ∈ M`.
2. **Cardinality:** `K_t(a) < maxCount(a)`.
3. **Precedence:** every required predecessor action for `a` is present in `O_t`.
4. **Static fields:** every statically fenced field of `q` matches an allowed task-root/reference value.
5. **Dynamic fields:** every dynamic field is justified by D2 or D3 using evidence in the current task history.
6. **Correlation:** if a tuple relation exists, the projected argument tuple belongs to the authorized relation.

Only after these checks may the protected provider mutation execute and update `K_t`/`H_t`.

## 6. Selection-witness semantics

For the implemented selector families, the witness relation has the following abstract form.

### Prefix selector

For prefix `p`:

`S_prefix(p,C)=r` iff `{x ∈ C | startsWith(x,p)} = {r}`.

If zero or more than one candidate matches, the result is `⊥`.

### Extremum-cardinality selector

Let `m_E(x)` be the evidenced measurement for candidate `x`.

For maximum:

`S_max(C,E)=r` iff measurements exist for every `x ∈ C` and `r` is the unique candidate with maximal `m_E(x)`.

Minimum is analogous. Missing measurements or ties produce `⊥`.

### Aggregate-frequency selector

Let `freq_E(x)` be the aggregate count induced by complete authorized evidence over the declared evidence domain.

`S_freq(C,E)=r` iff `r` is the unique candidate with maximal/minimal declared aggregate frequency and the witness verifier has complete evidence for the declared aggregation scope.

Again, ties or incomplete evidence produce `⊥`.

## 7. Theorems

### Theorem 1 — Mission non-amplification

**Claim.** For every reachable state `Σ_t`, no protected effect outside `M` can be authorized.

**Proof.** By induction over execution steps. At task initialization, the only protected effect types available to the authorization relation are those in fixed `M`. Consider a transition from `Σ_t` to `Σ_{t+1}`. Rules D1–D4 can add resource/value facts to `A_t` or `F`; none modifies `M`. The effect-authorization rule has `a ∈ M` as a necessary premise. Therefore a protected request with `a ∉ M` cannot authorize at step `t`. Since no transition adds an effect type to `M`, the property is preserved for all reachable states. ∎

### Theorem 2 — No request self-authorization

**Claim.** A value `r` that appears only in agent-supplied request arguments and is absent from trusted roots, verified outputs, valid selection witnesses, and permitted static fences cannot become dynamic authority.

**Proof.** Exhaust the dynamic derivation rules. D1 requires `r ∈ R`. D2 requires `r` to be extracted from verified provider output. D3 requires a valid witness over authorized evidence. D4 is a static reference fence and does not create generalized dynamic authority. D5 explicitly has no derivation conclusion. Therefore request occurrence alone cannot add `r` to dynamic authority. ∎

### Theorem 3 — Selection soundness

**Claim.** Under A3–A4, if D3 adds `r` to dynamic authority, then `r ∈ C` and `r` satisfies the declared selector `P` over the complete evidenced candidate/measurement set required by `P`.

**Proof.** D3 has premises `C = candidates(H_t)`, `complete(P,C,E,H_t)`, and `S(P,C,E)=r`. By A4, a witness verifier returns a resource only if it is a member of `C` and satisfies the declared selector over the required complete evidence. Therefore both membership and predicate satisfaction follow immediately from the successful witness premise. ∎

### Corollary 3.1 — Observation provenance is insufficient for selection authority

There exist traces where `r ∈ C` but `S(P,C,E) ≠ r`. Therefore the proposition `r observed in authorized evidence` does not imply `r selected by the task`.

The Slack-13 falsification and the post-freeze held-out wrong-candidate cases instantiate this separation.

### Theorem 4 — Ambiguity and incomplete evidence fail closed

**Claim.** For a selector requiring a unique winner, if either (a) two or more candidates tie for the winning predicate value or (b) a required candidate measurement is missing, D3 cannot add generalized selection authority.

**Proof.** By definition of the witness functions and A4, either condition causes `S(P,C,E)=⊥`. D3 requires a concrete result `S(P,C,E)=r`; therefore its premises are unsatisfied and no selection-derived authority is added. ∎

### Theorem 5 — Cross-task non-transferability

**Claim.** Under A5, evidence derived under task identity `τ1` cannot expand dynamic authority for a distinct task identity `τ2`.

**Proof.** D2 requires verified output bound to the current task execution record, and D3 requires candidate/measurement evidence from the current task history. By A5, evidence whose task identity differs from the current task is rejected by those premises. Therefore evidence from `τ1` cannot satisfy a derivation premise in `τ2`. ∎

## 8. Counterfactual consistency proposition

**Proposition.** Suppose a contract records a selector relation rather than a concrete winner. If authorized evidence changes from `(C,E)` to `(C',E')` while the task predicate `P` remains unchanged and `S(P,C',E')=r'` uniquely, then the same selector relation can authorize `r'` without recompilation from the old concrete identifier.

**Justification.** D3 depends on the predicate and current evidenced candidate/measurement set, not equality with the original winner. The deterministic counterfactual and held-out tests exercise this property for prefix and extremum selectors.

## 9. Code-to-model correspondence

The publication implementation maps the model to executable checks as follows:

| Formal object/property | Research implementation |
| --- | --- |
| `M` / effect ceiling | action rules in the compiled contract; unknown protected actions fail with `action_not_allowed` |
| cardinality | `maxCount` and `count_exceeded` |
| precedence | `precedenceActions` and `precedence_missing` |
| static fences | compiled `fields` allowlists |
| tuple/correlation | compiled `tuples` relation and `tuple_not_allowed` |
| D2 output derivation | strict output evidence matching in `strict-automatic-contracts.mjs` |
| D3 selection derivation | prefix/extremum witnesses plus aggregate-frequency witness path |
| D5 request non-derivation | strict source inference excludes request arguments |
| ambiguity fail-closed | witness construction requires unique winner / complete measurements |

`run-publication-baselines.mjs` deliberately introduces weaker evaluators around the unchanged compiled contract to show which conclusions disappear when individual premises are removed.

## 10. What is and is not proved

The theorems establish structural properties **given the model and assumptions**. They do not prove that natural-language task compilation always chooses the correct predicate, that every real-world selector is supported, or that the provider boundary is cryptographically unbypassable in arbitrary deployments.

Accordingly, the empirical evaluation must still measure:

- task utility and counterfactual acceptance;
- attack-family blocking;
- held-out selector behavior;
- ablations/baselines;
- decision overhead;
- live-model provider-boundary containment.

The formal and empirical results are complementary rather than substitutes.
