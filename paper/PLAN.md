# Paper Plan — Computers & Security

Status: working manuscript plan
Target journal: **Computers & Security (Elsevier)**
Working format: official Elsevier `elsarticle` LaTeX class, `5p,times,twocolumn`
Working length target: **11–13 pages including references**, hard internal ceiling 15 pages
Research freeze: Agent Authority V1 closure on `main` at commit `c9b805d8c7348230772333d063d308a32830e66f`

## Working title

**Selection Witnesses for Open-World Agent Authorization: Evidence-Grounded Dynamic Authority Under a Fixed Effect Ceiling**

Short alternative:

**Selection Witnesses for Dynamic Agent Authority**

## Paper claim

The paper does not claim that prompt injection is solved.

The narrow claim is:

> A stateful provider-boundary authorization monitor can let task-local resource authority grow from authorized execution evidence while a fixed effect ceiling remains in force. When several resources are observed, provenance alone is insufficient: dynamic authority requires evidence that the task selected the resource. Deterministic selection witnesses provide such evidence for supported selectors and fail closed under ambiguity.

## Scientific story

1. Standing provider permissions are broader than a user task.
2. Task-scoped authorization becomes difficult when the concrete resource is unknown at task start.
3. A tempting rule — authorize any value observed in authorized execution — is unsound.
4. The `slack-13` counterexample falsifies that rule: an observed candidate was not the aggregate winner.
5. Selection witnesses separate **candidate discovery** from **selection authority**.
6. The provider-boundary runtime enforces the resulting stateful task contract before mutations execute.
7. Deterministic evaluation shows strong security with full reference utility.
8. Partial DeepSeek V4 Pro evidence shows the same boundary containing policy-unauthorized protected effects in the completed matched Slack slice.
9. A second negative result shows that exact successful traces over-constrain legitimate task semantics.
10. Future work is semantic authority envelopes, not another rerun of the closed paid matrix.

## Structure and page budget

| Section | Target pages | Purpose |
|---|---:|---|
| Title + abstract + highlights | 0.5 | State the problem, mechanism, evidence, and limitations |
| 1. Introduction | 1.25 | Problem, motivating failure, contributions |
| 2. Background and Related Work | 1.5 | Prompt injection, system defenses, privilege/authorization, IFC/delegation |
| 3. System and Threat Model | 1.0 | Trusted boundary, adversary, protected effect scope |
| 4. Evidence-Grounded Task Authority | 2.0 | Formal objects, provenance failure, selection witnesses, enforcement |
| 5. Methodology | 1.5 | AgentDojo cohort, mutants, provider-boundary attacks, live evaluation, metrics |
| 6. Results | 2.0 | Deterministic, provider boundary, live matched slice, negative result |
| 7. Discussion and Limitations | 1.0 | What result means, threats to validity, semantic envelopes |
| 8. Conclusion | 0.35 | Tight conclusion |
| References | 1.5–2.0 | Target 30–45 references |
| **Total** | **11.1–12.6** | Keep below 15 pages |

## Planned figures

All figure masters must be deterministic **SVG + HTML**. No image generation. PDF exports may be produced from the SVG masters only for LaTeX inclusion.

### Figure 1 — System and enforcement boundary

Purpose: show how Agent Authority sits between agent reasoning and provider effects.

Content:

```text
User task / Mission
        ↓
Task authority roots
        ↓
Agent reasoning ── tool/effect request ──→ Reference monitor
                                         │
                            stateful task contract
                                         │
                 ALLOW / STEP-UP / DENY decision
                                         │
                                         ↓
                                   Provider effect
                                         │
                                         ↓
                              execution evidence/output
                                         │
                              derive/select authority
                                         └────→ task state
```

The figure must visually separate:

- the untrusted/compromisable model;
- the trusted enforcement boundary;
- provider mutation;
- authorized evidence returning into task-local resource authority;
- the fixed Mission effect ceiling.

### Figure 2 — Observation provenance is not selection authority

Two-panel falsification figure.

Left: provenance-only failure.

```text
Authorized read → candidates [Alice, Charlie]
                         ↓
                 Alice was observed
                         ↓
             naive dynamic authority
                         ↓
                mutate Alice  ✗
```

Right: selection witness.

```text
Task predicate: argmax total messages
Candidates + complete authorized measurements
                         ↓
                 unique winner Charlie
                         ↓
                  selection witness
                         ↓
               authority(Charlie) ✓
```

Tie / incomplete measurement branches must visibly fail closed.

### Figure 3 — Formal authority-state transition

Show `M`, `A_t`, authorized effect `e_t`, evidence `σ_t`, output `o_t`, selector `S(P,C,E)`, and the transition to `A_(t+1)` while `Effects(A_t) ⊆ M` remains invariant.

### Figure 4 — Evaluation methodology

Required methodology figure.

Four layers:

1. frozen AgentDojo 60-task cohort;
2. contract synthesis / reference utility / counterfactuals;
3. deterministic mutant and provider-boundary attack families;
4. live DeepSeek gated-vs-ungated matched analysis.

The figure must distinguish completed evidence from incomplete paid evaluation and show that the primary live paired statistic uses only scenarios completed in both conditions.

