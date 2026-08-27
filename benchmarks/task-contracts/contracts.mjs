import { AUTHORITY_SCHEMAS } from './fixtures.mjs';

function normalize(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
}

export function valueKey(value) {
  return JSON.stringify(normalize(value));
}

export function clone(value) {
  return structuredClone(value);
}

function projectField(event, name, spec) {
  if (typeof spec.derive === 'function') return spec.derive(event.args || {});
  return event.args?.[name];
}

export function projectMutation(event) {
  const schema = AUTHORITY_SCHEMAS[event.action];
  if (!schema?.mutation) {
    if (event.forceMutation) return { action: event.action, fields: {} };
    return null;
  }
  const fields = {};
  for (const [name, spec] of Object.entries(schema.fields || {})) {
    const value = projectField(event, name, spec);
    if (value !== undefined) fields[name] = value;
  }
  return { action: event.action, fields };
}

function actionStats(traces) {
  const stats = new Map();
  for (const trace of traces) {
    const perTraceCounts = new Map();
    for (const event of trace) {
      const projected = projectMutation(event);
      if (!projected) continue;
      const entry = stats.get(event.action) || {
        action: event.action,
        fieldValues: new Map(),
        tuples: new Map(),
        originFacts: new Map(),
        prerequisites: new Set(),
        maxCount: 0
      };
      perTraceCounts.set(event.action, (perTraceCounts.get(event.action) || 0) + 1);
      for (const [field, value] of Object.entries(projected.fields)) {
        if (event.origins?.[field]?.fact) {
          const facts = entry.originFacts.get(field) || new Set();
          facts.add(event.origins[field].fact);
          entry.originFacts.set(field, facts);
        } else {
          const values = entry.fieldValues.get(field) || new Map();
          values.set(valueKey(value), clone(value));
          entry.fieldValues.set(field, values);
        }
      }
      for (const fact of event.requires || []) entry.prerequisites.add(fact);
      const staticTuple = {};
      for (const [field, value] of Object.entries(projected.fields)) {
        if (!event.origins?.[field]?.fact) staticTuple[field] = value;
      }
      const tupleFields = Object.keys(staticTuple);
      if (tupleFields.length >= 2) entry.tuples.set(valueKey(staticTuple), clone(staticTuple));
      stats.set(event.action, entry);
    }
    for (const [action, count] of perTraceCounts) {
      const entry = stats.get(action);
      entry.maxCount = Math.max(entry.maxCount, count);
    }
  }
  return stats;
}

export function compileFieldwise(traces) {
  const stats = actionStats(traces);
  const actions = {};
  for (const [action] of stats) {
    const fields = {};
    for (const trace of traces) {
      for (const event of trace) {
        if (event.action !== action) continue;
        const projected = projectMutation(event);
        if (!projected) continue;
        for (const [field, value] of Object.entries(projected.fields)) {
          const values = fields[field] || new Map();
          values.set(valueKey(value), clone(value));
          fields[field] = values;
        }
      }
    }
    actions[action] = {
      fields: Object.fromEntries(Object.entries(fields).map(([field, values]) => [field, [...values.values()]]))
    };
  }
  return { kind: 'fieldwise', actions };
}

export function compileStateful(traces) {
  const stats = actionStats(traces);
  const actions = {};
  for (const [action, entry] of stats) {
    const fields = {};
    for (const [field, values] of entry.fieldValues) fields[field] = [...values.values()];

    const dataflow = {};
    for (const [field, facts] of entry.originFacts) {
      if (facts.size === 1) dataflow[field] = [...facts][0];
      else dataflow[field] = { oneOfFacts: [...facts].sort() };
    }

    const tuples = [...entry.tuples.values()];
    actions[action] = {
      fields,
      dataflow,
      tuples: tuples.length > 1 ? tuples : [],
      maxCount: entry.maxCount,
      prerequisites: [...entry.prerequisites].sort()
    };
  }
  return { kind: 'stateful-task-contract', actions };
}

function valueAllowed(allowed, value) {
  const key = valueKey(value);
  return allowed.some((candidate) => valueKey(candidate) === key);
}

function tupleAllowed(tuples, fields) {
  if (!tuples?.length) return true;
  return tuples.some((tuple) => {
    for (const [field, value] of Object.entries(tuple)) {
      if (valueKey(fields[field]) !== valueKey(value)) return false;
    }
    return true;
  });
}

function requiredFactValue(binding, facts) {
  if (typeof binding === 'string') return facts.get(binding);
  for (const fact of binding.oneOfFacts || []) {
    if (facts.has(fact)) return facts.get(fact);
  }
  return undefined;
}

export function evaluateTrace(contract, trace) {
  const counts = new Map();
  const facts = new Map();
  const reasons = [];

  for (let index = 0; index < trace.length; index += 1) {
    const event = trace[index];

    for (const [fact, value] of Object.entries(event.produces || {})) facts.set(fact, clone(value));

    const projected = projectMutation(event);
    if (!projected) continue;
    const rule = contract.actions[event.action];
    if (!rule) {
      reasons.push({ index, code: 'action_not_allowed', action: event.action });
      return { allowed: false, reasons };
    }

    if (contract.kind === 'fieldwise') {
      for (const [field, value] of Object.entries(projected.fields)) {
        const allowed = rule.fields?.[field];
        if (allowed && !valueAllowed(allowed, value)) {
          reasons.push({ index, code: 'field_not_allowed', action: event.action, field });
          return { allowed: false, reasons };
        }
      }
      continue;
    }

    const nextCount = (counts.get(event.action) || 0) + 1;
    counts.set(event.action, nextCount);
    if (rule.maxCount && nextCount > rule.maxCount) {
      reasons.push({ index, code: 'count_exceeded', action: event.action });
      return { allowed: false, reasons };
    }

    for (const fact of rule.prerequisites || []) {
      if (!facts.has(fact)) {
        reasons.push({ index, code: 'prerequisite_missing', action: event.action, fact });
        return { allowed: false, reasons };
      }
    }

    for (const [field, binding] of Object.entries(rule.dataflow || {})) {
      const expected = requiredFactValue(binding, facts);
      if (expected === undefined || valueKey(projected.fields[field]) !== valueKey(expected)) {
        reasons.push({ index, code: 'dataflow_mismatch', action: event.action, field });
        return { allowed: false, reasons };
      }
    }

    for (const [field, allowed] of Object.entries(rule.fields || {})) {
      const value = projected.fields[field];
      if (value !== undefined && !valueAllowed(allowed, value)) {
        reasons.push({ index, code: 'field_not_allowed', action: event.action, field });
        return { allowed: false, reasons };
      }
    }

    if (!tupleAllowed(rule.tuples, projected.fields)) {
      reasons.push({ index, code: 'tuple_not_allowed', action: event.action });
      return { allowed: false, reasons };
    }
  }

  return { allowed: true, reasons };
}

export function contractFamilies(contract) {
  const families = new Set(['finite-value']);
  for (const rule of Object.values(contract.actions || {})) {
    if (rule.tuples?.length) families.add('tuple-relation');
    if (rule.maxCount) families.add('cardinality');
    if (Object.keys(rule.dataflow || {}).length) families.add('dataflow-binding');
    if (rule.prerequisites?.length) families.add('precedence');
  }
  return [...families].sort();
}
