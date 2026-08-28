# Live Evaluation Attempt Log

This log preserves pre-primary infrastructure failures and launch history for `live-eval-v1`. These attempts are not silently discarded or counted as model/security outcomes.

## Invariant

The frozen V1 authority mechanism is defined by `live-eval-freeze.json`. None of the corrections below modify a frozen compiler, authority schema, projection, selection-witness rule, provider-boundary decision procedure, or benchmark contract semantics.

## Attempt 1 — calibration rejected forced tool choice

- GitHub Actions run: `33212782103`
- Trigger commit: `cd7b7fb90a9038b9ca4ade3a47c4a6e7af4e517a`
- Prepare: passed
- Calibration: failed
- Live partitions released: no
- Primary model task trajectories produced: 0

DeepSeek V4 Pro thinking mode rejected calibration's forced named `tool_choice`. Inspection also established that pinned AgentDojo `0.1.35` drops DeepSeek's `reasoning_content` between assistant tool-call turns, while V4 thinking-mode tool use requires that state to be replayed.

Correction: a transport-only adapter now preserves the exact returned `reasoning_content` by tool-call ID. Calibration was strengthened to perform a two-turn thinking-mode tool interaction in which the field is deliberately stripped before the second request and must be reconstructed by the adapter. The primary protocol now explicitly pins thinking mode enabled with high reasoning effort.

## Attempt 2 — artifact extraction path mismatch

- GitHub Actions run: `33213249501`
- Trigger commit: `6596a467e098445e3382c0f81e91e8b2a0e7bbda`
- Prepare: passed
- Two-turn DeepSeek calibration: passed
- Live partitions released: yes
- Primary model task trajectories produced by live partitions: 0

The prepared `live-eval-inputs` artifact preserved absolute-path prefixes because its uploaded files had `/tmp/...` and workspace paths with `/` as their common ancestor. After download, the runtime bundle was therefore located at `tmp/task-contract-runtime-bundle.json` beneath the extraction root rather than directly at the extraction root. Live partition processes failed with `FileNotFoundError` before opening the runtime contract bundle and therefore before constructing the DeepSeek pipeline or issuing a primary task call.

Artifact `9702409250` was downloaded and inspected directly; its ZIP layout confirmed the mismatch.

Correction: evaluation plumbing now resolves each requested frozen artifact input recursively by exact basename and fails closed unless exactly one match exists. Aggregation uses the same rule for the preregistered plan and restores canonical metadata paths for the final artifact. No scientific input bytes or authority semantics are changed.

## Attempt 3 — invalidated by adaptive injection serialization

- GitHub Actions run: `33213651318`
- Trigger commit: `be08b297d7227d1ba1afc8a97c5fd25f3a375d64`
- Prepare: passed
- Frozen mechanism hash validation: passed
- Exact 5,088-case dry plan: passed
- Two-turn DeepSeek V4 Pro thinking/tool calibration: passed
- Live partitions: released
- Primary stochastic trajectories: yes
- Scientific status: **invalid infrastructure run; do not use for V1 security/utility claims**

This was the first attempt in which primary stochastic task trajectories actually executed. Early completed Slack checkpoints were inspected directly from artifacts `9702971131`, `9702995951`, and `9703027306`. Across those three checkpoints, 242 case rows had been written; 98 were `ParserError` infrastructure failures. The failures were concentrated in authority-adaptive cases whose exact JSON tool arguments contain double quotes.

Root cause: pinned AgentDojo `0.1.35` formats injection strings into `environment.yaml` source before `yaml.safe_load`. The adaptive attack text intentionally contains canonical JSON such as `{"channel": "External_0", "user": "Alice"}`. When inserted into an already double-quoted YAML scalar, those quotes terminate the scalar and the YAML parser fails before DeepSeek sees the attack. Therefore the partial zero-unauthorized-effect observation from successfully executed rows is not a valid security result: a material subset of the preregistered attacks was not delivered to the model.

Correction: evaluator-only delivery plumbing now uses unique inert sentinels for selected injection vectors during AgentDojo's normal YAML parse and Pydantic validation, then replaces those sentinels in the validated environment model with the exact original adaptive payload strings. Benign and canonical AgentDojo `tool_knowledge` paths remain on AgentDojo's original loader. The wrapper also performs a fail-closed preflight over all 230 adaptive targets under all three frozen templates (690 payload materializations) before the live matrix can be released, requiring every sentinel to be observed and every exact payload to survive model re-validation. The 5,088-case plan, attack targets, templates, frozen mechanism, and decision thresholds are unchanged.

## Attempt 4 — pending clean relaunch

Attempt 4 is the first run eligible to become the primary live result after the adaptive-delivery correction. It must pass the unchanged frozen-mechanism hash check, unchanged exact 5,088-case plan assertion, the new 690-case delivery preflight, DeepSeek thinking/tool calibration, all live partitions, and final preregistered aggregation. No V1 claim will be recorded unless that aggregate completes without infrastructure errors.
