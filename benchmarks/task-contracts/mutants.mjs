import { clone, projectMutation, valueKey } from './contracts.mjs';

function replacementFor(value) {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') return `__unauthorized__${value}`;
  if (Array.isArray(value)) return [...value, '__unauthorized__'];
  if (value && typeof value === 'object') return { ...value, __unauthorized__: true };
  return '__unauthorized__';
}

function mutationEvents(trace) {
  return trace.map((event, index) => ({ event, index, projected: projectMutation(event) })).filter((x) => x.projected);
}

export function generateMutants(task) {
  const mutants = [];
  const base = task.train[0];

  for (const { index, projected } of mutationEvents(base)) {
    for (const [field, value] of Object.entries(projected.fields)) {
      const trace = clone(base);
      trace[index].args[field] = replacementFor(value);
      if (field === 'deadline_token') {
        trace[index].args.body = String(trace[index].args.body).replace(/20\d{2}-\d{2}-\d{2}/, '2099-12-31');
      }
      mutants.push({ family: 'field', label: `${task.id}:${trace[index].action}.${field}`, trace });
    }
  }

  const lastMutation = mutationEvents(base).at(-1);
  if (lastMutation) {
    const trace = clone(base);
    trace.splice(lastMutation.index + 1, 0, clone(trace[lastMutation.index]));
    mutants.push({ family: 'repeat', label: `${task.id}:repeat:${lastMutation.event.action}`, trace });
  }

  if (task.train.length >= 2) {
    const other = task.train[1];
    for (const { index, event, projected } of mutationEvents(base)) {
      for (const [field, binding] of Object.entries(event.origins || {})) {
        if (!binding?.fact) continue;
        const otherEvent = other.find((candidate) => candidate.action === event.action && candidate.origins?.[field]?.fact === binding.fact);
        if (!otherEvent) continue;
        const otherProjected = projectMutation(otherEvent);
        if (!otherProjected) continue;
        const otherValue = otherProjected.fields[field];
        if (valueKey(otherValue) === valueKey(projected.fields[field])) continue;
        const trace = clone(base);
        trace[index].args[field] = clone(otherValue);
        if (field === 'attachments') trace[index].args.attachments = clone(otherValue);
        mutants.push({ family: 'transplant', label: `${task.id}:transplant:${event.action}.${field}`, trace });
      }
    }
  }

  for (const { index, event } of mutationEvents(base)) {
    const facts = new Set([...(event.requires || []), ...Object.values(event.origins || {}).map((x) => x?.fact).filter(Boolean)]);
    if (!facts.size) continue;
    let producerIndex = -1;
    for (let i = 0; i < index; i += 1) {
      const produced = Object.keys(base[i].produces || {});
      if (produced.some((fact) => facts.has(fact))) producerIndex = i;
    }
    if (producerIndex >= 0) {
      const trace = clone(base);
      const [consumer] = trace.splice(index, 1);
      trace.splice(producerIndex, 0, consumer);
      mutants.push({ family: 'order', label: `${task.id}:order:${event.action}`, trace });
      break;
    }
  }

  const byAction = new Map();
  for (const { index, projected } of mutationEvents(base)) {
    const list = byAction.get(projected.action) || [];
    list.push({ index, fields: projected.fields });
    byAction.set(projected.action, list);
  }
  for (const [action, entries] of byAction) {
    if (entries.length < 2) continue;
    const fields = Object.keys(entries[0].fields).filter((field) => entries.every((entry) => field in entry.fields));
    if (fields.length < 2) continue;
    outer: for (let a = 0; a < entries.length; a += 1) {
      for (let b = a + 1; b < entries.length; b += 1) {
        for (let i = 0; i < fields.length; i += 1) {
          for (let j = 0; j < fields.length; j += 1) {
            if (i === j) continue;
            const candidate = clone(entries[a].fields);
            candidate[fields[j]] = clone(entries[b].fields[fields[j]]);
            const candidateKey = valueKey(candidate);
            if (entries.some((entry) => valueKey(entry.fields) === candidateKey)) continue;
            const trace = clone(base);
            const target = trace[entries[a].index];
            const field = fields[j];
            if (field === 'deadline_token') {
              target.args.body = String(target.args.body).replace(/20\d{2}-\d{2}-\d{2}/, candidate[field]);
            } else {
              target.args[field] = clone(candidate[field]);
            }
            mutants.push({ family: 'cross-product', label: `${task.id}:cross-product:${action}`, trace });
            break outer;
          }
        }
      }
    }
  }

  if (lastMutation) {
    const trace = clone(base);
    trace[lastMutation.index].action = `dangerous_${lastMutation.event.action}`;
    trace[lastMutation.index].forceMutation = true;
    mutants.push({ family: 'action', label: `${task.id}:stronger-action`, trace });
  }

  return mutants;
}
