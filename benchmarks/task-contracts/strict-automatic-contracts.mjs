import { AUTHORITY_SCHEMAS } from './authority-schemas.mjs';
import { clone, projectMutation, valueKey } from './projection.mjs';
import { directTrace, evidenceMatch, numericTokens } from './automatic-contracts.mjs';

const DYNAMIC_ROLES = new Set(['destination', 'resource', 'numeric_effect', 'resource_context']);
const ROOT_BY_DEFAULT_ROLES = new Set(['identity', 'mode', 'temporal', 'created_resource_name', 'structured_content_anchor']);

function scalarLeaves(value, leaves = []) {
  if (value === null || value === undefined) return leaves;
  if (Array.isArray(value)) {
    for (const item of value) scalarLeaves(item, leaves);
    return leaves;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) scalarLeaves(item, leaves);
    return leaves;
  }
  leaves.push(value);
  return leaves;
}

function containsValue(container, target) {
  return evidenceMatch(container, target).matched;
}

function scalarCandidateSet(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (!value.every((item) => ['string', 'number'].includes(typeof item))) return null;
  const unique = [...new Map(value.map((item) => [valueKey(item), item])).values()];
  return unique.length >= 2 ? unique : null;
}

function isAmbiguousScalarMembership(container, target) {
  const values = scalarCandidateSet(container);
  return Boolean(values && values.some((value) => valueKey(value) === valueKey(target)));
}

function promptNumbers(prompt) {
  const constants = [];
  for (const match of String(prompt || '').matchAll(/(-?\d+(?:\.\d+)?)\s*(%)?/g)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    constants.push(value);
    if (match[2] === '%') constants.push(value / 100);
  }
  return [...new Set(constants)];
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-6;
}

function arithmeticCandidates(trace, targetIndex, targetValue, prompt) {
  if (typeof targetValue !== 'number' || !Number.isFinite(targetValue)) return [];
  const constants = promptNumbers(prompt);
  const candidates = [];
  for (let index = 0; index < targetIndex; index += 1) {
    for (const x of numericTokens(trace[index].result)) {
      for (const c of constants) {
        if ([x * c, x + c, x - c, c - x].some((value) => nearlyEqual(value, targetValue))) {
          candidates.push({ index, action: trace[index].action, channel: 'output', match: 'arithmetic', score: 38 });
        }
        for (const d of constants) {
          if ([x * c + d, x * c - d, x + c + d, x + c - d, x - c + d, x - c - d].some((value) => nearlyEqual(value, targetValue))) {
            candidates.push({ index, action: trace[index].action, channel: 'output', match: 'arithmetic', score: 39 });
          }
        }
      }
    }
  }
  return candidates;
}

