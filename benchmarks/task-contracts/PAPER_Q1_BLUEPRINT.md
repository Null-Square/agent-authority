# Q1 Paper Blueprint — Selection Witnesses for Open-World Agent Authorization

Status: submission-shaped source plan over the frozen V1 evidence plus the publication extension.

## Candidate title

**Selection Witnesses for Open-World Agent Authorization: When Provenance Is Not Authority**

Alternative:

**Observation Is Not Authorization: Selection Witnesses for Dynamic Agent Authority**

## One-sentence thesis

A secure tool-using agent may legitimately observe many resources during a task, but a protected effect on one resource should become authorized only when task-rooted evidence proves that the resource is the one selected by the user's predicate.

## Draft abstract

Tool-using language-model agents often need to discover concrete resources only after execution begins. Granting standing account authority is over-broad, but freezing authorization to one successful trace is too restrictive when legitimate evidence changes. A further problem remains even when execution provenance is trusted: an authorized read may reveal multiple candidate resources, and observing a candidate does not establish that the user's task selected it for a later mutation. We call this distinction **selection authority**. We present Agent Authority, a stateful provider-effect reference monitor in which concrete resource authority may grow from verified authorized evidence while protected effect types remain under a fixed Mission ceiling. For ambiguous candidate sets, dynamic authority is granted only through deterministic selection witnesses that verify task-rooted predicates over the required evidence and fail closed on ties or incomplete measurements. We formalize the mechanism and prove Mission non-amplification, no request self-authorization, selection soundness, ambiguity fail-closed behavior, and cross-task non-transferability under explicit mediation and evidence-integrity assumptions. On a frozen 60-task AgentDojo development cohort, the full policy preserves 96/96 reference and changed-evidence executions while blocking 385/385 publication-primary adversarial traces. An otherwise structurally matched output-provenance policy preserves the same utility but authorizes both wrong observed selector candidates; permitting request provenance authorizes all 46 request self-authorization probes. On eight post-freeze author-generated task structures, the frozen mechanism preserves 13/13 legitimate executions and blocks 13/13 attacks while targeted ablations expose selection, cardinality, precedence, and tuple failures. The original provider-boundary evaluation blocks 230/230 constructible malicious trajectories with zero malicious provider reaches. A partial DeepSeek V4 Pro Slack evaluation provides live-model case-study evidence: among 372 matched attacked scenarios, ungated execution produces 61 policy-unauthorized protected effects across 40 scenarios whereas gated execution produces none. These results support selection witnesses as a distinct authorization primitive for open-world agent effects; they do not establish general prompt-injection prevention, automatic intent compilation, or broad multi-model robustness.

## Contributions

The introduction should make exactly four contribution claims.

1. **Problem/formal distinction — selection authority.** We isolate a failure mode not resolved by simple observation provenance: authorized execution can reveal multiple legitimate candidates, but candidate membership is not evidence that the task selected that candidate for mutation.

2. **Mechanism — evidence-grounded dynamic authority under a fixed effect ceiling.** The reference monitor allows concrete task-local resource facts to grow only from trusted roots, verified authorized output, or deterministic selection witnesses; request occurrence does not derive authority.

3. **Formal result.** Under explicit complete-mediation, Mission-integrity, evidence-integrity, witness-correctness, and task-isolation assumptions, the system satisfies Mission non-amplification, no request self-authorization, selection soundness, ambiguity fail-closed behavior, and cross-task non-transferability.

4. **Falsification-oriented evaluation.** We compare full selection authority with structurally explicit weaker policies and targeted ablations, preserve changed-evidence utility, test post-freeze task structures, measure provider-boundary effects and CPU overhead, and retain a partial live-model case study without presenting it as the primary experiment.

Do not add “prompt injection defense” as a fifth contribution.

## Research questions

**RQ1 — Selection necessity.** Does authorized observation of a candidate suffice to authorize a later protected effect on that candidate?

**RQ2 — Dynamic utility.** Can a fixed relation over authorized evidence permit a different legitimate winner/value when evidence changes without recompilation from the old concrete identifier?

