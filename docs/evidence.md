# Executable Evidence

Agent Authority is an experimental security runtime. Claims in this project should be backed by executable evidence, not architecture diagrams alone.

This page records the strongest properties the repository currently demonstrates.

## Core claim under test

> An effect placed behind an Agent Authority Task Lease cannot use the host's broader provider access for a different concrete resource unless the task authority expands explicitly.

The guarantee applies to effects that actually pass through the Agent Authority enforcement boundary. A separate unguarded provider path is outside this guarantee.

## Execution-bound derived authority

The strict derived-authority path now binds provider-derived authority to the exact output returned by an authorized `guard.run()` effect.

A successful guarded effect returns three relevant records:

```text
ALLOW receipt
    +
exact effect output
    |
    v
execution evidence
(receipt + request + output hash)
    |
    v
reviewed adapter extractor
(selector only, no value)
    |
    v
TaskLease.deriveFromEvidence()
    |
    v
derived authority fact
```

`deriveFromEvidence()` does not accept the derived authority value. The trusted adapter extractor chooses a reviewed selector, and Task Lease resolves that selector itself only after verifying the execution evidence.

`test/authority-evidence.test.js` attacks this boundary directly and proves that:

- caller-supplied value substitution does not control the resulting fact;
- modified provider output is rejected with `evidence_output_mismatch`;
- modified execution-evidence contents are rejected;
- evidence cannot be replayed under a second ALLOW receipt;
- a receipt/evidence chain from another Task Lease is rejected;
- the Gmail sender extractor rejects the wrong provider operation;
- dangerous selector paths such as `__proto__` fail closed.

The legacy `TaskLease.derive()` API remains for compatibility and records `derivation_mode: host-trusted`. New provider-derived authority should prefer `deriveFromEvidence()`, which records `derivation_mode: execution-evidence-v1`, extractor ID, source output hash, and execution-evidence hash.

### Boundary of this claim

Execution evidence is an integrity mechanism inside the trusted host/runtime boundary. It proves that the value selected for strict derivation came from the exact output object bound to that Agent Authority receipt.

It does **not** prove that Gmail, GitHub, or another provider cryptographically signed that output, and it does not protect a malicious host that bypasses or replaces the Agent Authority enforcement path. Stronger provider/transport attestation remains open M3 work.

## Cross-provider derived authority — Gmail → Calendar

Agent Authority includes a real Google provider mapping, an adversarial cross-provider test, a live validation script, and an opt-in GitHub Actions workflow.

The task shape is:

```text
Task root
one Gmail thread
        |
        v
ALLOW Gmail thread.read
        |
        +--> output-bound execution evidence
        |
        v
trusted Gmail sender extractor
        |
        v
derive fact: sender_email
        |
        v
ALLOW Calendar event.create
attendee == derived sender
        |
        +--> different attendee
        |      -> authority_delta_required
        |      -> Calendar mutation callback does not run
        |
        v
complete Task Lease
        |
        +--> same attendee again
               -> task_lease_completed
               -> Calendar mutation callback does not run
```

### Connected-account smoke — 2026-08-22

A controlled self-test was exercised against the connected NullSquare Gmail and Google Calendar accounts:

1. a temporary validation message was sent from the validation account to itself;
2. Gmail returned the self-test message with sender `null@nullsquare.net`;
3. one private, transparent Calendar event was created with exactly `null@nullsquare.net` as attendee;
4. the temporary Calendar event was deleted immediately after the proof;
5. the validation email was moved to Trash after cleanup.

No unrelated external person was invited. The smoke test establishes that the concrete Gmail and Calendar operations used by the validation are available and compatible with the intended data shape.

The live connected-account smoke is not presented as a public CI proof of the repository script. The Task Lease zero-call and execution-evidence assertions are separately executable in `test/google-cross-provider.test.js` and `test/authority-evidence.test.js`, and `.github/workflows/live-google-validation.yml` is provided for a rerunnable provider-backed proof once repository Google OAuth secrets are configured.

### Executable local/CI assertions

`test/google-cross-provider.test.js` proves deterministically that:

- the approved Gmail thread callback runs exactly once;
- its sender becomes a same-lease `execution-evidence-v1` authority fact;
- one Calendar mutation for that sender runs exactly once;
- a different attendee produces `authority_delta_required` and the Calendar callback is not invoked;
- after lease completion, the previously valid attendee produces `task_lease_completed` and the Calendar callback is not invoked again.

`test/google-provider.test.js` validates the Google REST mappings, metadata-only Gmail sender extraction, Calendar attendee body, default `sendUpdates=none`, credential redaction, unsupported-action failure, and mutation classification.

`test/google-authority-extractor.test.js` separately verifies that the reviewed Gmail extractor only accepts canonical `gmail:thread.read` sender output and that the Google adapter advertises it only for the supported authority mapping.

### Public workflow

The manual workflow `Live Google cross-provider validation` mints a short-lived access token from repository secrets and runs `npm run demo:live-google`.

It expects:

```text
AA_GOOGLE_OAUTH_CLIENT_ID
AA_GOOGLE_OAUTH_CLIENT_SECRET
AA_GOOGLE_OAUTH_REFRESH_TOKEN
```