function parsePrefixSelector(prompt) {
  const match = String(prompt || '').match(/\b(?:starting|starts|beginning|begins)\s+with\s+["'“”]?([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

function parseExtremumSelector(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/\b(smallest|fewest|least|lowest|minimum|minimal)\b/.test(text)) return 'min';
  if (/\b(most|largest|highest|maximum|maximal)\b/.test(text)) return 'max';
  return null;
}

function resultCardinality(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return null;
}

function selectorCandidates(trace, targetIndex, targetValue, prompt) {
  const candidates = [];
  const prefix = parsePrefixSelector(prompt);
  const extremum = parseExtremumSelector(prompt);

  for (let sourceIndex = 0; sourceIndex < targetIndex; sourceIndex += 1) {
    const source = trace[sourceIndex];
    const values = scalarCandidateSet(source.result);
    if (!values || !values.some((value) => valueKey(value) === valueKey(targetValue))) continue;

    if (prefix && typeof targetValue === 'string') {
      const matches = values.filter((value) => typeof value === 'string' && value.toLowerCase().startsWith(prefix.toLowerCase()));
      if (matches.length === 1 && valueKey(matches[0]) === valueKey(targetValue)) {
        candidates.push({
          index: sourceIndex,
          action: source.action,
          channel: 'selection-witness',
          match: 'selector-prefix',
          score: 100,
          witness: { kind: 'prefix', prefix, candidateSourceAction: source.action }
        });
      }
    }

    if (extremum) {
      const measurements = new Map();
      const measurementActions = new Set();
      for (const value of values) {
        for (let measureIndex = sourceIndex + 1; measureIndex < targetIndex; measureIndex += 1) {
          const measurement = trace[measureIndex];
          if (!containsValue(measurement.args, value)) continue;
          const cardinality = resultCardinality(measurement.result);
          if (cardinality === null) continue;
          measurements.set(valueKey(value), { value, cardinality, index: measureIndex, action: measurement.action });
          measurementActions.add(measurement.action);
          break;
        }
      }
      if (measurements.size !== values.length) continue;
      const rows = [...measurements.values()];
      const best = extremum === 'min'
        ? Math.min(...rows.map((row) => row.cardinality))
        : Math.max(...rows.map((row) => row.cardinality));
      const winners = rows.filter((row) => row.cardinality === best);
      if (winners.length === 1 && valueKey(winners[0].value) === valueKey(targetValue)) {
        candidates.push({
          index: sourceIndex,
          action: source.action,
          channel: 'selection-witness',
          match: extremum === 'min' ? 'selector-min-cardinality' : 'selector-max-cardinality',
          score: 110,
          witness: {
            kind: 'extremum-cardinality',
            direction: extremum,
            candidateSourceAction: source.action,
            measurementActions: [...measurementActions].sort()
          }
        });
      }
    }
  }

  return candidates;
}

export function inferStrictSource(trace, targetIndex, targetValue, prompt, restrictions = {}) {
  const candidates = [];
  const sourceActions = restrictions.sourceActions ? new Set(restrictions.sourceActions) : null;
  const matchKinds = restrictions.matchKinds ? new Set(restrictions.matchKinds) : null;

  for (const candidate of selectorCandidates(trace, targetIndex, targetValue, prompt)) {
    if (sourceActions && !sourceActions.has(candidate.action)) continue;
    if (matchKinds && !matchKinds.has(candidate.match)) continue;
    candidates.push(candidate);
  }

  for (let index = 0; index < targetIndex; index += 1) {
    const event = trace[index];
    if (sourceActions && !sourceActions.has(event.action)) continue;
    const output = evidenceMatch(event.result, targetValue);
    if (!output.matched || (matchKinds && !matchKinds.has(output.kind))) continue;
    if (isAmbiguousScalarMembership(event.result, targetValue)) continue;
    const scores = { exact: 60, numeric: 58, identity: 56, component: 50 };
    candidates.push({ index, action: event.action, channel: 'output', match: output.kind, score: scores[output.kind] || 50 });
  }

  if (!matchKinds || matchKinds.has('arithmetic')) {
    for (const candidate of arithmeticCandidates(trace, targetIndex, targetValue, prompt)) {
      if (!sourceActions || sourceActions.has(candidate.action)) candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  return candidates[0] || null;
}

function promptAnchors(prompt, value) {
  const text = String(prompt || '').toLowerCase();
  const leaves = scalarLeaves(value).filter((item) => item !== null && item !== undefined && item !== '');
  if (!leaves.length) return false;
  return leaves.every((leaf) => {
    if (typeof leaf === 'string') return leaf.length >= 3 && text.includes(leaf.toLowerCase());
    if (typeof leaf === 'number') return text.includes(String(leaf));
    return false;
  });
}

function fieldRole(action, field) {
  return AUTHORITY_SCHEMAS[action]?.fields?.[field]?.role || 'unknown';
}

function shouldAttemptBinding(prompt, action, field, value) {
  const role = fieldRole(action, field);
  if (ROOT_BY_DEFAULT_ROLES.has(role)) return { eligible: false, role, reason: 'task-root-role' };
  if (DYNAMIC_ROLES.has(role) && !promptAnchors(prompt, value)) return { eligible: true, role, reason: 'not-rooted-in-task-literal' };
  return { eligible: false, role, reason: 'task-root-or-static' };
}

function intersection(sets) {
  if (!sets.length) return new Set();
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

export function compileStrictAutomaticContract(source) {
  const trace = directTrace(source);
  const actionInstances = new Map();
  const bindings = [];
  const unresolved = [];

  for (let index = 0; index < trace.length; index += 1) {
    const event = trace[index];
    const projected = projectMutation(event);
    if (!projected) continue;
    const instances = actionInstances.get(event.action) || [];
    instances.push({
      index,
      projected,
      priorReadActions: new Set(trace.slice(0, index).filter((candidate) => !projectMutation(candidate)).map((candidate) => candidate.action))
    });
    actionInstances.set(event.action, instances);
  }

  const actions = {};
  for (const [action, instances] of actionInstances) {
    const fields = new Map();
    const dynamic = new Map();
    const staticTuples = [];

    for (const instance of instances) {
      const tuple = {};
      for (const [field, value] of Object.entries(instance.projected.fields)) {
        const eligibility = shouldAttemptBinding(source.prompt, action, field, value);
        const inferred = eligibility.eligible ? inferStrictSource(trace, instance.index, value, source.prompt) : null;
        if (inferred) {
          const entry = dynamic.get(field) || { sourceActions: new Set(), matchKinds: new Set(), role: eligibility.role, witnesses: new Map() };
          entry.sourceActions.add(inferred.action);
          entry.matchKinds.add(inferred.match);
          if (inferred.witness) entry.witnesses.set(valueKey(inferred.witness), clone(inferred.witness));
          dynamic.set(field, entry);
          bindings.push({
            targetIndex: instance.index,
            action,
            field,
            value: clone(value),
            sourceIndex: inferred.index,
            sourceAction: inferred.action,
            channel: inferred.channel,
            match: inferred.match,
            witness: inferred.witness ? clone(inferred.witness) : null,
            role: eligibility.role
          });
        } else {
          if (eligibility.eligible) unresolved.push({
            targetIndex: instance.index,
            action,
            field,
            value: clone(value),
            role: eligibility.role,
            disposition: 'static-fence'
          });
          const allowed = fields.get(field) || new Map();
          allowed.set(valueKey(value), clone(value));
          fields.set(field, allowed);
          tuple[field] = clone(value);
        }
      }
      if (Object.keys(tuple).length >= 2) staticTuples.push(tuple);
    }

    const distinctTuples = new Map(staticTuples.map((tuple) => [valueKey(tuple), tuple]));
    actions[action] = {
      maxCount: instances.length,
      fields: Object.fromEntries([...fields.entries()].map(([field, values]) => [field, [...values.values()]])),
      dynamic: Object.fromEntries([...dynamic.entries()].map(([field, spec]) => [field, {
        role: spec.role,
        sourceActions: [...spec.sourceActions].sort(),
        matchKinds: [...spec.matchKinds].sort(),
        witnesses: [...spec.witnesses.values()]
      }])),
      tuples: distinctTuples.size > 1 ? [...distinctTuples.values()] : [],
      precedenceActions: [...intersection(instances.map((instance) => instance.priorReadActions))].sort()
    };
  }

  return {
    kind: 'strict-output-or-witness-contract',
    prompt: source.prompt,
    actions,
    metadata: { bindings, unresolved }
  };
}

function valueAllowed(allowed, value) {
  const key = valueKey(value);
  return (allowed || []).some((candidate) => valueKey(candidate) === key);
}

function tupleAllowed(tuples, fields) {
  if (!tuples?.length) return true;
  return tuples.some((tuple) => Object.entries(tuple).every(([field, value]) => valueKey(fields[field]) === valueKey(value)));
}

export function evaluateStrictAutomaticContract(contract, trace) {
  const counts = new Map();
  const seenActions = new Set();

  for (let index = 0; index < trace.length; index += 1) {
    const event = trace[index];
    const projected = projectMutation(event);
    if (!projected) {
      seenActions.add(event.action);
      continue;
    }

    const rule = contract.actions[event.action];
    if (!rule) return { allowed: false, reasons: [{ index, code: 'action_not_allowed', action: event.action }] };

    const nextCount = (counts.get(event.action) || 0) + 1;
    counts.set(event.action, nextCount);
    if (nextCount > rule.maxCount) return { allowed: false, reasons: [{ index, code: 'count_exceeded', action: event.action }] };

    for (const requiredAction of rule.precedenceActions || []) {
      if (!seenActions.has(requiredAction)) return { allowed: false, reasons: [{ index, code: 'precedence_missing', action: event.action, requiredAction }] };
    }

    for (const [field, spec] of Object.entries(rule.dynamic || {})) {
      const value = projected.fields[field];
      if (value === undefined) continue;
      const inferred = inferStrictSource(trace, index, value, contract.prompt, {
        sourceActions: spec.sourceActions,
        matchKinds: spec.matchKinds
      });
      if (!inferred) return { allowed: false, reasons: [{ index, code: 'strict_evidence_binding_mismatch', action: event.action, field }] };
    }

    for (const [field, allowed] of Object.entries(rule.fields || {})) {
      const value = projected.fields[field];
      if (value !== undefined && !valueAllowed(allowed, value)) return { allowed: false, reasons: [{ index, code: 'field_not_allowed', action: event.action, field }] };
    }

    if (!tupleAllowed(rule.tuples, projected.fields)) return { allowed: false, reasons: [{ index, code: 'tuple_not_allowed', action: event.action }] };
    seenActions.add(event.action);
  }

  return { allowed: true, reasons: [] };
}
