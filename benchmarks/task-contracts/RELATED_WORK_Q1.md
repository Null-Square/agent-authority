# Related-Work Novelty Audit for Publication

Audit date: **2026-08-30**

Purpose: keep the manuscript's novelty claim aligned with the closest current work, including papers released immediately before submission. This is a positioning document, not an external-system reimplementation report.

## Core novelty after the August 2026 literature check

The strongest contribution is **selection authority** at the protected-effect boundary.

Recent work already establishes several neighboring ideas: structural confinement, least privilege, task alignment, execution provenance, and—most recently—separating action induction from runtime execution authorization. The manuscript should therefore make a more precise claim:

> **Authorized observation is not selection authority.** When legitimate execution reveals several candidate resources, provenance can establish that every candidate came from an authorized path without establishing which candidate the user's task selected for a protected effect. Agent Authority makes that missing relation explicit: a concrete resource becomes dynamically authorized only when a deterministic selection witness proves that the task-rooted predicate selects that resource over the required authorized evidence.

This framing is stronger than a generic provenance-versus-authorization claim because it identifies a specific authorization obligation that remains even when the observation path itself is legitimate.

The paper's cleanest falsification is the structurally matched output-provenance comparator: both policies accept **96/96** legitimate executions, but provenance-only authorization permits **2/2** wrong observed selector candidates while the selection-witness policy blocks both.

## Closest systems

| Work | Relevant mechanism/result | Overlap with Agent Authority | Precise distinction for the manuscript |
| --- | --- | --- | --- |
| **SARA — When Tool Outputs Become Commands: Separating Action Induction from Runtime Authorization in Tool-Augmented LLM Agents** (Guo et al., arXiv:2608.27146, 2026) | Separates action induction from execution authorization; authorizes tool calls against the user objective and audited successful-execution evidence with goal-, chain-, and argument-level support; introduces No-History-Promotion; evaluates on AgentDojo and AgentDyn. | Very close enforcement philosophy: runtime mediation, audited execution evidence, argument-level authorization, and no promotion of mere historical occurrence into authority. | Agent Authority isolates a narrower relation inside argument authorization: **which member of a legitimately observed candidate set is selected by the task predicate**. The key counterexample does not rely on a malicious Observation becoming a command: all candidates may be legitimate outputs, yet only one is the unique max/min/prefix/aggregate winner. The manuscript should treat SARA as the closest neighboring runtime-authorization work and define selection witnesses as an explicit relational proof obligation rather than claim generic provenance/authorization separation as novel. |
| **Auditing Provenance Sensitivity in LLM Agent Action Selection** (Liao, arXiv:2607.20827, 2026) | Uses target-specific authorization labels and controlled provenance changes to test whether LLM action selection responds correctly to source authority; finds that source-authority cues do not reliably prevent unauthorized evidence from influencing decisions. | Strong empirical motivation for distinguishing evidence relevance from evidence authorization and for target-specific reasoning. | This work audits model behavior; Agent Authority enforces provider effects mechanically. Our additional focus is selection among several authorized candidates: source authorization can be correct for every candidate while the chosen target is still wrong under the task predicate. |
| **CaMeL — Defeating Prompt Injections by Design** (Debenedetti et al., arXiv:2503.18813, 2025) | Extracts control/data flow from the trusted query and uses capabilities to constrain unauthorized flows; reports provably secure execution on a subset of AgentDojo. | Structural security around a compromised LLM; capability-style reasoning; AgentDojo evaluation. | Agent Authority focuses on the provider-effect relation after legitimate discovery: a capability to consume an authorized result does not by itself identify the one candidate selected by a relational predicate. A faithful CaMeL comparison requires its program representation, so the repo does not label an internal trace comparator as “CaMeL.” |
| **MiniScope — A Least Privilege Framework for Authorizing Tool Calling Agents** (Zhu et al., arXiv:2512.11147, 2025) | Reconstructs permission hierarchies and combines them with a mobile-style permission model; mechanically minimizes tool permissions with low reported runtime overhead. | Least privilege for tool-calling agents; trusted enforcement outside the LLM. | MiniScope minimizes the permission envelope. Agent Authority addresses a finer-grained runtime question within a permitted tool/effect: which concrete resource/argument tuple is authorized after runtime discovery. |
| **Task Shield — Enforcing Task Alignment to Defend Against Indirect Prompt Injection in LLM Agents** (Jia et al., ACL 2025) | Test-time mechanism checks whether instructions and tool calls contribute to the user objective; reports AgentDojo attack/utility results. | User-intent/task alignment and tool-call mediation. | Agent Authority is a deterministic provider-effect authorization layer, not a semantic action-alignment classifier. Selection witnesses encode explicit resource-selection relations and fail closed on ambiguous or incomplete evidence. |
| **Agent-Sentry — Bounding LLM Agents via Execution Provenance** (Sequeira et al., arXiv:2603.22868, 2026) | Learns behavioral bounds and execution provenance from traces and blocks deviations or misalignment; reports strong attack prevention with high utility. | Trace/provenance-based bounding of agent behavior. | Agent Authority tests a case where provenance membership itself is insufficient: the wrong resource can appear in a fully authorized trace. The relevant authorization fact is the selector relation over current evidence, not trace membership alone. |
| **RACG / ContractGuard line** (Iyer & Babu, arXiv:2606.13884 and arXiv:2606.18550, 2026) | Explores capability/risk gating and integrity of the contracts that structural gating depends on. | Structural gating, tool exposure, authority, and trusted contract boundaries. | Selection witnesses are complementary inside a valid effect/tool envelope: even when the tool is admissible and its contract is trusted, the runtime must justify the concrete selected resource and any correlated argument tuple. |
| **Attenuating Authorization Tokens for Agentic Delegation Chains** (IETF Internet-Draft, 2026) | Encodes tool and argument constraints in attenuating task-scoped delegation tokens; descendants can narrow but not expand authority. | Task-scoped capabilities, argument constraints, and non-amplification. | Attenuation answers how delegated authority stays within a parent envelope. Agent Authority addresses how runtime evidence may instantiate a previously unknown concrete resource inside that envelope while preserving a task selection relation. |

