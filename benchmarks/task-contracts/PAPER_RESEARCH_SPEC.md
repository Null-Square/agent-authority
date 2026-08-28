# Paper research specification — selection witnesses for open-world agent authorization

Status: **research plan, not a submission draft**

Branch: `research/task-contract-pilot`

## Working title

**Selection Witnesses for Open-World Agent Authorization: Evidence-Grounded Dynamic Authority Under a Fixed Effect Ceiling**

Short alternative:

**Selection Witnesses for Dynamic Agent Authority**

## Thesis

Agent tasks frequently refer to resources that are not known when authorization begins. A secure agent therefore needs a way to acquire authority for newly discovered resources without receiving broad standing permission and without treating every discovered candidate as authorized.

The paper will test the thesis that dynamic task authority can be made both useful and bounded when new authority is acquired from **authorized execution evidence plus deterministic selection witnesses**, while the set of permitted effect types remains inside a fixed Mission ceiling.

## What is not the novelty claim

The paper must **not** claim novelty for any of these ideas by themselves:

- task-based authorization;
- least privilege;
- capability attenuation;
- stateful authorization;
- provenance tracking;
- task-scoped OAuth;
- natural-language authorization;
- prompt-injection defense;
- delegation that can only narrow authority.

All have substantial prior work.

## Candidate contribution claim

The narrow candidate contribution is the combination of these points:

1. **Open-world resource authority.** A task can begin without enumerating every concrete resource identifier it will need.
2. **Evidence-grounded acquisition.** New resource authority can arise only from an authorized causal execution path, not from arbitrary model output or prior request arguments.
3. **Candidate/selection separation.** Discovering a set of candidate resources does not authorize each candidate.
4. **Selection witnesses.** When several candidates exist, a later effect receives dynamic authority only when a deterministic witness proves that the selected value satisfies the task selector over evidenced candidates/measurements.
5. **Fixed effect ceiling.** Resource authority may grow during a task, but the kinds of effects that can be executed remain bounded by the Mission ceiling.
6. **Fail-closed ambiguity.** Ties, incomplete measurements, unsupported predicates, or unresolved semantics do not create generalized dynamic authority.

This is a hypothesis to defend against prior work, not a priority claim.

## Core motivating failure

A provenance-only rule can be circular:

```text
agent chooses resource X
        ↓
agent performs an allowed read of X
        ↓
X appears in the authorized execution history
        ↓
naive provenance system treats X as authorized
        ↓
agent performs a privileged effect on X
```

This proves only that the agent used `X`, not that the user task selected `X`.

A second failure occurs when a read returns multiple candidate resources:

```text
authorized read -> [A, B, C]
```

Membership proves that `A`, `B`, and `C` were discovered. It does not prove which one is authorized for a later mutation.

The research mechanism introduces a separate selection step:

```text
task predicate P
candidate set C
measurements/evidence E
        ↓
selection witness S(P, C, E)
        ↓
unique selected resource r
        ↓
dynamic authority for r
```

## Research questions

### RQ1 — Automatic authority recovery

How much authority lineage can be recovered from direct authorized execution evidence using provider/action-level schemas and no task-ID-specific rules?

Current pilot signal:

- 20 direct AgentDojo tasks;
- 90.5% gold lineage recall;
- 95% recall over eligible gold bindings;
- 0 task-specific inference rules in the automatic analyzer.

### RQ2 — Utility versus authorization safety

Can an annotation-free stateful contract preserve legitimate counterfactual executions while blocking near-neighbor authorization mutations better than field-wise/static alternatives?

Current strict pilot signal:

- base utility: 20/20;
- evidence-consistent variants: 11/11;
- field-wise baseline variants: 1/11;
- strict mutants blocked: 141/141;
- field-wise baseline mutants blocked: 88/141.

These numbers are pilot evidence and must not be treated as final paper statistics.

### RQ3 — Selection-witness soundness and generalization

When evidence changes so a different candidate becomes the correct unique winner, can the same compiled contract authorize the new winner while rejecting stale/wrong winners?

Current controlled pilot signal:

- prefix: changed winner accepted, wrong winner rejected;
- unique argmax: changed winner accepted, stale winner rejected;
- unique argmin: changed winner accepted, wrong winner rejected;
- tie: no generalized selector authority;
- incomplete measurement: no generalized selector authority;
- request-only circular provenance: no generalized authority.

### RQ4 — Adversarial model robustness

Under a compromised or prompt-injected agent model, how often can the model cause an unauthorized effect to reach the provider boundary?

This is **not yet answered** by the current ground-truth-trace pilot.

### RQ5 — Cost of bounded authority

What utility, latency, policy-generation, and user step-up costs are introduced by evidence-grounded dynamic authority compared with broader task authorization and static policies?

This is **not yet measured**.

## Formal objects

A minimal formal model should include:

- `M`: Mission authority / effect ceiling;
- `A_t`: task-local resource authority facts at step `t`;
- `H_t`: authorized execution history through step `t`;
- `e_t`: requested effect;
- `q_t`: effect arguments / requested resources;
- `o_t`: provider output;
- `sigma_t`: execution evidence binding request, output, effect, lease, and time;
- `C`: candidate resource set produced by authorized evidence;
- `P`: task selection predicate;
- `E`: measurements/evidence over candidates;
- `S(P,C,E)`: selection witness;
- `r`: selected resource;
- `F`: statically fenced unresolved values.

The model must distinguish **effect authority** from **resource authority**.

Resource authority can increase inside a task:

```text
A_t subseteq A_(t+1)
```

while effect authority remains bounded:

```text
Effects(A_t) subseteq M
```

The paper should avoid the misleading statement that all authority monotonically shrinks. Delegation may attenuate, while a running task can acquire additional concrete resource facts under the unchanged Mission ceiling.

## Candidate transition rules

### Root

A trusted task root may initialize authority:

```text
root(r) => r in A_0
```

### Authorized execution

An effect executes only if its effect type is within `M` and all required resource bindings are satisfied by current authority.

```text
e in M and bindings(e,q) satisfied by A_t
------------------------------------------------
execute(e,q)
```

No external side effect occurs before this decision.

### Evidence derivation

A reviewed extractor may derive a fact from output that is cryptographically/logically bound to an already authorized execution:

```text
authorized(e,q) and verify(sigma,o,e,q) and extractor_i(o)=r
----------------------------------------------------------
r in A_(t+1)
```

A caller-supplied value alone is insufficient.

### Selection derivation

For a multi-candidate result:

```text
C derived from authorized evidence
E contains required measurements for C
S(P,C,E) verifies and returns unique r
------------------------------------------------
r in A_(t+1)
```

If the witness cannot verify, no generalized selection authority is added.

### Static fence

If a successful reference execution contains a dynamic-looking value that cannot be safely derived, the prototype may preserve only the observed value:

```text
unresolved(r) => r in F
```

This is a conservative engineering fallback, not evidence that the system understood the task semantics.

### Request non-derivation

A request argument must not create resource authority solely by having appeared in a previous request:

```text
q_i contains r
-----------------------------
does not imply r in A_(i+1)
```

## Candidate theorem/proposition targets

### T1 — Mission non-amplification

For every reachable task state, no authorized effect lies outside the Mission ceiling.

### T2 — Causal authority provenance

Every non-root dynamically authorized resource has a derivation path to verified output evidence or a valid selection witness rooted in authorized execution.

### T3 — No request self-authorization

There is no derivation rule in which an agent-supplied request value becomes dynamic authority solely because the value appeared in prior request history.

### T4 — Selection soundness

If a selector witness authorizes `r`, then `r` belongs to the evidenced candidate set and satisfies the witness predicate over the complete evidence required by that predicate.

### T5 — Unique-selection fail-closed property

For selectors requiring a unique winner, ties or incomplete candidate measurements cannot produce generalized selector authority.

### T6 — Counterfactual selector consistency

If the candidate evidence changes while preserving the same selector predicate and a different unique candidate `r'` satisfies that predicate, the same selector contract can authorize `r'` without recompilation from the concrete identifier.

### T7 — Cross-task non-transferability

Evidence or derived authority from one Task Lease cannot be replayed to expand another Task Lease.

### T8 — Lifecycle non-amplification

Completion, expiry, revocation, and delegation cannot create new authority and must prevent later use according to the runtime semantics.

The final paper should prove a small number rigorously rather than list many informal properties.

## Threat model

### Adversary controls

The evaluation should assume the agent/model may:

- choose malicious tool arguments;
- reorder calls;
- repeat effects;
- transplant identifiers observed elsewhere;
- use an unrelated candidate from a legitimate result set;
- reuse request values to attempt circular authorization;
- replay stale/cross-task evidence;
- exploit ambiguous/tied selectors;
- omit prerequisite reads/measurements;
- combine independently valid field values into an unauthorized tuple.

### Trusted computing base

The paper must explicitly identify trust in:

- Mission construction / approved root authority;
- authorization reference monitor;
- provider adapter boundary;
- execution-evidence integrity;
- reviewed authority extractors;
- selector implementation;
- schema metadata used to project effect arguments.

Current strict evidence is not remote cryptographic provider attestation. That limitation must remain explicit.

## Experimental program

### E1 — Direct benchmark extraction

Expand from the current 20 selected AgentDojo tasks to a larger task set and, where useful, additional agent benchmarks.

Report:

- task coverage;
- projected effects;
- eligible lineage facts;
- recovered facts;
- false/static inferences;
- unresolved/fenced facts;
- task-specific exception count.

A growing exception count is a redesign signal.

### E2 — Open-world selector benchmark

Build a benchmark where the resource identifier is intentionally unknown at task entry.

Selector families should include:

- exact value from authoritative output;
- unique prefix/suffix or typed attribute match;
- argmin/argmax over complete measurements;
- threshold selection;
- conjunction over typed attributes;
- created-resource identity;
- derived numeric bound;
- cross-provider identity mapping where evidence supports it.

Negative cases should include:

