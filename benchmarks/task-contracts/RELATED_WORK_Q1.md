# Related-Work Novelty Audit for Publication

Audit date: **2026-08-30**

Purpose: force the paper's novelty claim to confront the closest current work directly. This is a positioning document, not a claim that the repository contains faithful reimplementations of the external systems below.

## Narrow contribution claim

Agent Authority should **not** claim novelty for task scoping, least privilege, capabilities, provenance tracking, task alignment, stateful authorization, or prompt-injection defense in isolation.

The defensible contribution is narrower:

> When authorized execution discovers multiple legitimate candidate resources, observation provenance is insufficient to authorize a later protected effect on one candidate. Agent Authority separates candidate discovery from **selection authority** and requires a deterministic selection witness over task-rooted predicates and complete authorized evidence before dynamic authority is granted to the selected resource, while protected effect types remain under a fixed Mission ceiling.

This claim is strongest when paired with the Slack-13 falsification, the formal selection-soundness result, the provenance-only baseline, and the post-freeze held-out wrong-candidate tests.

## Closest systems

| Work | Relevant mechanism/result | Overlap with Agent Authority | Distinction the manuscript must defend |
| --- | --- | --- | --- |
| **CaMeL — Defeating Prompt Injections by Design** (Debenedetti et al., arXiv:2503.18813, 2025) | Extracts control/data flow from the trusted query and uses capabilities to prevent unauthorized data flows; reports provably secure execution on a subset of AgentDojo. | Structural security around a compromised LLM; capability-style reasoning; AgentDojo evaluation. | Agent Authority focuses on the provider-effect authorization question that remains after legitimate discovery: which one of several observed resources is authorized for mutation. A faithful CaMeL comparison requires its execution/program representation; this repo therefore does not label an internal trace comparator as “CaMeL.” |
| **MiniScope — A Least Privilege Framework for Authorizing Tool Calling Agents** (Zhu et al., arXiv:2512.11147, 2025) | Reconstructs permission hierarchies and combines them with a mobile-style permission model; reports low runtime overhead and stronger permission minimization than its LLM baseline. | Least privilege for tool-calling agents; dynamic authorization structure. | MiniScope primarily minimizes permissions/capabilities. Agent Authority's paper must show that permission minimization alone does not establish a task-selected winner among several legitimately visible candidates. |
| **Task Shield — Enforcing Task Alignment to Defend Against Indirect Prompt Injection in LLM Agents** (Jia et al., ACL 2025, DOI 10.18653/v1/2025.acl-long.1435) | Test-time mechanism checks whether instructions/tool calls contribute to the user objective; reports AgentDojo attack/utility results. | User-intent/task alignment and tool-call mediation. | Agent Authority is a deterministic provider-effect authority layer, not a semantic action-alignment classifier. Its contribution is the resource-selection proof obligation and fixed effect ceiling, not general task-alignment detection. |
| **Agent-Sentry — Bounding LLM Agents via Execution Provenance** (Sequeira et al., arXiv:2603.22868, 2026) | Learns behavioral bounds and execution provenance from traces and blocks deviations/misalignment; reports >90% prevention of out-of-bounds attacks with high utility. | Trace/provenance-based bounding of agent behavior. | Agent Authority provides an explicit counterexample to “observed/learned provenance implies selected authority.” Its selector relation is evaluated over current authorized evidence rather than accepting candidate membership or similarity to learned traces. |
| **RACG / ContractGuard line** (Iyer & Babu, arXiv:2606.13884 and arXiv:2606.18550, 2026) | Explores risk/capability gating and, in ContractGuard, the integrity of the contracts on which structural tool gating relies. | Structural gating, tool exposure/authority, trusted contract boundary. | Agent Authority should position selection witnesses as a complementary authorization relation inside a permitted effect/tool envelope: even when the tool is admissible and its contract is trusted, the runtime must still justify the concrete selected resource/tuple. Because the external mechanism differs substantially, no internal evaluator is presented as a faithful RACG reproduction. |

## Why the provenance-only comparator matters

The publication extension includes an internal **output-provenance without selection witnesses** comparator. It is intentionally generic and should be described exactly that way.

It answers a narrow scientific question:

> If we preserve the same action ceiling, static fields, cardinality, order, tuple constraints, and allowed evidence source actions, but replace deterministic selection witnesses with “the candidate appeared in authorized output,” what attacks become possible?

This comparator isolates the paper's proposed contribution more cleanly than claiming to reproduce an external architecture whose execution model differs.

The complementary **request/output provenance** comparator tests the circularity failure mode in which an agent can try to authorize its own chosen value by first placing it in request history.

## External threat taxonomy anchor

The publication evaluation should map its adversarial families to the **OWASP Top 10 for Agentic Applications 2026** rather than presenting only an internally authored taxonomy.

Relevant OWASP categories include:

- **ASI01 — Agent Goal Hijack:** canonical/adaptive prompt-injection trajectories that redirect the model's intended action path;
- **ASI02 — Tool Misuse & Exploitation:** wrong-resource substitution, repeated effects, premature effects, tuple cross-products, and misuse of otherwise legitimate mutation tools;
- **ASI03 — Identity & Privilege Abuse:** cross-task or cross-resource authority transplants that attempt to exploit broader account access than the task grants;
- **ASI06 — Memory & Context Poisoning:** malicious external/tool-visible content used to influence later tool calls;
- **ASI10 — Rogue Agents:** the reference-monitor threat model in which the model is treated as compromised/confused and may intentionally request effects outside task authority.

This is a **coverage mapping**, not a claim that Agent Authority solves every threat in any OWASP category. In particular, supply-chain compromise, arbitrary code execution, inter-agent communication, human trust exploitation, and read-only/confidentiality failures remain outside V1's protected-effect scope.

## Publication comparison rules

1. Do not call the single-trace comparator an “exact trace” executor. The implementation is a **single-trace field-wise value allowlist**: it constrains projected values learned from one trace but does not reproduce the exact call sequence.
2. Do not label an internal comparator with an external system's name unless that system's semantics are actually reproduced.
3. Separate **semantic alignment** defenses from **authorization** defenses. They may be complementary rather than mutually exclusive.
4. Report the same utility/safety metrics for every internal baseline and ablation.
5. For external systems, compare threat model, trusted assumptions, policy derivation, enforcement point, supported dynamic authority, and published benchmark results; do not fabricate missing cross-benchmark numbers.

## References checked for this audit

- Debenedetti et al., *Defeating Prompt Injections by Design*, arXiv:2503.18813.
- Zhu et al., *MiniScope: A Least Privilege Framework for Authorizing Tool Calling Agents*, arXiv:2512.11147.
- Jia et al., *The Task Shield: Enforcing Task Alignment to Defend Against Indirect Prompt Injection in LLM Agents*, ACL 2025, DOI:10.18653/v1/2025.acl-long.1435.
- Sequeira et al., *Agent-Sentry: Bounding LLM Agents via Execution Provenance*, arXiv:2603.22868.
- Iyer & Babu, *Capability Minimization as a Safety Primitive: Risk-Aware Causal Gating for Least-Privilege LLM Agents*, arXiv:2606.13884.
- Iyer & Babu, *The Gate Is Only as Honest as Its Contracts: ContractGuard for the Contract Layer of Risk-Aware Causal Gating*, arXiv:2606.18550.
- OWASP GenAI Security Project, *OWASP Top 10 for Agentic Applications for 2026*, published 2025-12-09.
- OWASP GenAI Security Project, *Solutions Landscape — Red Teaming Taxonomy*, published 2026-06-28.
