# Q1 Paper Blueprint — Selection Authority for Open-World Agents

Status: **manuscript draft created**. The primary paper source is now `MANUSCRIPT_Q1.md`; this file is the editorial/production guide.

## Title

**Selection Authority for Open-World Agents: Authorizing the Chosen Resource at the Provider Boundary**

## Central thesis

> A resource can be legitimately observed on an authorized execution path and still be unauthorized for a protected effect. When a task selects one resource from several legitimate candidates, the authorization layer must verify the task's selection relation, not merely the candidate's provenance.

This is the novelty axis to preserve throughout the paper.

## Why this framing is strong

The August 2026 literature check surfaced SARA, which independently separates action induction from runtime execution authorization. The manuscript therefore does not compete on the broad claim that provenance and authorization are different. It makes the narrower and cleaner contribution:

**selection among multiple authorized candidates is itself an authorization relation.**

The strongest empirical isolation is:

- full Agent Authority: **96/96** legitimate accepted, **385/385** publication-primary attacks blocked;
- output provenance without selection witnesses: **96/96** legitimate accepted, but **2/2** wrong observed selector candidates authorized.

Identical utility plus a selection-specific security difference is the result to emphasize first.

## Abstract structure

The abstract in `MANUSCRIPT_Q1.md` follows this order:

1. open-world runtime discovery creates unknown concrete resource identifiers;
2. provenance does not distinguish among several legitimately observed candidates;
3. define selection authority;
4. present the fixed Mission ceiling + growing evidence-derived resource authority;
5. state the formal properties;
6. report the 96/96 versus 385/385 result and the provenance/request-provenance falsifications;
7. report post-freeze and provider-boundary results;
8. close with the conceptual principle.

Keep the abstract focused on completed deterministic evidence. The live case study belongs in the evaluation rather than carrying the headline.

## Introduction structure

Open with one concrete selector task:

> “Message the user with the highest total message count.”

Authorized reads return Alice, Bob, and Charlie. All three have valid provenance. Charlie is the unique aggregate winner. A provenance-only resource rule can authorize Alice even though the task selected Charlie.

From that example, define four terms:

- effect authority;
- resource/value authority;
- observation provenance;
- selection authority.

Then state the design problem: static literal authority rejects legitimate changed-evidence winners, while broad observation-derived authority lets the model choose among candidates.

End with exactly four contributions:

1. selection authority as a first-class resource authorization relation;
2. stateful evidence-derived resource authority under a fixed Mission effect ceiling;
3. theorem-backed security properties;
4. falsification-oriented evaluation with provenance baselines, structural ablations, post-freeze stress, provider-boundary enforcement, and overhead measurement.

## Recommended manuscript structure

### 1. Introduction

Lead with the multi-candidate counterexample and the 96/96 matched-utility falsification.

### 2. Problem Definition

Define protected provider effects, open-world runtime discovery, observation-versus-selection, request circularity, and the five reference-monitor assumptions.

Place the assumptions here as the **system contract**, not as a late defensive qualification.

### 3. Selection Authority

Define:

- `M`, fixed Mission effect ceiling;
- `A_t`, growing task-local resource authority;
- `C`, candidate set;
- `P`, task-rooted selector;
- `E`, required authorized evidence;
- `S(P,C,E)`, deterministic witness.

Make the invalid implication visually explicit:

`r ∈ C  ⇏  S(P,C,E)=r`.

### 4. System Design

Describe provider-boundary mediation, evidence binding, task-local history, cardinality, precedence, tuple correlation, and witness evaluation.

Use the architecture diagram before implementation detail.

### 5. Formal Properties

Promote the five results from `FORMAL_MODEL.md`:

1. Mission non-amplification;
2. request non-self-authorization;
3. selection soundness;
4. ambiguity/incomplete-evidence fail closed;
5. cross-task non-transferability.

Selection soundness is the central theorem. The others establish the reference-monitor invariants around it.

### 6. Implementation

Keep this section mechanical and reproducible. Explain the contract projection, evidence bindings, selector verifier, state/history, tuple/cardinality/precedence checks, freeze manifest, and provider gate.

### 7. Evaluation

Use five RQs:

- RQ1: selection necessity;
- RQ2: changed-evidence utility;
- RQ3: structural necessity;
- RQ4: post-freeze behavior;
- RQ5: provider-boundary relevance.

Lead with the internal comparator table. Follow with changed-evidence utility, request circularity, structural ablations, post-freeze stress, provider boundary, live matched case study, and CPU overhead.

### 8. Related Work

Organize by mechanism rather than chronology:

