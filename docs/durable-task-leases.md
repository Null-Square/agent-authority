# Durable Task Leases

Agent Authority v0.4.x originally kept Task Lease state only in process memory. That was useful for proving task-bounded authority, but process restart could lose task completion, expiry state, bindings and provenance lineage.

The first M2 durability slice adds **authenticated local-host persistence** without changing the core authority model.

## Security goal

Restart must never increase authority.

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

store.save(lease);

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

The default local configuration now reserves:

```text
~/.agent-authority/state/task-leases/
```

## Restart properties under test

`test/task-lease-persistence.test.js` proves that:

- a strict `execution-evidence-v1` derived fact survives recovery;
- receipt, provider-output and execution-evidence provenance hashes survive unchanged;
- the recovered lease still allows the original exact resource;
- an unrelated resource still produces `authority_delta_required`;
- a completed lease remains completed after recovery and returns `task_lease_completed`;
- expiry survives recovery and cannot be reset merely by process restart;
- editing a persisted fact value without the local authentication key fails before recovered state becomes authority;
- reusing the same mission ID with an expanded mission fails exact-mission recovery;
- missing-parent and cyclic lineage snapshots fail closed.

## Trust boundary

This persistence mechanism protects authority state on the **trusted local Agent Authority host** against accidental corruption and caller-controlled state-file modification when the attacker does not possess the local master key.

It is not hostile-host containment. An attacker or malicious host process that can read the Agent Authority master key can authenticate modified local state and remains outside this guarantee.

The HMAC also does not make provider output cryptographically attested by the provider; it protects the local recovered representation of authority that Agent Authority already established.

## What is not durable yet

This first slice intentionally does not claim that every in-memory mutation is transactionally coupled to disk.

Still open:

- automatically persisting every fact/binding/status mutation as one runtime transaction;
- concurrency control for multiple workers modifying one lease;
- compare-and-swap/version semantics for stale writers;
- crash-safe coupling between provider side effects, execution receipts and Task Lease updates;
- durable application of an explicitly approved authority delta;
- a durable lineage query/index across many leases;
- remote/KMS-backed persistence and key management.

The next M2 work should be driven by these concrete failure modes rather than by adding a general database abstraction prematurely.
