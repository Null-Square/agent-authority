import { randomUUID } from 'node:crypto';

import { AuthorityRuntime } from './index.js';
import { createTaskLease } from './task-lease.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from './guard.js';
import { createDurableTaskLeaseSession } from './durable-task-lease.js';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function principalRecord(value) {
  if (typeof value === 'string') return { id: requiredString(value, 'principal') };
  if (value?.id) return structuredClone(value);
  throw new Error('principal must be an id string or { id } object');
}

function agentRecord(value) {
  if (typeof value === 'string') return { id: requiredString(value, 'agent') };
  if (value?.id) return structuredClone(value);
  throw new Error('agent must be an id string or { id } object');
}

function factId(name) {
  const normalized = requiredString(name, 'authority name');
  return normalized.startsWith('fact:') ? normalized : `fact:${normalized}`;
}

function normalizePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new Error('permissions must be a service -> policy object');
  }

  const resources = Object.entries(permissions).map(([service, policy]) => {
    requiredString(service, 'permission service');
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      throw new Error(`permissions.${service} must be an object`);
    }
    if (!Array.isArray(policy.allow) || policy.allow.length === 0) {
      throw new Error(`permissions.${service}.allow must contain at least one action`);
    }
    return {
      service,
      allow: [...policy.allow],
      deny: Array.isArray(policy.deny) ? [...policy.deny] : [],
      constraints: structuredClone(policy.constraints || {})
    };
  });

  if (resources.length === 0) throw new Error('permissions must contain at least one service');
  return resources;
}

function normalizeAuthorityRoots(authority = {}) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    throw new Error('authority must be a name -> value definition object');
  }

  return Object.entries(authority).map(([name, definition]) => {
    const normalized = definition && typeof definition === 'object' && !Array.isArray(definition) && Object.hasOwn(definition, 'value')
      ? definition
      : { value: definition };
    if (normalized.value === undefined) throw new Error(`authority.${name}.value is required`);
    return {
      fact_id: factId(name),
      kind: normalized.kind || 'opaque',
      value: structuredClone(normalized.value),
      source: normalized.source || 'task-entry'
    };
  });
}

function normalizeBinding(binding) {
  if (!binding || typeof binding !== 'object') throw new Error('binding must be an object');
  return {
    service: requiredString(binding.service, 'binding.service'),
    action: requiredString(binding.action, 'binding.action'),
    context_field: requiredString(binding.field || binding.context_field, 'binding.field'),
    fact_id: factId(binding.authority || binding.fact_id),
    relation: binding.relation || 'exact'
  };
}

function buildMission({
  mission,
  principal,
  agent,
  request,
  objective,
  permissions,
  constraints = {},
  approvals = [],
  mission_id
}) {
  if (mission) return structuredClone(mission);

  return {
    version: '0.1',
    mission_id: mission_id || `mission:task:${randomUUID()}`,
    principal: principalRecord(principal),
    agent: agentRecord(agent),
    objective: objective || requiredString(request, 'request'),
    resources: normalizePermissions(permissions),
    constraints: structuredClone(constraints || {}),
    approvals: structuredClone(approvals || [])
  };
}

function resultFrom(value) {
  if (!value) return null;
  if (value.result?.decision) return value.result;
  if (value.decision) return value;
  return null;
}

function assertAllowedExecution(execution) {
  const decision = execution?.result?.decision;
  if (decision === 'deny') throw new AuthorityDeniedError(execution);
  if (decision === 'require_approval') throw new AuthorityApprovalRequiredError(execution);
  if (decision !== 'allow') {
    throw new AuthorityDeniedError({
      ...execution,
      result: {
        ...(execution?.result || {}),
        decision: 'deny',
        code: 'unknown_decision',
        reason: 'authority returned an unsupported decision'
      }
    });
  }
  return execution;
}

/**
 * Product-facing task authority facade.
 *
 * It intentionally does not replace Mission/TaskLease. It composes those
 * primitives into the small surface most agent developers need: run an effect,
 * execute through a connected provider, derive named authority from guarded
 * output, bind that authority to later effects, explain step-up decisions, and
 * complete the task.
 */
