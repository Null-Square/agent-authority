# Task Authority Evaluation Harness

This directory contains the Agent Authority task-contract prototype and its reproducible evaluation harness.

The benchmark code is separate from the public package API under `src/`. It is used to test richer stateful authorization semantics over tool-execution traces and provider-boundary mutations.

## What is evaluated

The evaluator covers:

- fixed protected-effect ceilings;
- task-root value fences;
- action cardinality;
- precedence constraints;
- tuple/correlation constraints;
- evidence-derived values;
- arithmetic derivation;
- deterministic selection witnesses;
- task-scoped authority;
- fail-closed unresolved dynamic values.

A model request does not create authority merely by mentioning a value. Dynamic authority must descend from trusted roots, verified evidence, or a valid selection relation.

## Key result

The core evaluated distinction is:

> **Authorized observation is weaker than selection authority.**

If a legitimate read returns several candidate resources, provenance establishes that those resources were observed on an authorized path. It does not establish which one satisfies the task's selection predicate for a later protected effect.

The explicit comparator matrix therefore includes a provenance-only policy with the same structural constraints as the full policy but without selection witnesses.

See [`EVALUATION.md`](EVALUATION.md) for all reported numbers.

## Public file map

- `SECURITY_MODEL.md` — operational security model, assumptions, derivation rules, and properties;
- `EVALUATION.md` — deterministic, comparator, stress, provider-boundary, live-sample, and overhead results;
- `evaluation-policies.mjs` — explicit comparator and ablation semantics;
- `generate-evaluation-matrix.mjs` — deterministic counterfactual and adversarial-case generator;
- `run-evaluation-baselines.mjs` — primary comparator gate;
- `run-evaluation-stress.mjs` — post-freeze task-structure stress suite;
- `benchmark-authorization-overhead.mjs` — authorization CPU microbenchmark;
- `strict-automatic-contracts.mjs` — strict contract compiler/evidence logic;
- `run-exact-transplant-audit.mjs` — corrected exact cross-task transplant audit;
- `provider_attack_family_gate_with_aggregate.py` — provider-boundary family gate;
- `live-eval-freeze.json` — mechanism/configuration freeze manifest for the preserved live evaluation;
- `ARTIFACT_MANIFEST.md` — immutable workflow/artifact identifiers and digests;
- `artifacts/` — compact machine-readable live-evaluation summaries.

Older low-level harness files are retained when they are required to reproduce historical machine-readable artifacts. They are implementation details rather than recommended entry points.

## Result snapshot

### Frozen deterministic and provider-boundary suite

```text
reference executions                     60/60 accepted
evidence-consistent counterfactuals      36/36 accepted
single-trace field-wise comparator        1/36 counterfactuals accepted
corrected adversarial mutants            370/370 blocked
provider-boundary malicious trajectories 230/230 blocked
malicious provider reaches                    0
```

### Explicit comparator matrix

```text
full Agent Authority                     96/96 legitimate, 385/385 attacks blocked
output provenance                        96/96 legitimate, 383/385 attacks blocked
request/output provenance                96/96 legitimate, 337/385 attacks blocked
single-trace field-wise allowlist        61/96 legitimate, 252/385 attacks blocked
```

The provenance comparator authorizes both generated wrong observed selector candidates while the full policy blocks both. The request/output comparator authorizes all 46 request self-authorization probes.

### Post-freeze stress suite

```text
full Agent Authority                     13/13 legitimate, 13/13 attacks blocked
```

Targeted ablations expose their intended cardinality, precedence, tuple, request-provenance, and selection failures.

## Reproduce

### Requirements

- Node.js 20+;
- Python 3.11;
- AgentDojo dependency pinned in `../agentdojo/requirements.txt`.

```bash
python -m pip install -r benchmarks/agentdojo/requirements.txt
npm install
```

### Build the cohort

```bash
python benchmarks/task-contracts/survey-agentdojo-coverage.py > /tmp/agentdojo-coverage.json
node benchmarks/task-contracts/build-agentdojo-expanded-cohort.mjs \
  /tmp/agentdojo-coverage.json \
  /tmp/agentdojo-cohort.json
```

### Verify the mechanism freeze

```bash
python benchmarks/task-contracts/validate-mechanism-freeze.py \
  benchmarks/task-contracts/live-eval-freeze.json
```

### Run deterministic gates

```bash
node benchmarks/task-contracts/run-strict-automatic-contract-pilot.mjs \
  /tmp/agentdojo-cohort.json > /tmp/strict.json

node benchmarks/task-contracts/run-exact-transplant-audit.mjs \
  /tmp/agentdojo-cohort.json > /tmp/transplants.json

node benchmarks/task-contracts/validate-expanded-strict-gate.mjs \
  /tmp/strict.json /tmp/transplants.json
```

### Run comparators and stress tests

```bash
node benchmarks/task-contracts/run-evaluation-baselines.mjs \
  /tmp/agentdojo-cohort.json

node benchmarks/task-contracts/run-evaluation-stress.mjs

node benchmarks/task-contracts/benchmark-authorization-overhead.mjs \
  /tmp/agentdojo-cohort.json 200
```

### Run provider-boundary families

```bash
node benchmarks/task-contracts/emit-strict-contracts.mjs \
  /tmp/agentdojo-cohort.json \
  /tmp/task-contract-runtime-bundle.json

python benchmarks/task-contracts/provider_attack_family_gate_with_aggregate.py \
  --contracts /tmp/task-contract-runtime-bundle.json
```

## Artifact provenance

`ARTIFACT_MANIFEST.md` records the exact workflow run IDs, artifact IDs, commit SHAs, and SHA-256 digests for the preserved live-model evidence. Compact summaries remain under `artifacts/` so reported aggregate numbers can be inspected without rerunning paid model calls.

## CI policy

The public evaluation workflow is offline. It rebuilds the cohort, verifies the frozen mechanism, runs the strict and exact-transplant gates, executes the comparator/stress suites, and records authorization overhead. It does not require model API credentials.