**RQ3 — Structural necessity.** Which security properties are lost when selection witnesses, request non-derivation, cardinality, precedence, or tuple correlation are removed?

**RQ4 — Generalization.** Does the frozen mechanism preserve utility and safety on post-freeze task structures not used during grammar development?

**RQ5 — Provider-boundary relevance.** Do adversarial model trajectories actually produce out-of-policy protected effects that a provider-boundary authority layer can prevent?

## Recommended paper structure

### 1. Introduction

Open with one concrete candidate-selection example, not the DeepSeek balance failure and not a generic prompt-injection paragraph.

Suggested running example:

1. user asks: “message the user with the highest total message count”;
2. authorized reads reveal Alice, Bob, and Charlie;
3. Alice is legitimately observed;
4. Charlie is the unique aggregate winner;
5. provenance-only authorization permits Alice, even though the task selected Charlie;
6. a selection witness authorizes Charlie only after complete measurements establish the unique winner.

End the introduction with the four contributions above.

### 2. Problem and threat model

Define protected provider effects and explain why the model is untrusted at the mutation boundary.

Separate:

- effect authority: which mutation types may occur at all;
- resource/value authority: which concrete targets/arguments may be used;
- observation provenance: where a value was seen;
- selection authority: why that value is the task-selected value.

State A1–A5 up front and discuss deployment consequences of violating each assumption.

### 3. Why provenance is insufficient

Present two minimal counterexamples:

- multi-candidate authorized output;
- request self-authorization/circularity.

Use the Slack-13 falsification as the empirical motivation after the abstract examples.

### 4. Agent Authority model

Present `M`, `A_t`, `H_t`, `C`, `P`, `E`, `S(P,C,E)` and the authorization transition.

Explain that resource facts may grow while effect types do not.

### 5. Selection witnesses

Define:

- prefix uniqueness;
- max/min cardinality;
- aggregate frequency;
- fail-closed ties;
- completeness requirements;
- static fence fallback.

Include one algorithm box for witness evaluation and one diagram for authority derivation.

### 6. Formal properties

Promote Theorems 1–5 from `FORMAL_MODEL.md` into the manuscript.

The main theorem to emphasize is selection soundness. Mission non-amplification and request non-derivation establish the surrounding reference-monitor invariants.

Do not claim arbitrary semantic selector completeness.

### 7. Implementation

Describe:

- provider/action schema projection;
- evidence bindings;
- state/history;
- selector verifier implementation;
- tuple/cardinality/precedence enforcement;
- provider-boundary gate;
- frozen V1 mechanism and artifact integrity.

Keep product/API details out unless needed for reproducibility.

### 8. Evaluation methodology

Subsections:

1. frozen 60-task AgentDojo development cohort;
2. internal comparator semantics;
3. adversarial families and OWASP mapping;
4. post-freeze author-generated stress suite;
5. provider-boundary families;
6. partial live-model case study;
7. overhead methodology.

Explicitly distinguish development, post-freeze, and independent evidence. There is no independent third-party held-out set in the current package.

### 9. Main results

Lead with a table comparing the internal policies, not the DeepSeek experiment.

#### Table 1 — utility/safety comparison

| Policy | Legitimate | Attacks blocked |
| --- | ---: | ---: |
| full Agent Authority | **96/96** | **385/385** |
| standing action | 96/96 | 60/385 |
| output provenance | 96/96 | 383/385 |
| request/output provenance | 96/96 | 337/385 |
| single-trace field-wise value allowlist | 61/96 | 252/385 |

Immediately explain that output provenance differs from full authority on exactly the two generated wrong-selector probes while preserving identical legitimate acceptance.

#### Table 2 — ablations

Report family-specific exposure rather than only aggregate rates:

- no cardinality → 60/60 repeats authorized;
- no precedence → 24/59 reorder mutants authorized;
- no tuples → 12/12 cross-products authorized;
- request provenance → 46/46 self-auth probes authorized;
- output provenance without selection → 2/2 wrong candidates authorized.

