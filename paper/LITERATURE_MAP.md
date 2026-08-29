# Literature Map

Status: active related-work audit
Cutoff for this pass: **2026-08-29**

This file records the primary systems that the manuscript must compare against before making novelty claims. It is not the final Related Work prose.

## Comparison question

The paper's novelty question is not whether prior work provides least privilege, prompt-injection defenses, reference monitors, stateful authorization, provenance, capability systems, delegation, or task-scoped policy.

The narrower question is:

> Does prior work distinguish candidate discovery from selection authority for open-world task resources, and can it authorize a newly selected resource from authorized evidence while keeping effect authority under a fixed ceiling?

The final manuscript must make only source-supported comparisons.

## A. Agent prompt-injection benchmarks and task-alignment defenses

### AgentDojo

**Citation key:** `debenedetti2024agentdojo`

**Primary source:** arXiv:2406.13352; NeurIPS 2024 Datasets and Benchmarks.

**What it contributes:** dynamic benchmark for tool-using agents over untrusted data, with realistic tasks, injection tasks, attacks, defenses, utility, and security evaluation.

**Relationship to this paper:** evaluation substrate. Agent Authority changes the central security metric from only whether the model follows an injected goal to whether a protected provider effect outside task authority succeeds.

**Do not claim:** that AgentDojo itself is an authorization mechanism.

### Task Shield

**Citation key:** `jia2025taskshield`

**Primary source:** ACL 2025, DOI `10.18653/v1/2025.acl-long.1435`.

**What it contributes:** test-time task-alignment checking of instructions and tool calls against user objectives.

**Relationship:** close at the intent/alignment layer, but it reasons about whether actions serve the task rather than providing the same evidence-grounded resource-authority state transition and provider-effect contract.

## B. System-layer prompt-injection defenses

### CaMeL — Defeating Prompt Injections by Design

**Citation key:** `debenedetti2025camel`

**Primary source:** arXiv:2503.18813.

**What it contributes:** trusted-query control/data-flow extraction, isolation from untrusted data, and capability checks at tool calls. Its security argument is explicitly system-level rather than model-level.

**Relationship:** one of the closest conceptual neighbors. Both move security outside the LLM and use a capability/authority boundary. CaMeL focuses on trusted control/data flows and preventing unauthorized information flows. This paper focuses on task-local resource authority that may be acquired during execution and on proving why one observed candidate is the selected resource.

**Audit before submission:** verify whether the final CaMeL publication contains any selector/candidate semantics that narrow this distinction.

### Fides — Securing AI Agents with Information-Flow Control

**Citation key:** `costa2025fides`

**Primary source:** arXiv:2505.23643.

**What it contributes:** formal information-flow model, confidentiality/integrity labels, dynamic taint tracking, deterministic policy enforcement, and planner primitives.

**Relationship:** close on stateful evidence and deterministic enforcement. Different primary property: information-flow confidentiality/integrity rather than task-resource selection authority.

### Prompt Flow Integrity (PFI)

**Citation key:** `kim2025pfi`

**Primary source:** arXiv:2503.15547.

**What it contributes:** untrusted-data identification, least privilege, and unsafe prompt/data-flow validation for privilege-escalation defense.

**Relationship:** relevant to privilege control and provenance. The final comparison must determine whether PFI can express open-world selected-resource acquisition or only policy-constrained flow/privilege.

### IsolateGPT

**Citation key:** `wu2025isolategpt`

**Primary source:** NDSS 2025.

**What it contributes:** execution isolation for LLM applications, separating third-party apps and system components.

**Relationship:** architectural isolation boundary rather than task-local dynamic resource authorization.

### ACE — Abstract-Concrete-Execute

**Citation key:** `li2026ace`

**Primary source:** NDSS 2026; arXiv:2504.20984.

**What it contributes:** trusted abstract planning, concrete mapping, static validation of secure information-flow constraints, and execution-time data/capability barriers.

**Relationship:** strongly relevant because trusted abstract plans constrain later concrete execution. The final audit must explicitly compare ACE's concrete mapping with selection witnesses and identify whether the concrete resource is authorized by task-selection evidence or by a prevalidated plan structure.

## C. Privilege and authorization systems for agents

### Progent

**Citation key:** `shi2025progent`

**Primary source:** arXiv:2504.11703.

**What it contributes:** programmable privilege-control DSL, deterministic tool-call reference monitor, policy fallbacks, dynamic policy updates, and automatic LLM policy generation.

**Relationship:** closest direct privilege-control baseline. Both mediate tool calls outside the agent. Progent gives expressive programmable policies; Agent Authority investigates a narrower evidence-grounded task contract and the candidate-versus-selection distinction.

**Required comparison:** static/precomputed task policy versus task-local authority that acquires concrete resources from authorized execution evidence.

### Authenticated Delegation and Authorized AI Agents

