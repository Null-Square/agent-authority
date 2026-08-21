import { randomUUID } from 'node:crypto';
import { assertMission, createReceipt, hashObject, matchPattern } from './index.js';

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function deny(code, reason, extra = {}) {
  return { decision: 'deny', code, reason, ...extra };
}

function approval(code, reason, extra = {}) {
  return { decision: 'require_approval', code, reason, ...extra };
}

function sameValue(a, b) {
  return hashObject(a) === hashObject(b);
}

function validateBinding(binding) {
  if (!binding?.service) throw new Error('binding.service is required');
  if (!binding?.action) throw new Error('binding.action is required');
  if (!binding?.context_field) throw new Error('binding.context_field is required');
  if (!binding?.fact_id) throw new Error('binding.fact_id is required');
  return {
    service: binding.service,
    action: binding.action,
    context_field: binding.context_field,
    fact_id: binding.fact_id
  };
}

function taskReceipt(lease, request, result) {
  const base = createReceipt({ mission: lease.mission, request, result });
  const { receipt_hash: _oldHash, ...unsigned } = base;
  const receipt = {
    ...unsigned,
    task_lease_id: lease.lease_id,
    task_lease_hash: lease.hash()
  };
  return { ...receipt, receipt_hash: hashObject(receipt) };
}

/**
 * A TaskLease adds temporary, provenance-bound resource restrictions on top of
 * an existing mission. It never grants an action that the mission itself does
 * not already authorize.
 *
 * Roots are values explicitly approved at task entry. Derived facts must be
 * anchored to a successful receipt from the same mission, so authority can
 * follow resources discovered during authorized execution without becoming a
 * standing wildcard permission.
 */
export class TaskLease {
  constructor({
    mission,
    lease_id = `lease:${randomUUID()}`,
    request = null,
    roots = [],
    bindings = [],
    expires_at = null,
    created_at = new Date().toISOString()
  } = {}) {
    this.mission = assertMission(mission);
    this.lease_id = lease_id;
    this.request = request;
    this.created_at = created_at;
    this.expires_at = expires_at;
    this.status = 'active';
    this.completed_at = null;
    this.completion_reason = null;
    this.facts = new Map();
    this.bindings = bindings.map(validateBinding);

    for (const root of roots) this.addRoot(root);
  }

  addRoot({ fact_id, kind = 'opaque', value, source = 'human' } = {}) {
    if (!fact_id) throw new Error('root fact_id is required');
    if (value === undefined) throw new Error('root value is required');
    if (this.facts.has(fact_id)) throw authorityError('fact_exists', `authority fact ${fact_id} already exists`);
    const fact = {
      fact_id,
      kind,
      value,
      provenance: {
        type: 'root',
        source
      },
      created_at: new Date().toISOString()
    };
    this.facts.set(fact_id, fact);
    return structuredClone(fact);
  }

  derive({ fact_id, kind = 'opaque', value, from = [], receipt, selector = null } = {}) {
    if (!fact_id) throw new Error('derived fact_id is required');
    if (value === undefined) throw new Error('derived value is required');
    if (this.facts.has(fact_id)) throw authorityError('fact_exists', `authority fact ${fact_id} already exists`);
    if (!receipt) throw authorityError('receipt_required', 'derived authority requires an authorized source receipt');
    if (receipt.decision !== 'allow') throw authorityError('receipt_not_authorized', 'derived authority requires an ALLOW receipt');
    if (receipt.mission_id !== this.mission.mission_id) {
      throw authorityError('receipt_mission_mismatch', 'source receipt belongs to another mission');
    }

    const parents = [...new Set(from)];
    for (const parentId of parents) {
      if (!this.facts.has(parentId)) throw authorityError('parent_fact_missing', `authority fact ${parentId} does not exist`);
    }

    const fact = {
      fact_id,
      kind,
      value,
      provenance: {
        type: 'derived',
        from: parents,
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.receipt_hash,
        selector
      },
      created_at: new Date().toISOString()
    };
    this.facts.set(fact_id, fact);
    return structuredClone(fact);
  }

  bind(binding) {
    const normalized = validateBinding(binding);
    this.bindings.push(normalized);
    return { ...normalized };
  }

  fact(factId) {
    const fact = this.facts.get(factId);
    return fact ? structuredClone(fact) : null;
  }

  listFacts() {
    return [...this.facts.values()].map((fact) => structuredClone(fact));
  }

  complete(reason = 'task completed') {
    if (this.status === 'completed') return this.snapshot();
    this.status = 'completed';
    this.completed_at = new Date().toISOString();
    this.completion_reason = reason;
    return this.snapshot();
  }

  snapshot() {
    return {
      version: '0.1',
      lease_id: this.lease_id,
      mission_id: this.mission.mission_id,
      principal_id: this.mission.principal.id,
      agent_id: this.mission.agent.id,
      request: this.request,
      status: this.status,
      created_at: this.created_at,
      expires_at: this.expires_at,
      completed_at: this.completed_at,
      completion_reason: this.completion_reason,
      bindings: this.bindings.map((binding) => ({ ...binding })),
      facts: this.listFacts()
    };
  }

  hash() {
    return hashObject(this.snapshot());
  }

  matchingBindings(request = {}) {
    return this.bindings.filter((binding) =>
      matchPattern(binding.service, request.service) && matchPattern(binding.action, request.action)
    );
  }

  evaluate(runtime, request, now = new Date()) {
    if (!runtime || typeof runtime.evaluate !== 'function') throw new Error('authority runtime is required');

    if (this.status !== 'active') {
      const result = deny('task_lease_completed', this.completion_reason || 'task lease has completed');
      return { result, receipt: taskReceipt(this, request, result) };
    }

    if (this.expires_at) {
      const expires = new Date(this.expires_at);
      if (Number.isNaN(expires.getTime())) {
        const result = deny('invalid_task_lease_expiry', 'task lease expiry is not a valid date');
        return { result, receipt: taskReceipt(this, request, result) };
      }
      if (now >= expires) {
        const result = deny('task_lease_expired', `task lease expired at ${this.expires_at}`);
        return { result, receipt: taskReceipt(this, request, result) };
      }
    }

    // The mission remains the ceiling. A task lease can only narrow an action
    // that the mission already permits; it can never override DENY or approval.
    const base = runtime.evaluate(this.mission, request);
    if (base.result.decision !== 'allow') {
      return { result: base.result, receipt: taskReceipt(this, request, base.result) };
    }

    for (const binding of this.matchingBindings(request)) {
      const fact = this.facts.get(binding.fact_id);
      if (!fact) {
        const result = deny(
          'authority_fact_unresolved',
          `task has not established authority fact ${binding.fact_id}`,
          { binding }
        );
        return { result, receipt: taskReceipt(this, request, result) };
      }

      const actual = request?.context?.[binding.context_field];
      if (actual === undefined || actual === null) {
        const result = deny(
          'authority_context_missing',
          `request context.${binding.context_field} is required by task authority`,
          { binding }
        );
        return { result, receipt: taskReceipt(this, request, result) };
      }

      if (!sameValue(actual, fact.value)) {
        const result = approval(
          'authority_delta_required',
          `request context.${binding.context_field} is outside the task's derived authority`,
          {
            authority_delta: {
              service: request.service,
              action: request.action,
              context_field: binding.context_field,
              requested_value: actual,
              current_fact_id: fact.fact_id
            }
          }
        );
        return { result, receipt: taskReceipt(this, request, result) };
      }
    }

    return { result: base.result, receipt: taskReceipt(this, request, base.result) };
  }
}

export function createTaskLease(options) {
  return new TaskLease(options);
}
