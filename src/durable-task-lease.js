import { TaskLease } from './task-lease.js';

function sessionError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function assertStore(store) {
  if (!store || typeof store !== 'object') {
    throw new Error('durable Task Lease store is required');
  }
  for (const method of ['save', 'load', 'transact']) {
    if (typeof store[method] !== 'function') {
      throw new Error(`durable Task Lease store must implement ${method}()`);
    }
  }
  return store;
}

function assertLease(lease) {
  if (!(lease instanceof TaskLease)) throw new Error('TaskLease instance is required');
  return lease;
}

/**
 * A small stateful facade over JsonFileTaskLeaseStore-style transactional
 * persistence.
 *
 * The session never exposes its mutable TaskLease instance. Reads come from the
 * cached recovered lease, explicit refresh() reloads authenticated state, and
 * evaluate() refreshes before every security decision so another worker's
 * completion or narrowing is observed before the next guarded effect.
 *
 * Mutations use optimistic compare-and-swap against the session's current lease
 * hash. A stale session receives task_lease_state_conflict and must refresh and
 * reconsider the intended authority mutation; semantic mutations are never
 * silently replayed against a newer authority state.
 */
export class DurableTaskLeaseSession {
  constructor({ store, mission, lease_id, lease, lease_hash } = {}) {
    this.store = assertStore(store);
    if (!mission || typeof mission !== 'object') throw new Error('mission is required');
    if (!lease_id) throw new Error('lease_id is required');
    assertLease(lease);
    if (lease.lease_id !== lease_id || lease.mission.mission_id !== mission.mission_id) {
      throw sessionError('durable_task_lease_identity_mismatch', 'session lease identity does not match mission and lease_id');
    }

    this._mission = structuredClone(mission);
    this.lease_id = lease_id;
    this._lease = lease;
    this._leaseHash = lease_hash || lease.hash();
    if (this._leaseHash !== lease.hash()) {
      throw sessionError('durable_task_lease_hash_mismatch', 'session lease hash does not match recovered Task Lease state');
    }
  }

  get mission() {
    return structuredClone(this._mission);
  }

  get status() {
    return this._lease.status;
  }

  get expires_at() {
    return this._lease.expires_at;
  }

  get completed_at() {
    return this._lease.completed_at;
  }

  get completion_reason() {
    return this._lease.completion_reason;
  }

  hash() {
    return this._leaseHash;
  }

  snapshot() {
    return structuredClone(this._lease.snapshot());
  }

  fact(factId) {
    return this._lease.fact(factId);
  }

  listFacts() {
    return this._lease.listFacts();
  }

  refresh() {
    const lease = this.store.load({
      mission: this._mission,
      lease_id: this.lease_id
    });
    if (!lease) {
      throw sessionError(
        'task_lease_state_missing',
        `task lease ${this.lease_id} has no durable state`,
        { lease_id: this.lease_id }
      );
    }
    this._lease = lease;
    this._leaseHash = lease.hash();
    return this;
  }

  evaluate(runtime, request, now = new Date()) {
    this.refresh();
    return this._lease.evaluate(runtime, request, now);
  }

  _commit(mutator) {
    const result = this.store.transact({
      mission: this._mission,
      lease_id: this.lease_id,
      expected_lease_hash: this._leaseHash,
      mutate: mutator
    });
    this._lease = result.lease;
    this._leaseHash = result.lease_hash;
    return result.value;
  }

  addRoot(options) {
    return this._commit((lease) => lease.addRoot(options));
  }

  derive(options) {
    return this._commit((lease) => lease.derive(options));
  }

  deriveFromEvidence(options) {
    return this._commit((lease) => lease.deriveFromEvidence(options));
  }

  bind(binding) {
    return this._commit((lease) => lease.bind(binding));
  }

  complete(reason = 'task completed') {
    return this._commit((lease) => lease.complete(reason));
  }
}

export function createDurableTaskLeaseSession({ store, lease } = {}) {
  assertStore(store);
  assertLease(lease);
  const mission = structuredClone(lease.mission);
  const saved = store.save(lease);
  const recovered = store.load({ mission, lease_id: lease.lease_id });
  if (!recovered) {
    throw sessionError('task_lease_state_missing', `task lease ${lease.lease_id} was not recoverable after creation`);
  }
  return new DurableTaskLeaseSession({
    store,
    mission,
    lease_id: lease.lease_id,
    lease: recovered,
    lease_hash: saved.lease_hash
  });
}

export function openDurableTaskLeaseSession({ store, mission, lease_id } = {}) {
  assertStore(store);
  if (!mission || typeof mission !== 'object') throw new Error('mission is required');
  if (!lease_id) throw new Error('lease_id is required');
  const missionSnapshot = structuredClone(mission);
  const lease = store.load({ mission: missionSnapshot, lease_id });
  if (!lease) {
    throw sessionError('task_lease_state_missing', `task lease ${lease_id} has no durable state`, { lease_id });
  }
  return new DurableTaskLeaseSession({
    store,
    mission: missionSnapshot,
    lease_id,
    lease,
    lease_hash: lease.hash()
  });
}
