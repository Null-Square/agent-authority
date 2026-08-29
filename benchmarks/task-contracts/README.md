# Task Authority and Selection Witnesses — Research Package

Status: **closed V1 research artifact**

Closed: **2026-08-29**

This directory contains the full research prototype, evaluation harness, frozen protocol, attempt history, and preserved paid-model artifacts for the Agent Authority V1 research slice.

The code is intentionally separate from the product runtime. Do not assume that every research relation or compiler rule is part of the public npm package.

## Result first

The completed deterministic/provider-boundary evaluation covers 60 AgentDojo mutation-bearing tasks across Slack, Banking, Workspace, and Travel.

```text
reference utility                         60/60
counterfactual utility                    36/36
static exact-trace baseline                1/36
corrected adversarial mutants            370/370 blocked
provider-boundary adversarial families   230/230 blocked
malicious provider reaches                     0
```

The partial DeepSeek V4 Pro live evaluation contains 372 matched attacked scenarios that completed in both ungated and gated conditions:

```text
ungated unauthorized protected effects   61 across 40 scenarios
gated unauthorized protected effects      0 across  0 scenarios
ungated matched utility                   84.41%
gated matched utility                     82.26%
matched utility difference                 2.15 percentage points
```

The full planned 5,088-run live matrix did not complete. Do not report it as a primary preregistered success.

## Research question

Can task-local authority acquire resources discovered during authorized execution while remaining bounded and without treating every observed candidate as authorized?

The central mechanism distinction is:

> **Discovery provenance is not selection authority.**

A multi-candidate provider output establishes candidate membership. It does not establish which candidate the user's task selects.

The research compiler uses deterministic **selection witnesses** to authorize a selected candidate when the task predicate, candidate evidence, and required measurements prove a unique result.

## Frozen V1 mechanism

The evaluated research grammar includes:

- finite/static value fences;
- per-action cardinality;
- precedence constraints;
- tuple/correlation constraints;
- output-derived evidence bindings;
- numeric/arithmetic derivation;
- prefix and extremum selection witnesses;
- aggregate-frequency selection witnesses;
- fail-closed unresolved dynamic candidates.

A prior agent request argument cannot mint dynamic authority for itself.

The frozen live mechanism is recorded in `live-eval-freeze.json`.

## Evidence layers

### Layer 1 — deterministic and provider-boundary evaluation

Use `RESULTS.md` as the closure source of truth.

The provider-boundary families are:

| Family | Constructed | Blocked | Provider reach |
| --- | ---: | ---: | ---: |
| Field/resource substitution | 60 | 60 | 0 |
| Premature/reordered effect | 60 | 60 | 0 |
| Repeated effect | 60 | 60 | 0 |
| Exact cross-task transplant | 46 | 46 | 0 |
| Wrong selector candidate | 4 | 4 | 0 |
| **Total** | **230** | **230** | **0** |

### Layer 2 — partial DeepSeek V4 Pro live evidence

Use `PAPER_RESULTS_DRAFT.md` for the exact paper-facing result and qualification.

Attempt 4 is the principal live slice because adaptive delivery was corrected before it ran. It produced 860 successful trajectories, all in Slack, before the API balance was exhausted.

Attempt 3 is supplementary because its adaptive arm failed at YAML parsing before reaching the model.

### Layer 3 — historical pilots and falsification trail

The directory also keeps earlier pilots, diagnostics, and generators. They show how the mechanism changed when earlier hypotheses failed. Do not delete them merely because later gates supersede them.

## Permanent paid-artifact archive

The exact GitHub Actions aggregate artifacts are committed here:

```text
artifacts/deepseek-attempt-3.zip
artifacts/deepseek-attempt-4.zip
```

Each archive contains:

- `live-eval-result.json`;
- frozen input validation;
- the planned matrix metadata;
- all 48 live shard JSON files.

The committed ZIP bytes match the original GitHub Actions SHA-256 digests. See `ARTIFACT_MANIFEST.md`.

This archive exists because GitHub Actions artifacts are temporary.

