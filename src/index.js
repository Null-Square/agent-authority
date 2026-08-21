import { createHash, randomUUID } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function matchPattern(pattern, value) {
  if (typeof pattern !== 'string' || typeof value !== 'string') return false;
  if (pattern === '*' || pattern === value) return true;
  if (pattern.endsWith('*')) return value.startsWith(pattern.slice(0, -1));
  return false;
}

function anyMatch(patterns, value) {
  return patterns.some((pattern) => matchPattern(pattern, value));
}

function asPatterns(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [String(value)];
}

function contextConstraintFailure(constraints = {}, context = {}) {
  for (const [field, allowed] of Object.entries(constraints)) {
    if (context[field] === undefined || context[field] === null) {
      return { code: 'resource_context_missing', reason: `request context.${field} is required by mission policy` };
    }
    const value = String(context[field]);
    if (!anyMatch(asPatterns(allowed), value)) {
      return { code: 'resource_constraint_mismatch', reason: `request context.${field} is outside mission authority` };
    }
  }
  return null;
}

function patternCovers(parentPattern, childPattern) {
  if (parentPattern === '*') return true;
  if (parentPattern === childPattern) return true;
  if (typeof parentPattern === 'string' && parentPattern.endsWith('*')) {
    return String(childPattern).startsWith(parentPattern.slice(0, -1));
  }
  return false;
}

function constraintsAreAttenuated(parentConstraints = {}, childConstraints = {}) {
  for (const [field, parentAllowedRaw] of Object.entries(parentConstraints)) {
    const childAllowedRaw = childConstraints[field];
    if (childAllowedRaw === undefined) return false;
    const parentAllowed = asPatterns(parentAllowedRaw);
    const childAllowed = asPatterns(childAllowedRaw);
    if (childAllowed.length === 0) return false;
    for (const childPattern of childAllowed) {
      if (!parentAllowed.some((parentPattern) => patternCovers(parentPattern, childPattern))) return false;
    }
  }
  return true;
}