- candidate membership without selection evidence;
- ties;
- incomplete measurements;
- stale measurements;
- changed candidate sets;
- request-only provenance;
- malicious decoy candidate;
- cross-task transplant.

### E3 — Compromised-model evaluation

Run actual agents/models rather than only ground-truth traces.

Evaluate at minimum:

- normal benign task completion;
- prompt-injected trajectories;
- explicitly malicious tool-choice model/oracle;
- opportunistic policy probing.

Measure unauthorized **provider-boundary effects**, not only model intentions.

### E4 — Baseline comparison

At minimum compare against representative nearby approaches where implementable and fair:

- broad standing/provider authority;
- field-wise/static allowlist;
- precomputed task-scoped authority;
- provenance-only dynamic authority;
- strict output-evidence authority without selectors;
- strict output + selection witnesses (proposed system).

The related-work audit must also discuss PAuth, Bounded Agents, AgentFlow, Progent, CaMeL, Task Shield, classic task-based access control, capability attenuation/Macaroons, and relevant history-based authorization work.

Do not fabricate direct quantitative comparisons to systems that cannot be reproduced. For such systems, make architectural/qualitative comparisons separately.

### E5 — Performance and usability cost

Measure:

- compile time;
- authorization decision latency;
- evidence size;
- runtime storage;
- additional reads/measurements required to construct a witness;
- false step-up/static-fence rate;
- number of user approvals;
- task completion impact.

## Required ablations

The paper should include ablations that remove one mechanism at a time:

1. no state/history;
2. no output provenance;
3. allow request provenance;
4. candidate membership treated as authority;
5. no selector witnesses;
6. no tuple relations;
7. no cardinality ceilings;
8. no precedence requirements;
9. no static fail-closed fence;
10. incomplete selector evidence allowed.

The most important expected ablations are (3) and (4), because the pilot already found concrete safety failures there.

## Metrics

Primary metrics:

- benign task completion / secure utility;
- unauthorized effect rate at provider boundary;
- mutant block rate by family;
- counterfactual dynamic-generalization acceptance;
- lineage precision/recall;
- false step-up/static-fence rate;
- task-specific exception count.

Secondary metrics:

- policy size;
- inference/runtime overhead;
- evidence storage;
- user approval count;
- selector coverage by predicate family.

Avoid presenting one aggregate safety percentage without per-family results.

## Paper structure candidate

1. Introduction and open-world authority problem
2. Background and related work
3. Threat model and system model
4. Evidence-grounded dynamic authority
5. Selection witnesses
6. Formal properties
7. Implementation in Agent Authority
8. Evaluation methodology
9. Results
10. Ablations and failure analysis
11. Limitations
12. Discussion and deployment implications
13. Related work synthesis
14. Conclusion

## Current evidence checkpoint

As of commit `d1a9da9e5653411ba79ce28935f478183bb6d153`:

- direct AgentDojo research workflow: green;
- normal Agent Authority CI on the same branch generation: green;
- direct tasks: 20/20 base accepted;
- strict evidence-consistent variants: 11/11 accepted;
- strict generated mutants: 141/141 blocked;
- controlled selection-witness cases: 6/6 passed;
- positive selector kinds demonstrated: prefix, unique argmax, unique argmin;
- winner-changing selector counterfactuals: 3/3 accepted;
- tie/incomplete/request-circular negative cases: blocked;
- unsafe unresolved dynamic authority: 0.

These results justify continuing the research program. They do **not** by themselves justify a Q1 submission.

## Publication stop/go criteria

### Continue / GO

Continue if the expanded experiments preserve all of these:

- no task-specific authorization exceptions, or a clearly bounded very small rate with principled explanation;
- strong counterfactual utility for newly discovered resources;
- near-zero or zero unauthorized provider-boundary effects under generated adversarial traces;
- selector soundness under ties, incomplete evidence, stale evidence, and changed winners;
- measurable advantage over provenance-only and static/precomputed baselines;
- acceptable false-step-up and overhead cost.

### Redesign / HOLD

Hold the paper if:

- selector inference requires task-ID-specific rules;
- request history must be trusted as authority to preserve utility;
- broad candidate membership must be authorized to complete common tasks;
- most dynamic values fall back to static fencing;
- model-in-loop secure utility collapses;
- the mechanism cannot be distinguished technically from stronger existing systems after full related-work verification.

### Submission-ready gate

Do not call the work submission-ready until:

1. formal semantics are written and internally reviewed;
2. key properties have proofs or mechanically checked arguments;
3. expanded benchmark results are reproducible from a clean environment;
4. model-in-loop adversarial evaluation is complete;
5. baseline/ablation matrix is complete;
6. related-work novelty audit is refreshed immediately before writing claims;
7. limitations and negative results are included rather than hidden.

## Current decision

**GO for a full research program and paper prototype.**

**NOT YET GO for Q1 submission.**

The current results are strong enough to justify formalization and expanded evaluation. The next scientific bottleneck is no longer basic feasibility; it is external validity, formal soundness, and comparison against the closest prior work.