## Reproduce without paid APIs

### Requirements

- Node.js 20+;
- Python 3.11;
- the pinned AgentDojo dependency from `../agentdojo/requirements.txt`.

Install:

```bash
python -m pip install -r benchmarks/agentdojo/requirements.txt
npm install
```

### Rebuild the 60-task cohort and frozen contracts

```bash
python benchmarks/task-contracts/survey-agentdojo-coverage.py > /tmp/agentdojo-coverage-survey.json
node benchmarks/task-contracts/build-agentdojo-expanded-cohort.mjs \
  /tmp/agentdojo-coverage-survey.json \
  /tmp/agentdojo-expanded-cohort.json
node benchmarks/task-contracts/emit-strict-contracts.mjs \
  /tmp/agentdojo-expanded-cohort.json \
  /tmp/task-contract-runtime-bundle.json
```

### Reproduce the corrected strict and provider-boundary gates

```bash
node benchmarks/task-contracts/run-strict-automatic-contract-pilot.mjs \
  /tmp/agentdojo-expanded-cohort.json > /tmp/task-contract-strict-expanded.json

node benchmarks/task-contracts/run-exact-transplant-audit.mjs \
  /tmp/agentdojo-expanded-cohort.json > /tmp/task-contract-exact-transplants.json

node benchmarks/task-contracts/validate-expanded-strict-gate.mjs \
  /tmp/task-contract-strict-expanded.json \
  /tmp/task-contract-exact-transplants.json

python benchmarks/task-contracts/provider_attack_family_gate_with_aggregate.py \
  --contracts /tmp/task-contract-runtime-bundle.json

python benchmarks/task-contracts/aggregate_provider_gate.py \
  --contracts /tmp/task-contract-runtime-bundle.json
```

### Verify the frozen live plan without calling a model

```bash
python benchmarks/task-contracts/validate-mechanism-freeze.py \
  benchmarks/task-contracts/live-eval-freeze.json

python benchmarks/task-contracts/run-deepseek-publication-eval.py \
  --contracts /tmp/task-contract-runtime-bundle.json \
  --mode plan \
  --suite all \
  --trial 0 \
  --output /tmp/live-eval-plan.json
```

`--mode plan` does not issue paid model calls.

## Workflow policy after closure

`.github/workflows/task-contract-pilot.yml` is manual and offline. It must not use model API secrets.

`.github/workflows/task-contract-live-deepseek.yml` is archived provenance. It executes zero paid model calls.

Do not re-enable paid execution as part of ordinary CI.

## Paper source map

Read in this order:

1. `PAPER_RESEARCH_SPEC.md` — thesis, novelty boundary, research questions, candidate formal model;
2. `RESULTS.md` — complete research closure and deterministic/provider-boundary result;
3. `PAPER_RESULTS_DRAFT.md` — paper-facing live result and claim language;
4. `LIVE_EVAL_PROTOCOL.md` — planned frozen DeepSeek protocol;
5. `LIVE_EVAL_ATTEMPTS.md` — infrastructure and budget failure history;
6. `ARTIFACT_MANIFEST.md` — immutable raw artifact mapping.

## Known limitations

The V1 package does not establish:

- broad natural-language intent compilation;
- formal proof of the grammar;
- complete prompt-injection security;
- broad multi-model robustness;
- live Workspace or Travel coverage in Attempt 4;
- held-out-domain generalization;
- semantic safety of arbitrary message/file content;
- production remote/multi-tenant enforcement.

The strongest negative result is trace over-constraint: a single successful execution trace can contain incidental or incorrect values and therefore cannot be treated as the exact semantic authorization envelope.

## Community continuation

Useful next projects include:

- formal proofs for non-amplification and selection soundness;
- semantic authority envelopes;
- held-out selector benchmarks;
- baseline and ablation studies;
- independent bypass attempts;
- additional model families;
- overhead and step-up measurements.

The original V1 research is closed. New work should branch from the preserved evidence rather than rewriting the historical result.