- runtime authorization/action provenance — **SARA** first;
- authorization-sensitive model behavior — provenance-sensitivity audit;
- structural prompt-injection defenses — CaMeL;
- least privilege — MiniScope;
- semantic task alignment — Task Shield;
- execution provenance/behavioral bounds — Agent-Sentry;
- contract/capability gating — RACG/ContractGuard;
- attenuating delegation tokens.

The key novelty paragraph should say:

> Recent systems increasingly move security decisions outside the model and distinguish runtime evidence from execution authority. Agent Authority isolates a finer-grained authorization question: when an authorized execution returns several legitimate candidates, what proves that one candidate is the task-selected target? We model that proof obligation directly as `S(P,C,E)` and evaluate it against a structurally matched provenance-only policy.

### 9. Design Implications

Use this section to generalize the contribution positively:

- authorization policies are often relations, not independent value sets;
- dynamic authority does not require broad standing authority;
- evidence completeness is part of selector authorization;
- provider-boundary mediation composes with upstream defenses;
- deterministic witnesses are compact auditable proof objects.

### 10. Conclusion

End on the conceptual claim:

> For dynamic agent effects, authority must capture not only where a resource came from, but why that resource is the one the task chose.

## Figures

The current manuscript contains three Mermaid figures that render directly on GitHub.

### Figure 1 — Observation provenance versus selection authority

Authorized read returns three candidates. Provenance marks all as legitimate. The selector witness authorizes only the unique task-selected winner.

**Purpose:** make the core contribution understandable in one glance.

### Figure 2 — Provider-boundary architecture

User task/Mission and the LLM feed the Agent Authority gate. Verified provider output enters task-scoped evidence. The witness verifier derives dynamic authority. Protected effects execute only after the gate.

**Purpose:** show that the model proposes but the trusted monitor authorizes.

### Figure 3 — Fixed effect ceiling, growing resource authority

Show `M` unchanged across task states while `A_t` grows from roots, verified evidence, and selection witnesses.

**Purpose:** visualize dynamic least privilege without effect amplification.

For a camera-ready version, redraw these three diagrams as vector figures while preserving their semantics and labels.

## Main tables

### Table 1 — Policy comparison

| Policy | Legitimate | Attacks blocked |
| --- | ---: | ---: |
| **Agent Authority — full** | **96/96** | **385/385** |
| standing action authority | 96/96 | 60/385 |
| output provenance | **96/96** | 383/385 |
| request/output provenance | 96/96 | 337/385 |
| single-trace field-wise value allowlist | 61/96 | 252/385 |

The prose immediately after this table should focus on the full-vs-output-provenance pair.

### Table 2 — Structural ablations

Report the isolated exposures:

- no cardinality → 60/60 repeats authorized;
- no precedence → 24/59 reorder mutants authorized;
- no tuples → 12/12 cross-products authorized;
- request provenance → 46/46 self-authorization probes authorized;
- output provenance without selection → 2/2 wrong candidates authorized.

### Table 3 — Post-freeze structures

Full policy: 13/13 legitimate accepted and 13/13 attacks blocked. Show weaker policies in the same table.

### Table 4 — Provider boundary

Lead with 230/230 malicious trajectories blocked and zero malicious provider reaches.

### Table 5 — CPU overhead

Median authorization decision: 8.223 µs; p95 68.772 µs; p99 228.509 µs.

## Precision rules

Use these rules to keep the paper strong and difficult to attack:

1. Claim novelty for **selection authority**, not for generic least privilege, provenance tracking, or the broad action-induction/execution-authorization split.
2. Describe SARA as the closest current runtime-authorization neighbor.
3. Describe internal baselines by their actual semantics, not by external system names.
4. Use **single-trace field-wise value allowlist**, not “exact-trace baseline.”
5. State the reference-monitor assumptions once in the problem definition and build the theorems from them.
6. Keep the live model result as a supporting provider-boundary case study; do not let it dominate the abstract or contribution list.
7. Use completed evaluation populations with explicit denominators in every quantitative claim.
8. Emphasize relational policy structure: selection, tuple correlation, cardinality, and precedence.

## Submission production pass

Before venue formatting:

- convert Mermaid diagrams to publication-quality vector figures;
- convert numbered references to BibTeX and venue citation style;
- move reproducibility identifiers and full attack-family enumeration to the artifact appendix if page pressure requires;
- keep the selection example, main comparator table, formal selection theorem, and provider-boundary result in the main paper;
- verify every manuscript number against `PUBLICATION_RESULTS.md` and the latest green publication checkpoint.