## Why SARA sharpens rather than removes the contribution

SARA is important because it independently validates the need for a real execution-boundary authorization layer. Its abstract and problem statement distinguish action induction from execution authority and require independent support for actual arguments.

The manuscript should not compete on that general proposition. Instead it should ask a stricter question that SARA's broad framing makes natural:

> Suppose an argument value has legitimate runtime provenance and the tool/effect is already authorized. What additional evidence is required when the same authorized output exposes **multiple** candidate values?

A provenance rule such as “the target appeared in an authorized output” gives identical provenance status to every candidate. A task such as “message the user with the highest total message count” does not. It defines a relation over candidates and measurements. Agent Authority represents that relation explicitly and requires a deterministic witness for the unique winner.

This yields three concrete technical differences that the paper can defend without speculating about unsupported features in SARA:

1. **Relational selection object.** The formal model includes `S(P,C,E)`, a selector over a candidate set `C`, task-rooted predicate `P`, and required evidence `E`.
2. **Ambiguity/completeness semantics.** Unique-winner selectors fail closed on ties and missing required measurements rather than authorizing any observed candidate.
3. **Selection-specific falsification.** The output-provenance comparator preserves the full system's 96/96 legitimate acceptance yet authorizes both generated wrong-candidate probes; post-freeze tests separately exercise wrong winner, tie, and incomplete-measurement cases.

The novelty claim is therefore not “we first separate provenance from authorization.” It is:

> **We isolate, formalize, implement, and directly falsify selection authority as a resource-level authorization relation for dynamic agent effects.**

## Why the provenance-only comparator matters

The publication extension includes an internal **output-provenance without selection witnesses** comparator. It is intentionally generic and should be described exactly that way.

