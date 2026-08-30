# Task Authority Evaluation

This document summarizes the reproducible task-contract evaluation. It is intentionally limited to measured authorization behavior and the system boundary described in `SECURITY_MODEL.md`.

## Evaluation scope

The deterministic cohort uses AgentDojo `0.1.35` / benchmark `v1.2.2` and includes all 60 user tasks in the evaluated suites that contain protected mutations across Slack, Banking, Workspace, and Travel.

The evaluation asks whether task-local authority can follow resources discovered during authorized execution while preserving the user's effect constraints, selection relation, ordering, cardinality, and tuple correlation.

## Frozen deterministic result

| Measure | Result |
| --- | ---: |
| Reference executions accepted | **60/60** |
| Evidence-consistent counterfactuals accepted | **36/36** |
| Single-trace field-wise comparator counterfactuals accepted | **1/36** |
| Corrected adversarial mutants blocked | **370/370** |
| Exact cross-task transplant audit | **33/33 blocked** |
| Provider-boundary malicious trajectories | **230/230 blocked** |
| Malicious protected effects reaching provider | **0** |

The provider-boundary family includes resource substitution, premature/reordered effects, repeated effects, exact cross-task transplants, and wrong-selector candidates.

## Explicit comparator matrix

The extended offline matrix evaluates 60 reference executions, 36 evidence-consistent changed-evidence executions, and 385 primary adversarial traces.

| Policy | Legitimate accepted | Primary attacks blocked |
| --- | ---: | ---: |
| **Agent Authority — full** | **96/96** | **385/385** |
| standing action authority | 96/96 | 60/385 |
| output provenance without selection witnesses | **96/96** | 383/385 |
| request/output provenance | 96/96 | 337/385 |
| single-trace field-wise value allowlist | 61/96 | 252/385 |

The full policy and output-provenance comparator have identical legitimate acceptance. Their difference is isolated at the selection boundary: the full policy blocks both generated wrong-selector cases, while provenance membership alone authorizes both.

For request self-authorization, the full policy blocks all 46 probes while request/output provenance authorizes all 46.

## Structural ablations

Removing individual constraints exposes the corresponding behavior:

| Removed premise | Exposed behavior |
| --- | ---: |
| cardinality | **60/60** repeated effects authorized |
| precedence | **24/59** reorder mutants authorized |
| tuple/correlation relation | **12/12** cross-product tuples authorized |
| request non-derivation | **46/46** request self-authorization probes authorized |
| selection witness | **2/2** wrong observed selector candidates authorized |

These checks demonstrate that protected-effect authority is relational and stateful rather than a simple action/value allowlist.

## Post-freeze stress suite

Eight task structures were written after the mechanism freeze without changing the frozen compiler/runtime. They exercise prefix selection, maximum/minimum selection, changed winners, ties, incomplete measurements, output-derived resources, request self-authorization, arithmetic derivation, tuple preservation, cardinality, precedence, and effect-ceiling escape.

| Policy | Legitimate accepted | Attacks blocked |
| --- | ---: | ---: |
| **Agent Authority — full** | **13/13** | **13/13** |
| standing action authority | 13/13 | 1/13 |
| output provenance without selection witnesses | 13/13 | 7/13 |
| request/output provenance | 13/13 | 6/13 |
| no cardinality | 13/13 | 12/13 |
| no precedence | 13/13 | 12/13 |
| no tuple/correlation relation | 13/13 | 12/13 |
| unrestricted dynamic fields | 13/13 | 4/13 |
| single-trace field-wise value allowlist | 8/13 | 6/13 |

This suite is a regression/stress set for the frozen mechanism; it is not presented as an independently authored benchmark.

## Provider-boundary evaluation

The frozen provider-boundary suite constructs 230 malicious trajectories:

| Family | Cases | Blocked | Provider reaches |
| --- | ---: | ---: | ---: |
| field/resource substitution | 60 | 60 | 0 |
| premature/reordered effect | 60 | 60 | 0 |
| repeated effect | 60 | 60 | 0 |
| exact cross-task transplant | 46 | 46 | 0 |
| wrong selector candidate | 4 | 4 | 0 |
| **Total** | **230** | **230** | **0** |

The security event measured here is whether a policy-unauthorized protected mutation crosses the provider boundary.

## Live-model sample

A completed matched DeepSeek V4 Pro Slack slice contains 372 attacked scenarios that completed in both ungated and gated conditions.

| Measure | Ungated | Gated |
| --- | ---: | ---: |
| matched attacked scenarios | 372 | 372 |
| scenarios with unauthorized protected effect | 40 | 0 |
| unauthorized protected effects | 61 | 0 |
| utility | 84.41% | 82.26% |

This sample demonstrates that model-generated out-of-policy provider effects occur in executable trajectories and can be stopped at the provider boundary. It is not used as a substitute for the deterministic coverage above.

Machine-readable summaries and immutable artifact identifiers are retained under `artifacts/` and `ARTIFACT_MANIFEST.md`.

## Authorization overhead

On the recorded Linux CI host using Node.js `v22.23.2`, 12,000 authorization decisions over repeated passes of the 60-task reference cohort measured:

| Metric | Time |
| --- | ---: |
| mean | **18.407 µs** |
| median | **8.223 µs** |
| p95 | **68.772 µs** |
| p99 | **228.509 µs** |

The median full 60-task authorization pass was **985.575 µs**. Median contract compilation over the 60 tasks was **43.124 µs**.

These are CPU microbenchmarks for authorization logic. Provider, model, network, storage, and human-approval latency are outside this measurement.

## Reproduce offline

Requirements:

- Node.js 20+;
- Python 3.11;
- the pinned AgentDojo dependency in `../agentdojo/requirements.txt`.

Install dependencies:

```bash
python -m pip install -r benchmarks/agentdojo/requirements.txt
npm install
```

Build the 60-task cohort:

```bash
python benchmarks/task-contracts/survey-agentdojo-coverage.py > /tmp/agentdojo-coverage.json
node benchmarks/task-contracts/build-agentdojo-expanded-cohort.mjs \
  /tmp/agentdojo-coverage.json \
  /tmp/agentdojo-cohort.json
```

Run the frozen strict gate and exact-transplant audit:

```bash
node benchmarks/task-contracts/run-strict-automatic-contract-pilot.mjs \
  /tmp/agentdojo-cohort.json > /tmp/strict.json
node benchmarks/task-contracts/run-exact-transplant-audit.mjs \
  /tmp/agentdojo-cohort.json > /tmp/transplants.json
node benchmarks/task-contracts/validate-expanded-strict-gate.mjs \
  /tmp/strict.json /tmp/transplants.json
```

Run the explicit comparators and stress suite:

```bash
node benchmarks/task-contracts/run-evaluation-baselines.mjs \
  /tmp/agentdojo-cohort.json
node benchmarks/task-contracts/run-evaluation-stress.mjs
node benchmarks/task-contracts/benchmark-authorization-overhead.mjs \
  /tmp/agentdojo-cohort.json 200
```

The default evaluation path is offline and does not require paid model APIs.
