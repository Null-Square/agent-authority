import { evidenceMatch } from './automatic-contracts.mjs';
import { projectMutation, valueKey } from './projection.mjs';
import { inferStrictSource } from './strict-automatic-contracts.mjs';

function valueAllowed(allowed, value) {
  const key = valueKey(value);
  return (allowed || []).some((candidate) => valueKey(candidate) === key);
}

function tupleAllowed(tuples, fields) {
  if (!tuples?.length) return true;
  return tuples.some((tuple) => Object.entries(tuple).every(([field, value]) => valueKey(fields[field]) === valueKey(value)));
}

function hasSelectorMatch(spec) {
  return (spec.matchKinds || []).some((kind) => String(kind).startsWith('selector-'));
}

function priorEvidenceMatch(trace, targetIndex, value, sourceActions, { allowRequest = false } = {}) {
  const allowedSources = new Set(sourceActions || []);
  for (let index = 0; index < targetIndex; index += 1) {
    const event = trace[index];
    if (allowedSources.size && !allowedSources.has(event.action)) continue;
    if (evidenceMatch(event.result, value).matched) return true;
    if (allowRequest && evidenceMatch(event.args, value).matched) return true;
  }
  return false;
}

function dynamicAllowed(contract, trace, index, event, projected, mode) {
  const rule = contract.actions[event.action];
  for (const [field, spec] of Object.entries(rule.dynamic || {})) {
    const value = projected.fields[field];
    if (value === undefined) continue;

    if (mode === 'unrestricted') continue;

    if (mode === 'provenance' || mode === 'request-provenance') {
      if (hasSelectorMatch(spec)) {
        if (!priorEvidenceMatch(trace, index, value, spec.sourceActions, { allowRequest: mode === 'request-provenance' })) {
          return { allowed: false, reason: { index, code: 'publication_provenance_mismatch', action: event.action, field } };
        }
        continue;
      }

      const inferred = inferStrictSource(trace, index, value, contract.prompt, {
        sourceActions: spec.sourceActions,
        matchKinds: spec.matchKinds
      });
      if (inferred) continue;
      if (mode === 'request-provenance' && priorEvidenceMatch(trace, index, value, spec.sourceActions, { allowRequest: true })) continue;
      return { allowed: false, reason: { index, code: 'publication_evidence_mismatch', action: event.action, field } };
    }

    const inferred = inferStrictSource(trace, index, value, contract.prompt, {
      sourceActions: spec.sourceActions,
      matchKinds: spec.matchKinds
    });
    if (!inferred) return { allowed: false, reason: { index, code: 'publication_strict_evidence_mismatch', action: event.action, field } };
  }
  return { allowed: true };
}

export const PUBLICATION_POLICIES = Object.freeze({
  full: {
    label: 'Agent Authority (full)',
    dynamicMode: 'strict',
    cardinality: true,
    precedence: true,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  },
  'standing-action': {
    label: 'Standing action authority',
    dynamicMode: 'unrestricted',
    cardinality: false,
    precedence: false,
    tuples: false,
    staticFields: false,
    actionCeilingOnly: true
  },
  'output-provenance': {
    label: 'Output provenance without selection witnesses',
    dynamicMode: 'provenance',
    cardinality: true,
    precedence: true,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  },
  'request-or-output-provenance': {
    label: 'Request/output provenance',
    dynamicMode: 'request-provenance',
    cardinality: true,
    precedence: true,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  },
  'no-cardinality': {
    label: 'Ablation: no cardinality',
    dynamicMode: 'strict',
    cardinality: false,
    precedence: true,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  },
  'no-precedence': {
    label: 'Ablation: no precedence',
    dynamicMode: 'strict',
    cardinality: true,
    precedence: false,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  },
  'no-tuples': {
    label: 'Ablation: no tuple/correlation constraints',
    dynamicMode: 'strict',
    cardinality: true,
    precedence: true,
    tuples: false,
    staticFields: true,
    actionCeilingOnly: false
  },
  'unrestricted-dynamic': {
    label: 'Ablation: unrestricted dynamic fields',
    dynamicMode: 'unrestricted',
    cardinality: true,
    precedence: true,
    tuples: true,
    staticFields: true,
    actionCeilingOnly: false
  }
});

export function evaluatePublicationPolicy(contract, trace, policyName = 'full') {
  const policy = PUBLICATION_POLICIES[policyName];
  if (!policy) throw new Error(`unknown publication policy: ${policyName}`);

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
    if (policy.actionCeilingOnly) {
      seenActions.add(event.action);
      continue;
    }

    const nextCount = (counts.get(event.action) || 0) + 1;
    counts.set(event.action, nextCount);
    if (policy.cardinality && nextCount > rule.maxCount) {
      return { allowed: false, reasons: [{ index, code: 'count_exceeded', action: event.action }] };
    }

    if (policy.precedence) {
      for (const requiredAction of rule.precedenceActions || []) {
        if (!seenActions.has(requiredAction)) {
          return { allowed: false, reasons: [{ index, code: 'precedence_missing', action: event.action, requiredAction }] };
        }
      }
    }

    const dynamic = dynamicAllowed(contract, trace, index, event, projected, policy.dynamicMode);
    if (!dynamic.allowed) return { allowed: false, reasons: [dynamic.reason] };

    if (policy.staticFields) {
      for (const [field, allowed] of Object.entries(rule.fields || {})) {
        const value = projected.fields[field];
        if (value !== undefined && !valueAllowed(allowed, value)) {
          return { allowed: false, reasons: [{ index, code: 'field_not_allowed', action: event.action, field }] };
        }
      }
    }

    if (policy.tuples && !tupleAllowed(rule.tuples, projected.fields)) {
      return { allowed: false, reasons: [{ index, code: 'tuple_not_allowed', action: event.action }] };
    }

    seenActions.add(event.action);
  }

  return { allowed: true, reasons: [] };
}