The refresh token should be restricted to the practical Gmail read-only and Calendar event scopes documented in `docs/live-google-validation.md`.

The connected GitHub tool does not expose repository Actions-secret management, so those secrets are intentionally not installed automatically from this development session.

### What this proves

Taken together, the deterministic Task Lease tests plus the controlled provider smoke show that:

- the Gmail → Calendar derived-authority shape is implemented, not just diagrammed;
- strict derivation binds the sender to the exact guarded Gmail output before it becomes authority;
- the exact attendee binding is enforced before the Calendar mutation callback;
- provider operations exist and work against real Gmail and Calendar accounts;
- cleanup can keep the live proof reversible and self-contained.

### What this does not prove yet

- a public GitHub Actions run has executed the full repository live script;
- `sender_email` is cryptographically attested by Gmail rather than integrity-bound to the trusted host's guarded output;
- the agent cannot bypass Agent Authority if it independently holds a Google credential;
- Task Lease state is durable across process failure;
- source-data changes automatically invalidate downstream facts;
- the refresh-token setup is production credential onboarding.

See [Live Gmail → Calendar validation](live-google-validation.md).

## Live derived-authority mutation — GitHub

Public fixture: [issue #9](https://github.com/Null-Square/agent-authority/issues/9)

Validation workflow: CI job `live-derived-github-mutation`

Passing run: [CI run 136](https://github.com/Null-Square/agent-authority/actions/runs/32517381668)

The job uses a GitHub Actions token with:

```text
contents: read
issues: write
```

The Task Lease itself starts with only the repository as an authority root.

### Executed path

```text
Task root
Null-Square/agent-authority
        |
        v
ALLOW live issue-list request
        |
        v
discover issue #9 from GitHub response
        |
        v
derive fact: issue_number = 9
        |
        v
ALLOW one real comment mutation on #9
        |
        +--> attempt comment on #1
        |      -> authority_delta_required
        |      -> provider mutation callback does not run
        |
        v
complete Task Lease
        |
        +--> attempt comment on #9 again
               -> task_lease_completed
               -> provider mutation callback does not run
```

The passing job recorded:

```text
ALLOW -> discovered issue #9
Derived authority -> issue #9
ALLOW -> real GitHub comment mutation executed
STEP-UP -> unrelated issue #1 blocked before provider mutation
DENY -> post-completion mutation blocked for issue #9
Provider calls observed before cleanup: reads=1, task_mutations=1
```

The temporary validation comment is deleted by test-harness cleanup after the proof. Cleanup is intentionally outside the agent authority path and counted separately.

### What this proves

- a concrete resource can be discovered from a real provider response during authorized execution;
- that resource can become same-lease derived authority;
- a real provider mutation can be limited to the derived resource;
- asking for another resource does not silently inherit the same authority;
- a blocked resource causes zero additional task-side provider mutation calls;
- completing the Task Lease prevents reuse of the previously authorized resource;
- the provider credential can still exist after task authority disappears.

### What this does not prove

- the current GitHub example has migrated to a reviewed evidence extractor contract;
- an agent cannot bypass Agent Authority if it independently possesses the provider credential or another unguarded provider path;
- Task Lease state is durable across process failure;
- the current prototype is ready for adversarial production use.

## Live provider read boundary — GitHub

CI also runs `demo:live-github` against the public GitHub API.

It proves that one repository permitted by the Task Lease causes one live `fetch()` while another repository produces `authority_delta_required` before a second fetch occurs.

## Network-boundary integration test

`test/guard-network.test.js` uses an ordinary local HTTP provider with a deliberately broad bearer credential.

The server itself observes that:

- the authorized resource reaches the provider once;
- an unrelated resource produces no additional request;
- task completion produces no additional request;
- the broad provider credential remains present throughout the test.

## Adversarial Task Lease tests

The test suite also covers:

- unresolved derived facts fail closed;
- derived authority requires an `ALLOW` receipt;
- receipts from another mission are rejected;
- receipts from another Task Lease are rejected;
- parent lineage is required;
- legacy host-trusted derivation records its extraction selector;
- strict execution-evidence derivation rejects substitution/replay/tampering cases;
- explicit mission deny rules remain the ceiling;
- lease expiry and mission expiry are enforced against a consistent evaluation clock.

## Continuous checks

Current pull requests run:

- Node.js 20 tests;
- Node.js 22 tests;
- Task Lease runnable demo;
- syntax checks;
- package checks;
- coverage;
- live GitHub read validation;
- live derived GitHub mutation validation for trusted in-repository branches;
- Google provider, extractor, cross-provider and execution-evidence adversarial tests;
- CodeQL.

The live Google provider mutation workflow is manual because it requires repository-owned Google OAuth secrets. It should be added to the public evidence list after its first successful run.

## Evidence standard for new claims

A new security claim should ideally include all four:

1. a positive path that performs the intended effect;
2. an adversarial path that attempts to exceed authority;
3. observation at or immediately before the real provider boundary;
4. a public CI result that can be rerun.

The project should prefer a smaller claim with strong evidence over a broader claim that depends on trust in the model or prompt.