export function validateMission(mission) {
  const errors = [];
  if (!mission || typeof mission !== 'object') return { ok: false, errors: ['mission must be an object'] };
  if (!mission.version) errors.push('version is required');
  if (!mission.mission_id) errors.push('mission_id is required');
  if (!mission.principal?.id) errors.push('principal.id is required');
  if (!mission.agent?.id) errors.push('agent.id is required');
  if (!mission.objective) errors.push('objective is required');
  if (!Array.isArray(mission.resources) || mission.resources.length === 0) {
    errors.push('resources must contain at least one service');
  } else {
    mission.resources.forEach((resource, index) => {
      if (!resource?.service) errors.push(`resources[${index}].service is required`);
      if (!Array.isArray(resource?.allow)) errors.push(`resources[${index}].allow must be an array`);
      if (resource?.deny !== undefined && !Array.isArray(resource.deny)) errors.push(`resources[${index}].deny must be an array`);
      if (resource?.constraints !== undefined && (typeof resource.constraints !== 'object' || Array.isArray(resource.constraints))) {
        errors.push(`resources[${index}].constraints must be an object`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

export function assertMission(mission) {
  const result = validateMission(mission);
  if (!result.ok) throw new Error(`Invalid mission: ${result.errors.join('; ')}`);
  return mission;
}

function deny(code, reason) {
  return { decision: 'deny', code, reason };
}

export function evaluateMissionPolicy(missionInput, request, now = new Date()) {
  const mission = assertMission(missionInput);
  const { service, action, context = {} } = request || {};
  if (!service || !action) return deny('invalid_request', 'service and action are required');

  const expiresAt = mission.constraints?.expires_at;
  if (expiresAt) {
    const parsedExpiry = new Date(expiresAt);
    if (Number.isNaN(parsedExpiry.getTime())) return deny('invalid_mission_expiry', 'mission expiry is not a valid date');
    if (now >= parsedExpiry) return deny('mission_expired', `mission expired at ${expiresAt}`);
  }

  const depth = request.delegation_depth ?? mission.delegation?.depth ?? 0;
  const maxDepth = mission.constraints?.max_delegation_depth;
  if (maxDepth !== undefined && depth > maxDepth) return deny('delegation_depth_exceeded', `delegation depth ${depth} exceeds ${maxDepth}`);

  const budget = mission.constraints?.budget;
  if (budget && context.amount !== undefined) {
    const amount = Number(context.amount);
    if (!Number.isFinite(amount) || amount < 0) return deny('invalid_amount', 'request amount must be a non-negative number');
    if (context.currency && context.currency !== budget.currency) return deny('budget_currency_mismatch', 'request currency does not match mission budget');
    if (amount > Number(budget.amount)) return deny('budget_exceeded', `requested amount ${context.amount} exceeds mission cap ${budget.amount}`);
  }

  const candidates = mission.resources.filter((item) => matchPattern(item.service, service));
  if (candidates.length === 0) return deny('service_not_authorized', `${service} is outside this mission`);

  const explicitDeny = candidates.find((resource) => anyMatch(resource.deny || [], action));
  if (explicitDeny) return deny('explicit_deny', `${service}:${action} is explicitly denied`);

  const actionCandidates = candidates.filter((resource) => anyMatch(resource.allow || [], action));
  if (actionCandidates.length === 0) return deny('action_not_authorized', `${service}:${action} is not allowed by this mission`);

  let matchedResource = null;
  let lastConstraintFailure = null;
  for (const resource of actionCandidates) {
    const failure = contextConstraintFailure(resource.constraints || {}, context);
    if (!failure) {
      matchedResource = resource;
      break;
    }
    lastConstraintFailure = failure;
  }

  if (!matchedResource) {
    return deny(
      lastConstraintFailure?.code || 'resource_constraint_mismatch',
      lastConstraintFailure?.reason || 'request resource is outside mission authority'
    );
  }

  const approval = (mission.approvals || []).find((rule) => {
    const m = rule.match || {};
    if (m.service && !matchPattern(m.service, service)) return false;
    if (m.action && !matchPattern(m.action, action)) return false;
    if (m.amount_gt !== undefined && !(Number(context.amount) > Number(m.amount_gt))) return false;
    if (m.context && contextConstraintFailure(m.context, context)) return false;
    return rule.required;
  });

  if (approval) {
    return {
      decision: 'require_approval',
      reason: approval.reason || 'human approval required by mission policy',
      rule: approval,
      matched_resource: matchedResource.service
    };
  }

  return {
    decision: 'allow',
    reason: 'authorized by mission policy',
    matched_resource: matchedResource.service
  };
}

export function createReceipt({ mission, request, result, parent_receipt_id = null }) {
  const receipt = {
    receipt_id: `receipt:${randomUUID()}`,
    version: '0.1',
    timestamp: new Date().toISOString(),
    mission_id: mission.mission_id,
    principal_id: mission.principal.id,
    agent_id: mission.agent.id,
    service: request.service,
    action: request.action,
    decision: result.decision,
    reason: result.reason,
    request_hash: hashObject(request),
    mission_hash: hashObject(mission),
    parent_receipt_id
  };
  return { ...receipt, receipt_hash: hashObject(receipt) };
}

export class InMemoryRevocationStore {
  constructor() { this.revoked = new Map(); }
  revoke(missionId, reason = 'revoked by principal') {
    const record = { reason, revoked_at: new Date().toISOString() };
    this.revoked.set(missionId, record);
    return record;
  }
  get(missionId) { return this.revoked.get(missionId) || null; }
}

export class AdapterRegistry {
  constructor() { this.adapters = []; }
  register(adapter) { this.adapters.push(adapter); return this; }
  resolve(service) { return this.adapters.find((adapter) => adapter.supports(service)); }
}

export function descriptorAdapter(kind, services) {
  return {
    kind,
    supports(service) { return services.some((pattern) => matchPattern(pattern, service)); },
    async prepare({ mission, request }) {
      return {
        kind,
        service: request.service,
        action: request.action,
        mission_id: mission.mission_id,
        note: `${kind} adapter descriptor only; production credential exchange is not implemented yet`
      };
    }
  };
}

export class AuthorityRuntime {
  constructor({ adapters = new AdapterRegistry(), revocations = new InMemoryRevocationStore() } = {}) {
    this.adapters = adapters;
    this.revocations = revocations;
  }

  revoke(missionId, reason) { return this.revocations.revoke(missionId, reason); }

  evaluate(missionInput, request, now = new Date()) {
    const mission = assertMission(missionInput);
    const revoked = this.revocations.get(mission.mission_id);
    const result = revoked ? deny('mission_revoked', revoked.reason) : evaluateMissionPolicy(mission, request, now);
    return { result, receipt: createReceipt({ mission, request, result }) };
  }

  async prepare(missionInput, request, now = new Date()) {
    const evaluation = this.evaluate(missionInput, request, now);
    if (evaluation.result.decision !== 'allow') return evaluation;
    const adapter = this.adapters.resolve(request.service);
    if (!adapter) return { ...evaluation, dispatch: null };
    return { ...evaluation, dispatch: await adapter.prepare({ mission: missionInput, request }) };
  }
}

export function deriveMission(parentInput, childSpec) {
  const parent = assertMission(parentInput);
  const parentDepth = parent.delegation?.depth ?? 0;
  const maxDepth = parent.constraints?.max_delegation_depth ?? 0;
  if (parentDepth >= maxDepth) throw new Error('parent mission cannot delegate further');
  if (!childSpec?.agent?.id) throw new Error('childSpec.agent.id is required');
  if (!Array.isArray(childSpec.resources) || childSpec.resources.length === 0) throw new Error('childSpec.resources are required');

  for (const childResource of childSpec.resources) {
    const parentResources = parent.resources.filter((r) => matchPattern(r.service, childResource.service));
    if (parentResources.length === 0) throw new Error(`child service ${childResource.service} is not authorized by parent`);

    const compatibleParent = parentResources.find((parentResource) => {
      for (const childAllow of childResource.allow || []) {
        if ((parentResource.deny || []).some((d) => matchPattern(d, childAllow))) return false;
        if (!(parentResource.allow || []).some((a) => matchPattern(a, childAllow))) return false;
      }
      return constraintsAreAttenuated(parentResource.constraints || {}, childResource.constraints || {});
    });

    if (!compatibleParent) throw new Error(`child authority for ${childResource.service} expands parent authority`);
  }

  return assertMission({
    version: parent.version,
    mission_id: childSpec.mission_id || `mission:${randomUUID()}`,
    principal: parent.principal,
    agent: childSpec.agent,
    objective: childSpec.objective || `Delegated task under ${parent.mission_id}`,
    resources: childSpec.resources,
    constraints: {
      ...childSpec.constraints,
      max_delegation_depth: Math.min(
        childSpec.constraints?.max_delegation_depth ?? 0,
        Math.max(0, maxDepth - parentDepth - 1)
      )
    },
    approvals: childSpec.approvals || parent.approvals || [],
    delegation: { parent_mission_id: parent.mission_id, depth: parentDepth + 1 }
  });
}
