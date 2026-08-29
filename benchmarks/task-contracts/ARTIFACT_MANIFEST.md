# Research Artifact Manifest

This manifest records the exact paid-model evidence used by the Agent Authority V1 research closure.

## Preservation policy

GitHub Actions artifacts expire. The original paid DeepSeek trajectories cannot be recreated exactly, and rerunning them would require new model spend.

The public repository therefore preserves:

- immutable workflow run IDs;
- original artifact IDs;
- original SHA-256 digests;
- exact experiment head SHAs;
- the frozen protocol and mechanism configuration;
- the full attempt history;
- compact machine-readable result summaries for Attempts 3 and 4.

Permanent summaries:

```text
benchmarks/task-contracts/artifacts/attempt-3-summary.json
benchmarks/task-contracts/artifacts/attempt-4-summary.json
```

The original raw ZIP artifacts remain identified by their GitHub Actions IDs and digests below. The current repository connector cannot commit binary ZIP bytes, so this manifest does not claim that those ZIP files are stored in Git history.

## Attempt 3

- GitHub Actions run: `33213651318`
- head SHA: `be08b297d7227d1ba1afc8a97c5fd25f3a375d64`
- original artifact ID: `9706064110`
- artifact name: `task-authority-live-deepseek-result`
- original SHA-256: `f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`
- expected rows: 5,088
- observed recovery shards: 48/48
- successful trajectories: 1,028
- `ParserError` rows: 1,380
- `402 Insufficient Balance` rows: 2,680
- scientific status: failed preregistered zero-error gate; supplementary canonical-attack evidence only
- repository summary: `artifacts/attempt-3-summary.json`

The adaptive rows did not reach the model because exact JSON attack text broke AgentDojo YAML injection parsing.

## Attempt 4

- GitHub Actions run: `33216337865`
- head SHA: `e37d6b56ffb7eadfc78bc99677927853eda01684`
- original artifact ID: `9706264710`
- artifact name: `task-authority-live-deepseek-result`
- original SHA-256: `6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`
- expected rows: 5,088
- observed recovery shards: 48/48
- successful trajectories: 860
- `ParserError` rows: 0
- `402 Insufficient Balance` rows: 4,228
- scientific status: failed preregistered zero-error gate; usable partial Slack live-model evidence
- repository summary: `artifacts/attempt-4-summary.json`

Attempt 4 changed evaluator delivery plumbing only. The frozen authority mechanism and planned matrix did not change.

## Original archive structure

The original aggregate ZIP for each attempt contains:

```text
live-eval-result.json
live-inputs/live-eval-freeze-validation.json
live-inputs/live-eval-plan.json
live-shards/live-shard-*.json
```

Each original archive contains 48 shard JSON files.

## Integrity rule

If you obtain an original artifact archive, verify its SHA-256 before analysis.

Expected digests:

```text
Attempt 3  f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca
Attempt 4  6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7
```

A file with a different digest is not the exact archived evidence used for this closure.

## Interpretation rule

Do not delete failed rows, re-label incomplete suites as successful, or combine unmatched ungated/gated rows into the primary matched statistic.

For paper claims, use `PAPER_RESULTS_DRAFT.md`. Keep the limitations recorded there.
