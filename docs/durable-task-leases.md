# Durable Task Leases

Agent Authority v0.4.x originally kept Task Lease state only in process memory. That was useful for proving task-bounded authority, but process restart could lose task completion, expiry state, bindings and provenance lineage.

M2 now has two local-host durability layers:

1. authenticated recovery of Task Lease authority state;
2. transactional mutation with local serialization and stale-writer compare-and-swap protection.

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

The store:

1. snapshots the whole Task Lease;
2. records the current Task Lease hash;
3. authenticates the envelope with HMAC-SHA256;
4. derives the HMAC key for the `task-lease-state` purpose from the existing Agent Authority local master key;
5. writes the complete envelope to a temporary `0600` file;
6. atomically renames that file into place;
7. on recovery, verifies envelope identity and MAC before state hydration;
8. validates the exact mission hash and authority fact graph;
9. reconstructs the lease;
10. verifies the reconstructed lease hash still matches the saved hash.

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

Example explicit compare-and-swap replacement:

```js
const recovered = store.load({ mission, lease_id });
const expected = recovered.hash();
recovered.complete('task finished');

store.save(recovered, {
  expected_lease_hash: expected
});
```

For normal authority mutations, prefer `transact()` rather than mutating a recovered lease and then saving it.

## Transactional mutation

`store.transact()` is the durable read-modify-write boundary.

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

A transaction:

1. acquires an exclusive per-lease local lock using an atomic lock-directory create;
2. reloads and authenticates the current state while holding that lock;
3. compares `expected_lease_hash` when supplied;
4. applies exactly one synchronous mutation callback to the recovered lease;
5. rejects async/thenable mutation callbacks;
6. rejects lease/mission identity changes;
7. validates the entire resulting snapshot and authority fact graph again;
8. atomically writes a new authenticated envelope;
9. returns the previous and new lease hashes plus the newly recovered committed lease;
10. releases the local lock.

If the mutation throws or validation fails, no durable replacement is written.

The mutation callback should modify **Task Lease state only**. Provider calls, network requests and other external side effects do not belong inside this synchronous local transaction.

## Local worker concurrency

The local lock prevents two cooperating Agent Authority processes from entering the same per-lease durable mutation window at the same time.

If a worker observes an already-held lock, it fails closed with:

```text
task_lease_state_locked
```

The lock is intentionally simple and local-filesystem scoped. A crashed process may leave a lock directory behind; this is an availability failure rather than an authority-expansion failure and should be repaired explicitly rather than silently deleting a lock that might still belong to a live worker.

The expected lease hash adds optimistic stale-view protection on top of serialization:

```text
worker A loads H0
worker B loads H0
worker A transact(H0) -> H1
worker B transact(H0) -> task_lease_state_conflict
```

Worker B must reload H1 and reconsider its intended mutation against the new authority state.

## Restart and transaction properties under test

`test/task-lease-persistence.test.js` proves that:

- a strict `execution-evidence-v1` derived fact survives recovery;
- receipt, provider-output and execution-evidence provenance hashes survive unchanged;
- the recovered lease still allows the original exact resource;
- an unrelated resource still produces `authority_delta_required`;
- a completed lease remains completed after recovery and returns `task_lease_completed`;
- expiry survives recovery and cannot be reset merely by process restart;
- editing a persisted fact value without the local authentication key fails before recovered state becomes authority;
- reusing the same mission ID with an expanded mission fails exact-mission recovery;
- missing-parent and cyclic lineage snapshots fail closed;
- one transaction can persist a fact plus its binding as one authenticated snapshot;
- two independent recovered worker views cannot overwrite each other after one commits;
- a changed raw `save()` cannot bypass compare-and-swap protection;
- an already-held per-lease lock fails closed;
- a throwing or async mutation leaves the durable snapshot unchanged;
- an unchanged save remains idempotent;
- explicit expected-hash replacement works when the caller is current.

## Trust boundary

This persistence mechanism protects authority state on the **trusted local Agent Authority host** against accidental corruption, caller-controlled state-file modification without the authentication key, and stale cooperating local writers.

It is not hostile-host containment. An attacker or malicious host process that can read the Agent Authority master key can authenticate modified local state and remains outside this guarantee.

The HMAC also does not make provider output cryptographically attested by the provider; it protects the local recovered representation of authority that Agent Authority already established.

The per-lease lock is a local filesystem coordination mechanism. It is not a distributed consensus or remote database lock.

## What is not durable yet

The store now provides an atomic authority-state mutation boundary, but Agent Authority does not yet automatically route every runtime mutation through it.

Still open:

- a higher-level durable lease/session API so ordinary runtime fact/binding/completion mutations automatically use `transact()`;
- crash-safe coupling between provider side effects, execution receipts and Task Lease updates;
- durable application of an explicitly approved authority delta;
- a durable lineage query/index across many leases;
- stronger multi-process stress tests and recovery tooling for abandoned local locks;
- remote/KMS-backed persistence and key management.

The next M2 work should wire this transaction primitive into the normal Task Lease mutation surface before adding a general database abstraction.