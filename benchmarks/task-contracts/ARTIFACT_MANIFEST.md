# Research Artifact Manifest

This manifest preserves the exact paid-model evidence used by the Agent Authority V1 research closure.

## Why the ZIP files are committed

GitHub Actions artifacts expire. The paid DeepSeek runs cannot be recreated without spending additional model budget and would not reproduce the original stochastic trajectories exactly.

The repository therefore commits the exact aggregate artifact ZIP bytes for Attempts 3 and 4.

## Attempt 3

- GitHub Actions run: `33213651318`
- head SHA: `be08b297d7227d1ba1afc8a97c5fd25f3a375d64`
- original artifact ID: `9706064110`
- artifact name: `task-authority-live-deepseek-result`
- committed path: `benchmarks/task-contracts/artifacts/deepseek-attempt-3.zip`
- SHA-256: `f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`
- expected 5,088 rows: yes
- observed recovery shards: 48/48
- successful trajectories: 1,028
- `ParserError` rows: 1,380
- `402 Insufficient Balance` rows: 2,680
- scientific status: failed preregistered zero-error gate; supplementary canonical-attack evidence only

The adaptive rows did not reach the model because exact JSON attack text broke AgentDojo YAML injection parsing.

## Attempt 4

- GitHub Actions run: `33216337865`
- head SHA: `e37d6b56ffb7eadfc78bc99677927853eda01684`
- original artifact ID: `9706264710`
- artifact name: `task-authority-live-deepseek-result`
- committed path: `benchmarks/task-contracts/artifacts/deepseek-attempt-4.zip`
- SHA-256: `6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`
- expected 5,088 rows: yes
- observed recovery shards: 48/48
- successful trajectories: 860
- `ParserError` rows: 0
- `402 Insufficient Balance` rows: 4,228
- scientific status: failed preregistered zero-error gate; usable partial Slack live-model evidence

Attempt 4 changed evaluator delivery plumbing only. The frozen authority mechanism and planned matrix did not change.

## Archive contents

Each ZIP contains:

```text
live-eval-result.json
live-inputs/live-eval-freeze-validation.json
live-inputs/live-eval-plan.json
live-shards/live-shard-*.json
```

There are 48 shard files per attempt.

## Integrity check

From the repository root:

```bash
sha256sum \
  benchmarks/task-contracts/artifacts/deepseek-attempt-3.zip \
  benchmarks/task-contracts/artifacts/deepseek-attempt-4.zip
```

Expected output:

```text
f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca  benchmarks/task-contracts/artifacts/deepseek-attempt-3.zip
6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7  benchmarks/task-contracts/artifacts/deepseek-attempt-4.zip
```

## Interpretation rule

The archives are historical evidence. Do not delete failed rows, re-label incomplete suites as successful, or combine unmatched ungated/gated rows into the primary matched statistic.

For paper claims, use `PAPER_RESULTS_DRAFT.md` and keep the exact limitations recorded there.
