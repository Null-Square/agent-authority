import fs from 'node:fs';

import { clone, projectMutation, valueKey } from './projection.mjs';
import { compileAutomaticContract, directTrace, evaluateAutomaticContract } from './automatic-contracts.mjs';

const path = process.argv[2];
if (!path) throw new Error('usage: node diagnose-automatic-contract.mjs <direct-agentdojo-json>');
const direct = JSON.parse(fs.readFileSync(path, 'utf8'));

function replacementFor(value, salt = 1) {
  if (typeof value === 'number') return value + 37 + salt / 10;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'string') {
    if (value.includes('@')) {
      const [local, domain] = value.split('@');
      return `${local}+variant${salt}@${domain}`;
    }
    return `variant-${salt}-${value}`;
  }
  if (Array.isArray(value)) return value.map((item, index) => replacementFor(item, salt + index));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item], index) => [key, replacementFor(item, salt + index)]));
  }
  return `variant-${salt}`;
}

function replacementForField(field, value, salt) {
  if (field === 'deadline_token') {
    const day = String((salt % 27) + 1).padStart(2, '0');
    return `2099-12-${day}`;
  }
  return replacementFor(value, salt);
}

function setProjectedField(event, field, value) {
  if (field === 'deadline_token') {
    event.args.body = String(event.args.body || '').replace(/20\d{2}-\d{2}-\d{2}/, String(value));
  } else {
    event.args[field] = clone(value);
  }
}

function mutationEvents(trace) {
  return trace.map((event, index) => ({ event, index, projected: projectMutation(event) })).filter((entry) => entry.projected);
}

function buildCatalog(tasks) {
  const catalog = new Map();
  for (const source of tasks) {
    for (const { projected } of mutationEvents(directTrace(source))) {
      for (const [field, value] of Object.entries(projected.fields)) {
        const key = `${projected.action}\u0000${field}`;
        const entries = catalog.get(key) || [];
        entries.push({ task: source.pilot_id, value: clone(value) });
        catalog.set(key, entries);
      }
    }
  }
  return catalog;
}

const catalog = buildCatalog(direct.tasks);
const report = { allowedFieldMutants: [], allowedTransplants: [], unresolved: [], selectors: [], contracts: [] };

for (const source of direct.tasks) {
  const contract = compileAutomaticContract(source);
  const base = directTrace(source);
  report.unresolved.push(...contract.metadata.unresolved.map((item) => ({ task: source.pilot_id, ...item })));
  report.selectors.push(...contract.metadata.bindings.filter((binding) => binding.match.startsWith('selector-')).map((binding) => ({ task: source.pilot_id, ...binding })));

  for (const { index, projected } of mutationEvents(base)) {
    for (const [field, value] of Object.entries(projected.fields)) {
      const trace = clone(base);
      const replacement = replacementForField(field, value, index + 100);
      setProjectedField(trace[index], field, replacement);
      const evaluation = evaluateAutomaticContract(contract, trace);
      if (evaluation.allowed) {
        report.allowedFieldMutants.push({
          task: source.pilot_id,
          index,
          action: projected.action,
          field,
          original: value,
          replacement,
          dynamicRule: contract.actions[projected.action]?.dynamic?.[field] || null,
          staticRule: contract.actions[projected.action]?.fields?.[field] || null,
          tupleCount: contract.actions[projected.action]?.tuples?.length || 0
        });
      }
    }
  }

  for (const binding of contract.metadata.bindings) {
    const entries = catalog.get(`${binding.action}\u0000${binding.field}`) || [];
    const donor = entries.find((entry) => entry.task !== source.pilot_id && valueKey(entry.value) !== valueKey(binding.value));
    if (!donor) continue;
    const trace = clone(base);
    setProjectedField(trace[binding.targetIndex], binding.field, donor.value);
    const evaluation = evaluateAutomaticContract(contract, trace);
    if (evaluation.allowed) {
      report.allowedTransplants.push({
        task: source.pilot_id,
        targetIndex: binding.targetIndex,
        action: binding.action,
        field: binding.field,
        original: binding.value,
        donorTask: donor.task,
        donorValue: donor.value,
        learnedSourceIndex: binding.sourceIndex,
        learnedSourceAction: binding.sourceAction,
        learnedMatch: binding.match,
        learnedWitness: binding.witness || null,
        dynamicRule: contract.actions[binding.action]?.dynamic?.[binding.field] || null
      });
    }
  }

  report.contracts.push({
    task: source.pilot_id,
    bindings: contract.metadata.bindings,
    unresolved: contract.metadata.unresolved,
    actions: contract.actions
  });
}

report.summary = {
  allowedFieldMutants: report.allowedFieldMutants.length,
  allowedTransplants: report.allowedTransplants.length,
  unresolved: report.unresolved.length,
  selectorBindings: report.selectors.length
};

console.log(JSON.stringify(report, null, 2));
