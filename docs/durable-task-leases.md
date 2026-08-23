# Durable Task Leases

Agent Authority v0.4.x originally kept Task Lease state only in process memory. That was useful for proving task-bounded authority, but process restart could lose task completion, expiry state, bindings and provenance lineage.

M2 now has three local-host durability layers:

1. authenticated recovery of Task Lease authority state;
2. transactional mutation with local serialization and stale-writer compare-and-swap protection;
3. `DurableTaskLeaseSession`, which routes normal Task Lease mutations through that transaction boundary automatically.

The core authority model is unchanged.

## Security goal

Restart or concurrent local workers must never increase authority by reconstructing, overwriting or racing durable state.

```text
live Task Lease
      |
      v
atomic authenticated snapshot
      |
 process restart
      |
      v
authenticate + validate + recover
      |
      v
recovered Task Lease authority
      <=
pre-restart Task Lease authority
```

For updates:

```text
worker view @ hash H0
        |
        v
acquire per-lease lock
        |
reload authenticated current state
        |
expected hash == current hash ?
        |
      yes
        v
apply one synchronous lease mutation
        |
validate complete authority snapshot
        |
atomic authenticated replacement -> H1
```

A stale worker that still expects `H0` after another worker committed `H1` receives `task_lease_state_conflict`. It does not overwrite `H1`.

A state file is not authority merely because it contains plausible JSON.

## Snapshot contents

`TaskLease.snapshot()` preserves:

- lease ID;
- exact mission ID and mission hash;
- principal and agent IDs;
- original task request;
- active/completed status;
- creation, expiry and completion timestamps;
- completion reason;
- exact context bindings;
- root authority facts;
- derived facts and parent lineage;
- strict execution-evidence provenance, including receipt, request, provider-output and evidence hashes.

Snapshots do **not** contain provider credentials.

## Recovery validation

`TaskLease.restore()` / `restoreTaskLease()` validate the recovered state before reconstructing a lease.

Recovery rejects:

- a different mission ID;
- the same mission ID paired with a different mission definition/hash;
- a different principal or agent;
- unsupported snapshot versions;
- invalid active/completed state;
- invalid timestamps;
- duplicate authority fact IDs;
- missing parent facts;
- cyclic authority lineage;
- derived facts claiming another Task Lease ID;
- derived facts missing receipt/request/selector provenance;
- `execution-evidence-v1` facts missing extractor/output/evidence hashes.

`restoreTaskLease()` validates state structure and mission identity, but it does not authenticate where arbitrary caller-supplied JSON came from. Durable applications should load persisted authority through an authenticated store.

## Authenticated local store

`JsonFileTaskLeaseStore` is the first reference persistence backend.

```js
import { JsonFileTaskLeaseStore } from '@nullsquare/agent-authority/storage';

const store = new JsonFileTaskLeaseStore({
  dir: config.paths.task_leases,
  keyPath: config.paths.master_key
});

const created = store.save(lease);

// Later, after process restart:
const recovered = store.load({
  mission,
  lease_id: leaseId
});
```

The store snapshots the whole lease, records its hash, authenticates the envelope with HMAC-SHA256 using a purpose-derived local key, atomically writes it, then verifies identity/MAC/mission hash/fact graph/reconstructed lease hash before returning recovered authority.

The default local configuration reserves:

```text
~/.agent-authority/state/task-leases/
```

## Save semantics

`save()` is deliberately not last-writer-wins.

For a lease that does not yet exist, `store.save(lease)` creates the authenticated durable state.

For an existing lease:

- saving an unchanged recovered state is idempotent;
- replacing changed state requires `expected_lease_hash`;
- attempting to replace changed state without an expected hash fails with `task_lease_state_conflict`.

For normal authority mutations, prefer `transact()` or `DurableTaskLeaseSession` rather than mutating a recovered lease and then saving it.

## Transactional mutation

`store.transact()` is the low-level durable read-modify-write boundary.

```js
const view = store.load({ mission, lease_id });

const committed = store.transact({
  mission,
  lease_id,
  expected_lease_hash: view.hash(),
  mutate: (lease) => {
    lease.addRoot({
      fact_id: 'fact:region',
      kind: 'demo.region',
      value: 'us-east'
    });

    lease.bind({
      service: 'demo',
      action: 'item.access',
      context_field: 'region',
      fact_id: 'fact:region'
    });
  }
});
```

A transaction acquires a per-lease local lock, reloads/authenticates current state, checks the expected hash, applies one synchronous mutation, validates the full authority graph, atomically writes a new authenticated envelope, and returns the previous/new hashes. Throwing or async callbacks do not persist mutated state.

The mutation callback should modify **Task Lease state only**. Provider calls, network requests and other external side effects do not belong inside this synchronous local transaction.

## DurableTaskLeaseSession

Most callers should not manually orchestrate `load()` + `transact()` for ordinary Task Lease changes. `DurableTaskLeaseSession` keeps the current recovered hash and applies normal Task Lease mutations through compare-and-swap automatically.

