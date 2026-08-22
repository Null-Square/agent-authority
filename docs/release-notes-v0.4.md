# Agent Authority v0.4 — Developer Preview

**Give your agent a task, not your account.**

v0.4 is the first developer-preview milestone centered on Task Leases and task-bounded side effects.

## What is new

- Task Lease runtime layered under the existing mission ceiling.
- Same-lease derived authority with explicit parent lineage and extraction selectors.
- Exact resource/context bindings and `authority_delta_required` step-up signals.
- Immediate completion and expiry enforcement independent of credential lifetime.
- Real GitHub validation: discover a live issue, derive its issue number as authority, mutate exactly that issue, block an unrelated issue before the provider call, then block the previously authorized issue after task completion.
- Vercel AI SDK integration for wrapping existing `ToolLoopAgent` tools at the `execute` boundary.
- Fail-closed behavior for unmapped executable AI SDK tools.
- Packed-package consumer validation using only public npm exports.

## Security boundary

Agent Authority only protects execution paths routed through its enforcement boundary. If an agent can reach the same provider through an unguarded tool, SDK client, shell command, or credential path, that route is outside the guarantee.

Derived-value extraction is currently trusted to the host/adapter. v0.4 records provenance and lineage but does not cryptographically prove that the selected provider-output field contained the claimed value.

## Status

This is a developer preview, not a production-ready security control. The goal of v0.4 is to make task-bounded, provenance-aware least privilege executable and easy to test inside ordinary agent stacks.
