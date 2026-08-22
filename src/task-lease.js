import { randomUUID } from 'node:crypto';
import { assertMission, createReceipt, hashObject, matchPattern } from './index.js';
import {
  resolveEvidenceSelector,
  runAuthorityExtractor,
  verifyExecutionEvidence
} from './authority-evidence.js';

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
 * anchored to an ALLOW receipt produced inside the same lease and to at least
 * one existing authority fact. This lets authority follow resources discovered
 * during authorized execution without becoming a standing wildcard permission.
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

  /**
   * Legacy host-trusted derivation path.
   *
   * The caller supplies both value and selector. Keep this API for compatibility,
   * but prefer deriveFromEvidence() for authority-relevant provider outputs.
   */
  derive({ fact_id, kind = 'opaque', value, from = [], receipt, selector } = {}) {
    if (!fact_id) throw new Error('derived fact_id is required');
    if (value === undefined) throw new Error('derived value is required');
    if (this.facts.has(fact_id)) throw authorityError('fact_exists', `authority fact ${fact_id} already exists`);
    if (!receipt) throw authorityError('receipt_required', 'derived authority requires an authorized source receipt');
    if (receipt.decision !== 'allow') throw authorityError('receipt_not_authorized', 'derived authority requires an ALLOW receipt');
    if (receipt.mission_id !== this.mission.mission_id) {
      throw authorityError('receipt_mission_mismatch', 'source receipt belongs to another mission');
    }
    if (receipt.task_lease_id !== this.lease_id) {
      throw authorityError('receipt_lease_mismatch', 'source receipt belongs to another task lease');
    }
    if (typeof selector !== 'string' || selector.trim() === '') {
      throw authorityError('selector_required', 'derived authority must record the trusted output selector used to obtain the value');
    }

    const parents = [...new Set(from)];
    if (parents.length === 0) {
      throw authorityError('parent_fact_required', 'derived authority must descend from at least one existing task authority fact');
    }
    for (const parentId of parents) {
      if (!this.facts.has(parentId)) throw authorityError('parent_fact_missing', `authority fact ${parentId} does not exist`);
    }

    const fact = {
      fact_id,
      kind,
      value,
      provenance: {
        type: 'derived',
        derivation_mode: 'host-trusted',
        from: parents,
        task_lease_id: this.lease_id,
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.receipt_hash,
        source_service: receipt.service,
        source_action: receipt.action,
        source_request_hash: receipt.request_hash,
        selector: selector.trim()
      },
      created_at: new Date().toISOString()
    };
    this.facts.set(fact_id, fact);
    return structuredClone(fact);
  }

  /**
   * Strict derivation path for provider data.
   *
   * The caller cannot supply the authority value. A trusted adapter extractor
   * identifies one normalized output selector, TaskLease resolves that selector
   * itself, and execution evidence proves the output still matches the exact
   * ALLOW receipt returned by guard.run().
   */
  deriveFromEvidence({
    fact_id,
    kind = 'opaque',
    from = [],
    receipt,
    evidence,
    output,
    extractor
  } = {}) {
    if (!fact_id) throw new Error('derived fact_id is required');
    if (this.facts.has(fact_id)) throw authorityError('fact_exists', `authority fact ${fact_id} already exists`);
    if (!receipt) throw authorityError('receipt_required', 'derived authority requires an authorized source receipt');
    if (receipt.decision !== 'allow') throw authorityError('receipt_not_authorized', 'derived authority requires an ALLOW receipt');
    if (receipt.mission_id !== this.mission.mission_id) {
      throw authorityError('receipt_mission_mismatch', 'source receipt belongs to another mission');
    }
    if (receipt.task_lease_id !== this.lease_id) {
      throw authorityError('receipt_lease_mismatch', 'source receipt belongs to another task lease');
    }

    const parents = [...new Set(from)];
    if (parents.length === 0) {
      throw authorityError('parent_fact_required', 'derived authority must descend from at least one existing task authority fact');
    }
    for (const parentId of parents) {
      if (!this.facts.has(parentId)) throw authorityError('parent_fact_missing', `authority fact ${parentId} does not exist`);
    }

    verifyExecutionEvidence({ receipt, output, evidence });
    const extraction = runAuthorityExtractor({ extractor, receipt, output });
    const value = resolveEvidenceSelector(output, extraction.selector);

    const fact = {
      fact_id,
      kind,
      value,
      provenance: {
        type: 'derived',
        derivation_mode: 'execution-evidence-v1',
        from: parents,
        task_lease_id: this.lease_id,
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.receipt_hash,
        source_service: receipt.service,
        source_action: receipt.action,
        source_request_hash: receipt.request_hash,
        selector: extraction.selector,
        extractor_id: extraction.extractor_id,
        source_output_hash: evidence.output_hash,
        execution_evidence_hash: evidence.evidence_hash
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
    const base = runtime.evaluate(this.mission, request, now);
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
