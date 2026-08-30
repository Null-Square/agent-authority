# Live-Evaluation Artifact Manifest

This manifest records immutable identifiers for preserved paid-model evaluation artifacts.

GitHub Actions artifacts can expire, so the repository keeps the identifiers needed to verify any retained archive or independently stored copy:

- workflow run ID;
- artifact ID;
- experiment head SHA;
- SHA-256 digest;
- compact machine-readable aggregate summary.

The repository does not claim that the original ZIP bytes are stored in Git history.

## Workflow run 33213651318

- head SHA: `be08b297d7227d1ba1afc8a97c5fd25f3a375d64`
- artifact ID: `9706064110`
- artifact name: `task-authority-live-deepseek-result`
- SHA-256: `f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca`
- planned rows: 5,088
- observed recovery shards: 48/48
- successful trajectories: 1,028
- parser-error rows: 1,380
- insufficient-balance rows: 2,680
- compact summary: `artifacts/live-eval-run-33213651318-summary.json`

The authority-adaptive rows in this run did not reach the model because their payload failed during YAML parsing. Completed canonical rows remain inspectable through the summary.

## Workflow run 33216337865

- head SHA: `e37d6b56ffb7eadfc78bc99677927853eda01684`
- artifact ID: `9706264710`
- artifact name: `task-authority-live-deepseek-result`
- SHA-256: `6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7`
- planned rows: 5,088
- observed recovery shards: 48/48
- successful trajectories: 860
- parser-error rows: 0
- insufficient-balance rows: 4,228
- completed suite: Slack
- compact summary: `artifacts/live-eval-run-33216337865-summary.json`

## Original archive structure

Each aggregate archive used the following layout:

```text
live-eval-result.json
live-inputs/live-eval-freeze-validation.json
live-inputs/live-eval-plan.json
live-shards/live-shard-*.json
```

Each archive contains 48 shard JSON files.

## Integrity check

If you obtain an original artifact archive, verify its SHA-256 before analysis:

```text
run 33213651318  f996a133545074326b3831f10eba26b56f688e26608fff65ba2dfbfa79ebe9ca
run 33216337865  6f7a4cb6f276d6fd30c22b0ad9f66a547469fec81fca8975bf5b342dbd2a50f7
```

A file with a different digest is not the exact archived artifact identified here.

## Analysis rule

Do not drop failed rows when reporting run completion. For ungated-versus-gated comparisons, use scenarios that completed in both conditions. Aggregate evaluation results are documented in `EVALUATION.md`.