**Citation key:** `south2025delegation`

**Primary source:** arXiv:2501.09674.

**What it contributes:** authenticated and auditable delegation, agent-specific credentials/metadata, OAuth 2.0 and OpenID Connect integration, and translation of natural-language permissions into access-control configurations.

**Relationship:** identity/delegation and protocol layer. Agent Authority intentionally does not claim a new identity protocol; it can sit below or alongside such delegation infrastructure.

### SAGA

**Citation key:** `syros2026saga`

**Primary source:** NDSS 2026; arXiv:2504.21034.

**What it contributes:** governance architecture, user-controlled agent lifecycle, inter-agent access-control policy, and cryptographically derived access-control tokens.

**Relationship:** multi-agent governance/delegation rather than the same within-task resource-selection problem.

### Bounded Agents

**Citation key:** `muruaga2026bounded`

**Primary source:** arXiv:2608.15888.

**What it contributes:** Agentic Principal Chain, accumulated session state, six authorization checks, delegation attenuation, composition checks, outside-model enforcement, formal monotonicity/composition properties, and broad benchmark evaluation.

**Relationship:** a very close 2026 authorization architecture. Its appearance makes a weak claim such as “first stateful agent authorization” indefensible. The manuscript must instead isolate selection authority as the candidate contribution.

**Required audit:** inspect the full paper for any mechanism equivalent to evidence-grounded candidate/selection separation or dynamic selector witnesses.

### aiAuthZ

**Citation key:** `kodathala2026aiauthz`

**Primary source:** arXiv:2607.05518.

**What it contributes:** off-host identity-bound authorization gateway, per-message authentication, role/argument-level policies, and tamper-evident audit receipts.

**Relationship:** reinforces the principle that a deceived model should not be the final authority. It focuses on caller identity and policy isolation rather than evidence-grounded selection among resources discovered during the task.

### AgentFlow

**Citation key:** `shivakumar2026agentflow`

**Primary source:** arXiv:2608.22868.

**What it contributes:** flow-centric policy language, labeled runtime edges, task-scoped capabilities, controlled release, stateful taint semantics, reference-monitor enforcement, and bounded SMT verification.

**Relationship:** extremely recent and relevant. It addresses stateful multi-step flows and task-scoped capabilities. Any final novelty statement must explicitly distinguish selection witnesses from AgentFlow's path/flow policy semantics.

## D. Classical foundations

The paper needs a short foundation paragraph rather than a long historical survey.

### Least privilege

**Citation key:** `saltzer1975protection`

Use to establish that minimizing standing authority is a classical systems principle, not a new contribution.

### Reference monitor

Use a canonical reference-monitor/security-kernel citation to establish the architectural pattern of complete mediation outside an untrusted subject.

### Capability attenuation / delegation

Include classic capability/delegation work only where it helps define the fixed effect ceiling and attenuation boundary. Do not claim novelty for monotonic delegation.

### History/state-based access control

Include representative history-based authorization work when formalizing why a sequence of individually plausible effects can violate a task contract.

## Related-work synthesis for the paper

The final Related Work section should be organized by security property, not as one paragraph per paper.

### 1. Model and task alignment

AgentDojo establishes the threat/evaluation setting. Task Shield checks whether actions remain aligned with the user's task. These approaches motivate the problem but do not remove the need for an independent provider-effect authority boundary.

### 2. System-level isolation and information flow

CaMeL, Fides, PFI, IsolateGPT, ACE, and AgentFlow constrain what untrusted data can influence or where information/capabilities can flow. They establish that security can be enforced structurally outside model reasoning.

### 3. Privilege, delegation, and authorization

Progent, authenticated delegation, SAGA, Bounded Agents, and aiAuthZ directly address agent authority, delegation, or privilege. They prevent the paper from making broad “first authorization layer” claims.

### 4. Remaining question

The paper should motivate a narrower gap:

> A task may need a resource whose identifier is not known at authorization time. Authorized execution may then reveal several candidates. Provenance can prove that each candidate was observed, but not that the user's task selected each candidate. The proposed selection witness binds dynamic authority to evidence that a unique candidate satisfies the task selector, while the Mission continues to bound effect types.

This claim remains a **candidate novelty statement** until the full texts of the closest 2026 systems, especially Bounded Agents and AgentFlow, are audited immediately before submission.

## Submission-time novelty gate

Before the abstract uses words such as `novel`, `first`, or `new`:

- [ ] audit the latest version of Bounded Agents;
- [ ] audit the latest version of AgentFlow;
- [ ] audit the final publication version of CaMeL;
- [ ] audit the latest Progent version;
- [ ] search 2026 literature for `agent authorization`, `task-scoped capability`, `dynamic authority`, `resource selection`, `reference monitor`, and `delegated authority`;
- [ ] remove any priority language that cannot survive that audit.
