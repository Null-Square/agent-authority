# Paper Research Specification — Selection Witnesses for Open-World Agent Authorization

Status: **V1 research specification closed; paper source, not submission manuscript**

Closed: **2026-08-29**

Branch at closure: `research/task-contract-pilot`

## Working title

**Selection Witnesses for Open-World Agent Authorization: Evidence-Grounded Dynamic Authority Under a Fixed Effect Ceiling**

Short alternative:

**Selection Witnesses for Dynamic Agent Authority**

## Thesis

Agent tasks often need resources that are not known when authorization starts. A secure agent therefore needs a way to acquire task-local resource authority during execution without receiving ambient account authority and without treating every discovered candidate as authorized.

V1 tests this thesis:

> Dynamic task authority can remain useful and bounded when new resource authority descends from authorized execution evidence plus deterministic selection witnesses, while the set of permitted effect types remains inside a fixed Mission ceiling.

## Novelty boundary

Do **not** claim novelty for any of these ideas by themselves:

- task-based authorization;
- least privilege;
- capability attenuation;
- stateful authorization;
- provenance tracking;
- task-scoped OAuth;
- natural-language authorization;
- prompt-injection defense;
- delegation that can only narrow authority.

The candidate contribution is the combination of:

1. **Open-world resource authority.** A task can begin without enumerating every concrete resource identifier it will need.
2. **Evidence-grounded acquisition.** New resource authority can arise only from an authorized causal execution path, not from arbitrary model output or prior request arguments.
3. **Candidate/selection separation.** Discovering candidate resources does not authorize every candidate.
4. **Selection witnesses.** A later effect receives dynamic authority only when a deterministic witness proves that the selected value satisfies the task selector over evidenced candidates and measurements.
5. **Fixed effect ceiling.** Concrete resource facts can grow during a task while permitted effect types remain bounded by the Mission.
6. **Fail-closed ambiguity.** Ties, incomplete measurements, unsupported predicates, and unresolved semantics do not create generalized dynamic authority.

This is a contribution hypothesis to defend against current related work. It is not a priority claim.

## Core falsification

A provenance-only rule can be circular:

```text
agent chooses X
      |
      v
allowed read of X
      |
      v
X appears in authorized history
      |
      v
naive provenance treats X as authorized
      |
      v
privileged effect on X
```

This proves only that the agent used `X`. It does not prove that the user's task selected `X`.

A second failure occurs when an authorized read returns several candidates:

```text
authorized read -> [A, B, C]
```

Membership proves discovery. It does not prove which candidate the task authorizes for a later mutation.

V1 therefore introduces a separate selection step:

```text
task predicate P
candidate set C
measurements/evidence E
        |
        v
selection witness S(P,C,E)
        |
        v
unique selected resource r
        |
        v
dynamic authority for r
```

The expanded AgentDojo cohort produced a concrete falsification in Slack task 13. Alice appeared in authorized histories, but Charlie was the aggregate message-count winner. Observation provenance alone would permit the wrong candidate. The aggregate-frequency witness repaired the general rule without a task-ID-specific authorization exception.

## Research questions and V1 status

### RQ1 — Authority recovery

How much useful authority structure can be recovered from authorized execution evidence using provider/action schemas without task-ID-specific authorization rules?

**V1 status:** feasible. Earlier direct-pilot lineage recovery reached 90.5% gold recall and 95% eligible recall with zero task-specific inference rules. The final 60-task cohort uses provider/action-level schemas and no task-ID-specific authorization rules in the evaluated mechanism.

### RQ2 — Utility versus authorization safety

Can a stateful task contract preserve legitimate changed executions while blocking near-neighbor authorization mutations better than exact-trace/static alternatives?

**V1 status:** strongly supported in the evaluated deterministic cohort.

- reference utility: **60/60**;
- evidence-consistent counterfactuals: **36/36** accepted;
- static exact-trace baseline: **1/36** accepted;
- corrected adversarial mutants: **370/370** blocked;
- constructible provider-boundary adversarial trajectories: **230/230** blocked;
- malicious provider reaches: **0**.

### RQ3 — Selection-witness generalization

When evidence changes so a different candidate becomes the correct unique winner, can the same selector relation authorize the new winner and reject stale or wrong winners?

**V1 status:** supported for the implemented selector families under controlled evidence.

The prototype exercises prefix, extremum, and aggregate-frequency selection. Ties and insufficient evidence fail closed. The result is mechanism-level evidence, not a claim of arbitrary semantic predicate support.

### RQ4 — Adversarial model robustness

Under adversarial model trajectories, can policy-unauthorized protected effects reach the provider boundary?

**V1 status:** partially answered by DeepSeek V4 Pro live evidence.