It answers a narrow causal question:

> If we preserve the same effect ceiling, static fields, cardinality, order, tuple constraints, and evidence-source actions, but replace deterministic selection witnesses with “the candidate appeared in authorized output,” what changes?

The result is unusually clean: legitimate acceptance remains **96/96**, while both wrong observed selector candidates become authorized. This comparison isolates the selection relation without confounding the result with a broader permission envelope or a different planning architecture.

The complementary **request/output provenance** comparator tests authorization circularity. It shows that accepting request occurrence as evidence allows the model to create authority for its own selected value: **46/46** request-self-authorization probes become authorized.

## External threat taxonomy anchor

The evaluation maps its adversarial families to the **OWASP Top 10 for Agentic Applications 2026** as an external threat-taxonomy anchor.

Relevant categories include:

- **ASI01 — Agent Goal Hijack:** injected trajectories that redirect an agent's intended action path;
- **ASI02 — Tool Misuse & Exploitation:** wrong-resource substitution, repeated effects, premature effects, tuple cross-products, and misuse of otherwise legitimate mutation tools;
- **ASI03 — Identity & Privilege Abuse:** cross-task or cross-resource authority transplants that exploit account access broader than the task grants;
- **ASI06 — Memory & Context Poisoning:** malicious tool-visible content that attempts to influence later effects;
- **ASI10 — Rogue Agents:** the reference-monitor model in which the agent may be compromised, confused, or adversarial at the protected-effect boundary.

This mapping describes where evaluated attack families sit in an external taxonomy. The paper's contribution remains the authorization mechanism and the selection-specific experiments.

## Publication comparison rules

1. Use **selection authority** as the primary novelty term.
2. Describe SARA as the closest current runtime-authorization neighbor and cite it directly.
3. Do not claim novelty for the generic distinction between action provenance and execution authority.
4. Do not call the single-trace comparator an “exact trace” executor. The implementation is a **single-trace field-wise value allowlist**: it constrains projected values learned from one trace but does not reproduce the exact call sequence.
5. Do not label an internal comparator with an external system's name unless that system's semantics are actually reproduced.
6. Separate semantic alignment defenses from deterministic authorization defenses; they are complementary layers.
7. Report the same utility and attack-blocking metrics for every internal baseline and ablation.
8. For external systems, compare threat model, policy object, evidence source, enforcement point, and granularity of runtime authorization. Do not fabricate cross-paper benchmark numbers.

## References checked for this audit

- Guo et al., *When Tool Outputs Become Commands: Separating Action Induction from Runtime Authorization in Tool-Augmented LLM Agents*, arXiv:2608.27146, 2026.
- Liao, *Auditing Provenance Sensitivity in LLM Agent Action Selection*, arXiv:2607.20827, 2026.
- Debenedetti et al., *Defeating Prompt Injections by Design*, arXiv:2503.18813, 2025.
- Zhu et al., *MiniScope: A Least Privilege Framework for Authorizing Tool Calling Agents*, arXiv:2512.11147, 2025.
- Jia et al., *The Task Shield: Enforcing Task Alignment to Defend Against Indirect Prompt Injection in LLM Agents*, ACL 2025, DOI:10.18653/v1/2025.acl-long.1435.
- Sequeira et al., *Agent-Sentry: Bounding LLM Agents via Execution Provenance*, arXiv:2603.22868, 2026.
- Iyer & Babu, *Capability Minimization as a Safety Primitive: Risk-Aware Causal Gating for Least-Privilege LLM Agents*, arXiv:2606.13884, 2026.
- Iyer & Babu, *The Gate Is Only as Honest as Its Contracts: ContractGuard for the Contract Layer of Risk-Aware Causal Gating*, arXiv:2606.18550, 2026.
- Niyikiza, *Attenuating Authorization Tokens for Agentic Delegation Chains*, IETF Internet-Draft, June 2026.
- OWASP GenAI Security Project, *OWASP Top 10 for Agentic Applications for 2026*, 2025.