export class AgentTask {
  constructor({ lease, runtime = new AuthorityRuntime() } = {}) {
    if (!lease || typeof lease.evaluate !== 'function') throw new Error('task lease/session is required');
    if (!runtime || typeof runtime.evaluate !== 'function') throw new Error('authority runtime is required');
    this._lease = lease;
    this.runtime = runtime;
    this.guard = createTaskLeaseGuard({ lease, runtime });
  }

  get id() { return this._lease.lease_id; }
  get status() { return this._lease.status; }
  get mission() { return structuredClone(this._lease.mission); }

  /**
   * Guard an application-owned effect callback.
   */
  run(request, effect) {
    return this.guard.run(request, effect);
  }

  /**
   * Execute through an Agent Authority connected-provider runtime.
   *
   * Credentials remain inside the runtime/broker. The caller receives only the
   * sanitized provider output, ALLOW receipt and execution evidence. Deny and
   * step-up decisions use the same public error classes as run().
   */
  async execute(request) {
    if (typeof this.runtime.executeTaskLease !== 'function') {
      throw new Error('task runtime does not support connected provider execution');
    }
    const execution = await this.runtime.executeTaskLease(this._lease, request);
    return assertAllowedExecution(execution);
  }

  authorityFrom(execution, { name, fact_id, kind = 'opaque', from = [], extractor } = {}) {
    if (!execution?.receipt || !execution?.evidence || !Object.hasOwn(execution, 'output')) {
      throw new Error('authorityFrom() requires the result returned by task.run() or task.execute()');
    }
    const parents = Array.isArray(from) ? from : [from];
    return this._lease.deriveFromEvidence({
      fact_id: factId(fact_id || name),
      kind,
      from: parents.map(factId),
      receipt: execution.receipt,
      evidence: execution.evidence,
      output: execution.output,
      extractor
    });
  }

  bind(binding) {
    return this._lease.bind(normalizeBinding(binding));
  }

  authority(name) {
    return this._lease.fact(factId(name));
  }

  authorities() {
    return this._lease.listFacts();
  }

  complete(reason = 'task completed') {
    return this._lease.complete(reason);
  }

  explain(value) {
    const result = resultFrom(value);
    if (!result) return { decision: 'unknown', code: 'unknown', summary: 'No Agent Authority decision was available.' };

    if (result.code === 'authority_delta_required') {
      const delta = result.authority_delta || {};
      const established = delta.current_fact_id ? this._lease.fact(delta.current_fact_id) : null;
      const relation = delta.relation || 'exact';
      let summary;
      if (relation === 'oneOf') {
        summary = `The task allows one of ${JSON.stringify(established?.value)} but this action requested ${JSON.stringify(delta.requested_value)}.`;
      } else if (relation === 'max') {
        summary = `The task established a maximum of ${JSON.stringify(established?.value)} but this action requested ${JSON.stringify(delta.requested_value)}.`;
      } else {
        summary = `The task established authority for ${JSON.stringify(established?.value)} but this action requested ${JSON.stringify(delta.requested_value)}.`;
      }
      return {
        decision: result.decision,
        code: result.code,
        summary,
        service: delta.service,
        action: delta.action,
        field: delta.context_field,
        relation,
        established_authority: established,
        requested_value: structuredClone(delta.requested_value)
      };
    }

    return {
      decision: result.decision,
      code: result.code || null,
      summary: result.reason || 'Agent Authority returned a decision.'
    };
  }
}

export function createTask({
  mission = null,
  principal = null,
  agent = null,
  request,
  objective = null,
  permissions = null,
  constraints = {},
  approvals = [],
  mission_id = null,
  authority = {},
  bindings = [],
  expires_at = null,
  runtime = new AuthorityRuntime(),
  store = null
} = {}) {
  const resolvedMission = buildMission({
    mission,
    principal,
    agent,
    request,
    objective,
    permissions,
    constraints,
    approvals,
    mission_id
  });

  const lease = createTaskLease({
    mission: resolvedMission,
    request,
    roots: normalizeAuthorityRoots(authority),
    bindings: bindings.map(normalizeBinding),
    expires_at
  });

  const authorityLease = store ? createDurableTaskLeaseSession({ store, lease }) : lease;
  return new AgentTask({ lease: authorityLease, runtime });
}