In the 372 attacked scenarios that completed in both ungated and gated conditions:

- ungated execution produced **61 policy-unauthorized protected effects across 40 scenarios**;
- gated execution produced **0**;
- ungated matched utility was **84.41%**;
- gated matched utility was **82.26%**.

This is a partial Slack live slice. The full preregistered 5,088-run matrix did not complete. Do not generalize this result to broad prompt-injection security or multi-model robustness.

### RQ5 — Cost of bounded authority

What utility, latency, policy-generation, and user step-up costs does bounded authority introduce?

**V1 status:** partially measured.

The matched attacked DeepSeek slice shows a **2.15 percentage-point utility difference** between ungated and gated conditions. Deterministic reference utility is 60/60. V1 does not provide a complete latency, policy-generation, false-step-up, or human-approval cost study.

## Formal objects

Use at minimum:

- `M`: Mission authority / effect ceiling;
- `A_t`: task-local resource authority facts at step `t`;
- `H_t`: authorized execution history through step `t`;
- `e_t`: requested effect;
- `q_t`: effect arguments/resources;
- `o_t`: provider output;
- `sigma_t`: execution evidence binding request, output, effect, lease, and time;
- `C`: candidate resource set derived from authorized evidence;
- `P`: task selection predicate;
- `E`: measurements/evidence over candidates;
- `S(P,C,E)`: deterministic selection witness;
- `r`: selected resource;
- `F`: statically fenced unresolved values.

The paper must distinguish **effect authority** from **resource authority**.

Task-local resource facts can grow:

```text
A_t subseteq A_(t+1)
```

while effect types remain bounded:

```text
Effects(A_t) subseteq M
```

Do not state that all authority monotonically shrinks. Delegation can attenuate, while a running task can acquire additional concrete resource facts under the unchanged Mission ceiling.

## Candidate transition rules

### Root

```text
root(r)
------
r in A_0
```

### Authorized execution

```text
e in M and bindings(e,q) satisfied by A_t
-----------------------------------------
execute(e,q)
```

No protected external effect occurs before this decision.

### Evidence derivation

```text
authorized(e,q) and verify(sigma,o,e,q) and extractor_i(o)=r
----------------------------------------------------------
r in A_(t+1)
```

A caller-supplied value alone is insufficient.

### Selection derivation

```text
C derived from authorized evidence
E contains required measurements for C
S(P,C,E) verifies and returns unique r
----------------------------------------
r in A_(t+1)
```

If the witness cannot verify, no generalized selection authority is added.

### Static fence

```text
unresolved(r)
-------------
r in F
```

This is a conservative fallback. It is not evidence that the system understood the full task semantics.

### Request non-derivation

```text
q_i contains r
--------------------
does not imply r in A_(i+1)
```

A request cannot authorize itself through circular history.

## Formal properties to pursue in the paper

### P1 — Mission non-amplification

No reachable task state authorizes a protected effect outside `M`.

### P2 — Causal authority provenance

Every non-root dynamically authorized resource has a derivation path to verified authorized output or a valid selection witness rooted in authorized execution.

### P3 — No request self-authorization

An agent-supplied request value cannot become dynamic authority solely because it appeared in request history.

### P4 — Selection soundness

If a witness authorizes `r`, then `r` belongs to the evidenced candidate set and satisfies the declared selector over the evidence required by that selector.

### P5 — Ambiguity fail-closed

For selectors that require a unique winner, ties or incomplete measurements do not produce generalized selection authority.

### P6 — Counterfactual selector consistency

If evidence changes and a different unique resource satisfies the same selector, the selector relation can authorize the new resource without recompilation from its concrete identifier.

### P7 — Cross-task non-transferability

Evidence or derived authority from one Task Lease cannot be replayed to expand another Task Lease.

The manuscript should prove a small, defensible subset rigorously rather than list many informal properties.

## Threat model

### Adversary can

- choose malicious tool arguments;
- reorder or repeat effects;
- substitute resources;
- transplant identifiers across tasks;
- select an unrelated candidate from legitimate output;
- use request history for circular authorization attempts;
- replay stale or cross-task evidence;
- exploit ties or incomplete selector evidence;
- omit prerequisite measurements;
- combine independently valid values into an unauthorized tuple;
- inject adversarial content into tool-visible environments.

### Trusted computing base

The paper must identify trust in:

- Mission construction and approved root authority;
- the authorization reference monitor;
- the provider adapter/enforcement boundary;
- execution-evidence integrity;
- reviewed authority extractors;
- selection-witness implementations;
- schema metadata used to project effect arguments.

Current evidence is not cryptographic remote-provider attestation.

## Completed evaluation program