#### Table 3 — post-freeze suite

Full policy: 13/13 legitimate; 13/13 attacks blocked. Include weaker policy results and explicitly label authorship.

#### Table 4 — provider-boundary and live case study

Keep the 230/230 end-to-end deterministic result and the partial 372 matched DeepSeek case study separate.

### 10. Related work

Organize by mechanism, not by paper chronology:

- structural prompt-injection defenses/control-flow systems: CaMeL;
- least-privilege tool authorization: MiniScope;
- semantic task-alignment defenses: Task Shield;
- learned trace/provenance bounding: Agent-Sentry;
- causal/tool-exposure gating and contract integrity: RACG/ContractGuard;
- classic capability, information-flow, reference-monitor, and authorization concepts.

The novelty paragraph should say:

> These systems motivate structural confinement, least privilege, task alignment, provenance, and trusted tool contracts. Our narrower question arises after a tool/read is already legitimate: when it returns several candidate resources, what evidence authorizes one candidate for a later protected effect? Agent Authority treats candidate membership as insufficient and requires a deterministic witness for the task selection relation.

Do not claim prior systems cannot represent selection authority unless their formalism has been checked carefully. Claim instead that the paper isolates and evaluates this relation explicitly.

### 11. Limitations and negative results

Preserve all uncomfortable facts:

- single live model family/partial Slack slice;
- post-freeze set author-generated;
- proof assumptions and no machine checking;
- no arbitrary natural-language intent compiler;
- protected effects only;
- exact trace/value over-constraint negative result;
- dependence on complete evidence for selection;
- concurrent/paginated provider evidence as an open systems problem;
- external systems not faithfully reproduced as baselines.

### 12. Conclusion

Conclude on the conceptual point, not the attack block percentage:

> Secure dynamic authority requires evidence not only of where a resource came from, but why that resource—not another observed candidate—is authorized for the effect.

## Figures required for submission

### Figure 1 — candidate observation vs selection authority

Left: authorized read returns A/B/C; provenance highlights all three; unsafe provenance-only mutation can target any candidate.

Right: task predicate + complete evidence → unique winner B → dynamic authority only for B.

### Figure 2 — reference-monitor architecture

User task/Mission → agent/model → reads/evidence → witness/authority state → protected provider gate → provider. Show the model and untrusted content outside the TCB; show Mission/evidence verifier/witness/gate inside.

### Figure 3 — authority transition

Show fixed `M` and growing `A_t`, emphasizing that concrete resource facts may grow while effect types remain bounded.

### Figure 4 — evaluation layers

Development cohort → post-freeze stress → provider-boundary → partial live case study. Visually prevent readers from conflating complete deterministic coverage with partial live coverage.

## Tables required for submission

1. threat model and trusted assumptions;
2. comparator semantics;
3. main 96/96 vs 385/385 matrix;
4. ablation family exposures;
5. post-freeze suite;
6. provider-boundary families;
7. live matched case study;
8. CPU overhead;
9. closest related-work mechanism comparison.

## Claims to avoid

Never write:

- “solves prompt injection”;
- “provably secure agent” without immediately delimiting the proven protected-effect model and assumptions;
- “held-out independent benchmark” for the post-freeze author-generated suite;
- “exact trace baseline” unless referring historically and clarifying the actual implementation;
- “CaMeL/MiniScope baseline” for an approximate internal policy;
- “multi-model robust”;
- “all attacks blocked” without naming the evaluated attack population;
- “zero overhead”;
- “automatic intent understanding.”

## Submission decision rule

The package is suitable for an external Q1-readiness review when:

- publication CI is green on the latest branch head;
- the freeze validator is green;
- `PUBLICATION_RESULTS.md` matches the machine-readable checkpoint;
- reviewer handoff exposes the known limitations rather than hiding them;
- the reviewer can reproduce all new quantitative tables without paid model calls.

A Q1 reviewer may still require an independently authored task/red-team set or one faithful external baseline. Those are the two most plausible remaining experimental blockers; they should be demanded only if the review explains which unresolved scientific uncertainty they address.