### Figure 5 — Completed deterministic/provider-boundary results

Compact scientific result visual. Show:

- reference utility: 60/60;
- evidence-consistent counterfactuals: 36/36;
- exact-trace baseline: 1/36;
- corrected mutants blocked: 370/370;
- malicious provider-boundary trajectories blocked: 230/230;
- malicious provider reaches: 0.

Avoid decorative gauges. Prefer aligned bars/marks and direct labels.

### Figure 6 — Partial live DeepSeek matched result

Show the 372 matched attacked scenarios:

- unauthorized protected effects: 61 ungated vs 0 gated;
- scenarios with >=1 unauthorized protected effect: 40 vs 0;
- utility: 84.41% vs 82.26%;
- utility difference: 2.15 percentage points.

Add a visible scope note: **Slack-only completed slice; preregistered 5,088-run matrix incomplete**.

## Planned tables

### Table 1 — Related-system comparison

Columns should compare only claims supported by primary sources:

- enforcement outside model;
- task-scoped permissions;
- state/history dependence;
- dynamic resource acquisition;
- provenance tracking;
- deterministic resource selection evidence;
- fixed effect ceiling / monotonic property;
- provider-boundary evaluation.

Likely rows: CaMeL, Progent, Fides/IFC, Task Shield, IsolateGPT, SAGA, Authenticated Delegation, Bounded Agents, Agent Authority.

### Table 2 — Evaluation layers

Rows: 60-task deterministic cohort, corrected mutants, provider-boundary families, Flash pilot, V4 Pro Attempt 3, V4 Pro Attempt 4.

Columns: model involved, suites, denominator, purpose, scientific status, primary/supplementary.

### Table 3 — Provider-boundary attack families

Field/resource substitution, premature/reordered, repeated, exact cross-task transplant, wrong selector candidate.

### Table 4 — Live matched attack-family decomposition

Tool knowledge, cross-action, order/premature, repeat, transplant, selector-candidate.

## Methodology requirements

The methodology must explicitly state:

- AgentDojo version `0.1.35` / benchmark `v1.2.2`;
- why 60 mutation-bearing tasks are the deterministic cohort;
- how reference utility and evidence-consistent counterfactuals are defined;
- why exact-trace equality is a baseline rather than a correct semantic oracle;
- exact mutant construction and corrected denominator 370;
- provider-boundary attack construction and denominator 230;
- attack families and provider-reach metric;
- live experiment freeze and preregistered 5,088-run matrix;
- Attempt-3 YAML delivery defect;
- Attempt-4 evaluator-only delivery repair;
- account balance failure and non-random missingness;
- matched-pair key used for the live primary descriptive slice;
- no claim that every unauthorized effect is an exact attacker-goal completion;
- no claim of Workspace/Travel V4 Pro live coverage;
- exploratory paired statistics only because the preregistered full experiment did not complete.

## Statistical reporting

For the 372 matched attacked scenarios:

- ungated scenario rate: 40/372 = 10.75%;
- gated scenario rate: 0/372 = 0%;
- Wilson intervals may be reported descriptively;
- exact paired McNemar test is more natural than an unpaired Fisher test for matched data;
- any p-value must be labeled exploratory/descriptive because the preregistered matrix failed its zero-error completion gate.

Do not use statistical significance to hide the non-random Slack-only completion pattern.

## Related-work groups

1. Prompt-injection benchmarks and attacks: AgentDojo, InjecAgent, adaptive prompt injection.
2. Model/task-alignment defenses: Task Shield, detection/alignment methods.
3. System isolation and control-flow defenses: IsolateGPT, CaMeL, ACE.
4. Information-flow systems: Fides/IFC, classic IFC.
5. Privilege and authorization systems: Progent, Prompt Flow Integrity, authenticated delegation, SAGA, Bounded Agents.
6. Classical foundations: least privilege, reference monitors, capability attenuation, task-based authorization, history-based authorization.

## Paper integrity rules

Never claim:

- all 5,088 V4 Pro runs completed;
- preregistered `scientific_go` passed;
- prompt injection is solved;
- every ungated policy violation is an exact attacker-goal completion;
- multi-model V4 Pro robustness;
- broad held-out generalization;
- automatic natural-language intent compilation;
- formal soundness unless a proof is actually included.

The 60-task cohort was part of mechanism development. State this as development-domain evaluation.

## Submission packaging

Development sources may use subfolders in `paper/`.

Elsevier Editorial Manager does not process LaTeX source submissions with subfolders. Before submission, create a flattened `paper/submission/` export containing the `.tex`, `.bib`, style/class files if required, and figure export files at one directory level.

## Definition of manuscript-ready

- [ ] related-work audit complete and every comparison sourced;
- [ ] all six SVG/HTML figure masters complete;
- [ ] all figures export cleanly to vector PDF;
- [ ] manuscript compiles with official `elsarticle` class;
- [ ] 11–13 page working target met, <=15 pages including references;
- [ ] all V1 numbers trace to frozen repository artifacts;
- [ ] limitations include incomplete/non-random live evaluation;
- [ ] no future-work claim is presented as completed evidence;
- [ ] abstract and conclusion use the same claim boundary;
- [ ] submission bundle is flattened and reproducible.