### E1 — 60-task deterministic cohort

AgentDojo `0.1.35`, benchmark `v1.2.2`, all 60 user tasks with protected mutations in Slack, Banking, Workspace, and Travel.

Primary complete result:

- 60/60 reference executions preserved;
- 36/36 evidence-consistent counterfactuals accepted;
- 1/36 accepted by exact-trace baseline;
- 370/370 corrected mutants blocked.

### E2 — Provider-boundary adversarial families

Constructed and blocked:

- 60 field/resource substitutions;
- 60 premature/reordered effects;
- 60 repeated effects;
- 46 exact cross-task transplants;
- 4 wrong-selector candidates.

Total: **230/230 blocked, 0 malicious provider reaches**.

### E3 — DeepSeek V4 Pro live evaluation

The intended frozen plan contained 5,088 task-runs across four suites and three trials.

The primary zero-error gate failed because the paid evaluation did not complete.

Attempt 3 exposed adaptive YAML serialization failure and later balance exhaustion. Attempt 4 fixed delivery plumbing without changing the authority mechanism, then stopped when the DeepSeek account returned `402 Insufficient Balance`.

Use the matched Attempt-4 Slack slice as partial live evidence. Use Attempt 3 only as supplementary canonical-attack replication.

See `PAPER_RESULTS_DRAFT.md` and `LIVE_EVAL_ATTEMPTS.md` for exact numbers and wording.

## Negative result to preserve

V1 falsifies the idea that a single successful execution trace can be copied directly into the exact semantic authorization policy.

A trace can contain:

- incidental timestamps;
- arbitrary formatting;
- free text choices;
- demonstration-specific narrowing;
- values that conflict with the user's explicit request.

`travel-4` and `travel-7` provide concrete calendar-time examples.

The next research direction is a **semantic authority envelope** that classifies values as:

- required constants;
- bounded/ranged values;
- evidence-derived values;
- selection-derived values;
- incidental/free execution choices.

## Required baseline and ablation work for a stronger journal paper

V1 does not complete this matrix. Community or paper-extension work should compare, where fair and reproducible:

- broad standing/provider authority;
- exact trace/static allowlist;
- field-wise policies;
- provenance-only dynamic authority;
- output-evidence authority without selection witnesses;
- output evidence plus selection witnesses.

Important ablations include:

1. remove state/history;
2. remove output provenance;
3. permit request provenance;
4. treat candidate membership as authority;
5. remove selection witnesses;
6. remove tuple/correlation relations;
7. remove cardinality ceilings;
8. remove precedence constraints;
9. remove fail-closed static fencing;
10. permit incomplete selector evidence.

Do not fabricate quantitative comparisons to systems that cannot be reproduced.

## Metrics

Primary:

- benign task completion / secure utility;
- unauthorized protected effect rate at provider boundary;
- block rate by adversarial family;
- counterfactual acceptance;
- selector correctness under changed evidence;
- task-specific exception count.

Secondary:

- lineage precision/recall;
- false step-up/static-fence rate;
- decision latency;
- policy size;
- evidence storage;
- user approval count;
- selector coverage by family.

Keep attempted model behavior separate from successful provider effects.

## Paper structure

Recommended manuscript structure:

1. Introduction
2. Open-world task authority problem
3. Threat model and system model
4. Evidence-grounded dynamic authority
5. Candidate/selection separation and selection witnesses
6. Formal properties
7. Agent Authority implementation
8. Evaluation methodology
9. Deterministic and provider-boundary results
10. Partial live-model results
11. Negative results and failure analysis
12. Baselines and ablations
13. Limitations
14. Related work
15. Discussion and deployment implications
16. Conclusion

## Claim rules

The paper may strongly claim the complete deterministic/provider-boundary results.

The paper may report the partial DeepSeek result with its matched-scenario analysis.

The paper must **not** claim:

- that all 5,088 live runs completed;
- that the preregistered `scientific_go` gate passed;
- that all ungated out-of-policy effects were exact attacker-goal completions;
- that prompt injection is solved;
- that Attempt 4 provides live Workspace or Travel evidence;
- that V1 establishes multi-model robustness;
- that the current grammar is formally proven or minimal;
- that the 60-task development cohort is a held-out distribution.

## Paper readiness decision

**GO for manuscript drafting from the closed V1 evidence package.**

The next paper work is:

1. refresh the related-work novelty audit;
2. select a journal or conference and adopt its template;
3. formalize the smallest defensible set of properties;
4. build publication figures and tables from the frozen results;
5. decide whether additional baselines/ablations are required by the target venue.

Do not reopen V1 experimental collection merely because the original live matrix was incomplete. New experiments should answer a new scientific question.
