# Executable Evidence

Agent Authority is an experimental security runtime. Claims in this project should be backed by executable evidence, not architecture diagrams alone.

This page records the strongest properties the repository currently demonstrates.

## Core claim under test

> An effect placed behind an Agent Authority Task Lease cannot use the host's broader provider access for a different concrete resource unless the task authority expands explicitly.

The guarantee applies to effects that actually pass through the Agent Authority enforcement boundary. A separate unguarded provider path is outside this guarantee.

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

- the host/adapter's extraction of `output.number` is cryptographically verified;
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
- a trusted extraction selector must be recorded;
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
- CodeQL.

## Evidence standard for new claims

A new security claim should ideally include all four:

1. a positive path that performs the intended effect;
2. an adversarial path that attempts to exceed authority;
3. observation at or immediately before the real provider boundary;
4. a public CI result that can be rerun.

The project should prefer a smaller claim with strong evidence over a broader claim that depends on trust in the model or prompt.