```js
import {
  createDurableTaskLeaseSession,
  openDurableTaskLeaseSession
} from '@nullsquare/agent-authority/durable-task-lease';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';

const session = createDurableTaskLeaseSession({
  store,
  lease
});

const guard = createTaskLeaseGuard({
  lease: session,
  runtime
});

const read = await guard.run(
  {
    service: 'gmail',
    action: 'thread.read',
    context: { thread_id: 'thread:demo-91' }
  },
  () => gmail.readThread('thread:demo-91')
);

session.deriveFromEvidence({
  fact_id: 'fact:sender-email',
  kind: 'email.address',
  from: ['fact:thread'],
  receipt: read.receipt,
  evidence: read.evidence,
  output: read.output,
  extractor: gmailThreadSenderAuthorityExtractor
});
```

The session exposes durable equivalents of the ordinary state-changing methods:

- `addRoot()`;
- legacy `derive()`;
- `deriveFromEvidence()`;
- `bind()`;
- `complete()`.

Each mutation uses the session's current lease hash as `expected_lease_hash`. On success the session adopts the committed lease and new hash. On conflict it does **not** auto-retry or replay the mutation. The caller must `refresh()` and reconsider the intended change against the newer authority state.

The session does not expose its mutable internal `TaskLease`. `mission`, snapshots and facts are returned as detached values so mutating a caller-visible object does not mutate durable authority by reference.

### Guard behavior

`DurableTaskLeaseSession` implements `evaluate(runtime, request)`, so it can be passed anywhere a Task Lease is accepted by the current guard/MCP/broker interfaces.

Security-critical `evaluate()` calls `refresh()` first. That means a stale worker which another worker has already completed or narrowed will observe the durable state before the next authority decision.

Example:

```text
worker B cached active H0
worker A complete() -> H1 completed
worker B guard.run(...)
    -> session.evaluate()
    -> refresh H1
    -> task_lease_completed
    -> effect callback never runs
```

### Evidence race behavior

Suppose worker B receives an ALLOW receipt and execution evidence at H0, but worker A changes durable Task Lease state to H1 before B calls `deriveFromEvidence()`.

The session does not silently derive against H1:

```text
B guarded read @ H0 -> receipt + evidence
A commits authority state H1
B deriveFromEvidence(... expected H0 ...)
    -> task_lease_state_conflict
    -> no derived fact persisted
```

B must refresh and explicitly reconsider whether the old provider result still justifies a derived authority fact under H1.

## Local worker concurrency

The local lock prevents two cooperating Agent Authority processes from entering the same per-lease durable mutation window at the same time.

If a worker observes an already-held lock, it fails closed with:

```text
task_lease_state_locked
```

The lock is intentionally local-filesystem scoped. A crashed process may leave a lock directory behind; this is an availability failure rather than an authority-expansion failure and should be repaired explicitly rather than silently deleting a lock that might still belong to a live worker.

The expected lease hash adds optimistic stale-view protection:

```text
worker A loads H0
worker B loads H0
worker A transact(H0) -> H1
worker B transact(H0) -> task_lease_state_conflict
```

Worker B must reload H1 and reconsider its intended mutation against the new authority state.

## Properties under test

`test/task-lease-persistence.test.js` and `test/durable-task-lease-session.test.js` prove that:

- strict `execution-evidence-v1` facts survive recovery with provenance hashes unchanged;
- unrelated resources still require step-up after restart;
- completion and expiry survive restart;
- disk tampering, changed mission definitions and malformed lineage fail closed;
- fact+binding changes can commit as one authenticated snapshot;
- stale worker views cannot overwrite newer authority;
- raw changed saves cannot bypass compare-and-swap;
- overlapping local transactions fail closed;
- throwing or async transactions leave durable state unchanged;
- a durable session can perform strict evidence derivation and reopen with identical authority behavior;
- another worker's completion is observed before the stale session's next guarded effect;
- stale semantic mutations are not automatically replayed;
- evidence captured at H0 cannot be automatically derived after another worker commits H1;
- caller-visible mission/snapshot objects do not expose mutable aliases to the session's internal authority state.

## Trust boundary

This persistence mechanism protects authority state on the **trusted local Agent Authority host** against accidental corruption, caller-controlled state-file modification without the authentication key, and stale cooperating local writers.

It is not hostile-host containment. An attacker or malicious host process that can read the Agent Authority master key can authenticate modified local state and remains outside this guarantee.

The HMAC does not make provider output cryptographically attested by the provider. The per-lease lock is local filesystem coordination, not distributed consensus.

## Important remaining TOCTOU boundary

Refreshing before `evaluate()` closes stale-state decisions, but it does **not** make an asynchronous external provider effect and Task Lease state transition one distributed transaction.

There is still a possible sequence:

```text
worker B refresh/evaluate -> ALLOW
worker A completes lease
worker B provider effect begins
```

The ordinary guard correctly checks authority immediately before invoking its effect callback, but another process can change durable state after that decision. Agent Authority does not yet hold the local lease lock across a network/provider effect, and it should not do so casually.

Crash-safe/provider-side coordination, idempotency and execution receipts need a dedicated design rather than pretending a filesystem transaction covers remote side effects.

## What is not durable yet

Still open:

- crash-safe coupling between provider side effects, execution receipts and Task Lease state changes;
- durable application of an explicitly approved authority delta;
- a durable lineage query/index across many leases;
- stronger multi-process stress tests and recovery tooling for abandoned local locks;
- remote/KMS-backed persistence and distributed coordination where required.

The next M2 work should tackle approved authority deltas and execution/effect coupling as separate explicit problems rather than broadening the persistence layer into a general database abstraction.