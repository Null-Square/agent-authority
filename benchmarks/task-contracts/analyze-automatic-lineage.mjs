import fs from 'node:fs';
import assert from 'node:assert/strict';

import { AUTHORITY_SCHEMAS, PILOT_TASKS } from './fixtures.mjs';
import { projectMutation, valueKey } from './contracts.mjs';

const path = process.argv[2];
if (!path) throw new Error('usage: node analyze-automatic-lineage.mjs <direct-agentdojo-json>');

const direct = JSON.parse(fs.readFileSync(path, 'utf8'));
const directById = new Map(direct.tasks.map((task) => [task.pilot_id, task]));

const DYNAMIC_ROLES = new Set(['destination', 'resource', 'numeric_effect', 'resource_context']);
const ROOT_BY_DEFAULT_ROLES = new Set(['identity', 'mode', 'temporal', 'created_resource_name', 'structured_content_anchor']);

function clone(value) {
  return structuredClone(value);
}

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

function identityLeaves(value, leaves = []) {
  if (Array.isArray(value)) {
    for (const item of value) identityLeaves(item, leaves);
    return leaves;
  }
  if (!value || typeof value !== 'object') return leaves;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'id' || key.endsWith('_id')) && ['string', 'number'].includes(typeof item)) leaves.push(item);
    else identityLeaves(item, leaves);
  }
  return leaves;
}

function numericTokens(value, tokens = []) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    tokens.push(value);
    return tokens;
  }
  if (typeof value === 'string') {
    for (const match of value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
      const parsed = Number(match[0].replaceAll(',', ''));
      if (Number.isFinite(parsed)) tokens.push(parsed);
    }
    return tokens;
  }
  if (Array.isArray(value)) {
    for (const item of value) numericTokens(item, tokens);
    return tokens;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) numericTokens(item, tokens);
  }
  return tokens;
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-6;
}

function scalarMatches(haystack, needle) {
  if (valueKey(haystack) === valueKey(needle)) return true;
  if (typeof needle === 'number') return numericTokens(haystack).some((candidate) => nearlyEqual(candidate, needle));
  if (typeof haystack === 'string' && typeof needle === 'string' && needle.length >= 4) return haystack.includes(needle);
  return false;
}

function containsExact(root, target) {
  if (scalarMatches(root, target)) return true;
  if (Array.isArray(root)) return root.some((item) => containsExact(item, target));
  if (root && typeof root === 'object') return Object.values(root).some((item) => containsExact(item, target));
  return false;
}

function containsAllLeaves(root, target) {
  const leaves = scalarLeaves(target).filter((value) => value !== '' && value !== null && value !== undefined);
  if (!leaves.length) return false;
  return leaves.every((leaf) => containsExact(root, leaf));
}

function evidenceMatch(container, target) {
  if (containsExact(container, target)) return { matched: true, kind: typeof target === 'number' ? 'numeric' : 'exact' };
  const ids = identityLeaves(target);
  if (ids.length && ids.every((id) => containsExact(container, id))) return { matched: true, kind: 'identity' };
  if ((Array.isArray(target) || (target && typeof target === 'object')) && containsAllLeaves(container, target)) {
    return { matched: true, kind: 'component' };
  }
  return { matched: false, kind: null };
}

function promptNumbers(prompt) {
  const constants = [];
  const text = String(prompt || '');
  for (const match of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(%)?/g)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    constants.push(value);
    if (match[2] === '%') constants.push(value / 100);
  }
  return [...new Set(constants)];
}

function arithmeticSource(execution, targetIndex, targetValue, prompt) {
  if (typeof targetValue !== 'number' || !Number.isFinite(targetValue)) return null;
  const constants = promptNumbers(prompt);
  if (!constants.length) return null;
  const candidates = [];

  for (let index = 0; index < targetIndex; index += 1) {
    const xs = numericTokens(execution[index].result);
    for (const x of xs) {
      for (const c of constants) {
        const one = [x * c, x + c, x - c, c - x];
        if (one.some((value) => nearlyEqual(value, targetValue))) {
          candidates.push({ index, action: execution[index].function, channel: 'output', match: 'arithmetic', score: 38 });
        }
        for (const d of constants) {
          const two = [x * c + d, x * c - d, x + c + d, x + c - d, x - c + d, x - c - d];
          if (two.some((value) => nearlyEqual(value, targetValue))) {
            candidates.push({ index, action: execution[index].function, channel: 'output', match: 'arithmetic', score: 39 });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  return candidates[0] || null;
}

function inferSource(execution, targetIndex, targetValue, prompt) {
  const candidates = [];
  for (let index = 0; index < targetIndex; index += 1) {
    const event = execution[index];
    const output = evidenceMatch(event.result, targetValue);
    if (output.matched) {
      const scores = { exact: 50, numeric: 48, identity: 46, component: 40 };
      candidates.push({ index, action: event.function, channel: 'output', match: output.kind, score: scores[output.kind] || 40 });
    }
    const request = evidenceMatch(event.args, targetValue);
    if (request.matched) {
      const scores = { exact: 30, numeric: 28, identity: 26, component: 20 };
      candidates.push({ index, action: event.function, channel: 'request', match: request.kind, score: scores[request.kind] || 20 });
    }
  }
  const arithmetic = arithmeticSource(execution, targetIndex, targetValue, prompt);
  if (arithmetic) candidates.push(arithmetic);
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

function fieldVaries(task, index, field) {
  const values = [];
  for (const trace of task.train) {
    const event = trace[index];
    if (!event) continue;
    const projected = projectMutation(event);
    const value = projected?.fields?.[field];
    if (value !== undefined) values.push(valueKey(value));
  }
  return new Set(values).size > 1;
}

function fieldRole(action, field) {
  return AUTHORITY_SCHEMAS[action]?.fields?.[field]?.role || 'unknown';
}

function shouldAttemptBinding(task, source, index, action, field, value) {
  const role = fieldRole(action, field);
  const varies = fieldVaries(task, index, field);
  if (varies) return { eligible: true, reason: 'varies-across-successful-traces', role };
  if (ROOT_BY_DEFAULT_ROLES.has(role)) return { eligible: false, reason: 'task-root-role', role };
  if (DYNAMIC_ROLES.has(role) && !promptAnchors(source.prompt, value)) return { eligible: true, reason: 'not-rooted-in-task-literal', role };
  return { eligible: false, reason: 'task-root-or-static', role };
}

function goldProducerIndex(trace, eventIndex, fact) {
  for (let index = eventIndex - 1; index >= 0; index -= 1) {
    if (Object.prototype.hasOwnProperty.call(trace[index].produces || {}, fact)) return index;
  }
  return null;
}

const report = {
  benchmark: direct.benchmark,
  benchmarkVersion: direct.benchmark_version,
  selectedTasks: PILOT_TASKS.length,
  tasksWithExecution: 0,
  goldBindings: 0,
  eligibleGoldBindings: 0,
  recoveredGoldBindings: 0,
  exactGoldProducerAgreements: 0,
  goldBindingsWithKnownProducer: 0,
  inferredBindingsTotal: 0,
  inferredOnStaticFields: 0,
  suppressedFields: 0,
  byChannel: {},
  misses: [],
  recovered: [],
  staticInferences: []
};

for (const task of PILOT_TASKS) {
  const source = directById.get(task.id);
  assert(source, `missing direct task ${task.id}`);
  assert(Array.isArray(source.execution), `missing direct execution for ${task.id}`);
  const goldTrace = task.train[0];
  assert.equal(source.execution.length, goldTrace.length, `${task.id}: execution length must match curated trace`);
  report.tasksWithExecution += 1;

  for (let index = 0; index < goldTrace.length; index += 1) {
    const goldEvent = goldTrace[index];
    const directEvent = source.execution[index];
    assert.equal(directEvent.function, goldEvent.action, `${task.id}:${index}: action mismatch`);
    const projected = projectMutation(goldEvent);
    if (!projected) continue;

    for (const field of Object.keys(projected.fields)) {
      const directProjected = projectMutation({ action: directEvent.function, args: directEvent.args });
      const directValue = directProjected?.fields?.[field];
      if (directValue === undefined) continue;
      const goldFact = goldEvent.origins?.[field]?.fact || null;
      if (goldFact) report.goldBindings += 1;

      const eligibility = shouldAttemptBinding(task, source, index, goldEvent.action, field, directValue);
      if (!eligibility.eligible) {
        report.suppressedFields += 1;
        if (goldFact) report.misses.push({ task: task.id, index, action: goldEvent.action, field, fact: goldFact, role: eligibility.role, reason: eligibility.reason, value: clone(directValue) });
        continue;
      }
      if (goldFact) report.eligibleGoldBindings += 1;

      const inferred = inferSource(source.execution, index, directValue, source.prompt);
      if (inferred) {
        report.inferredBindingsTotal += 1;
        const channel = `${inferred.channel}:${inferred.match}`;
        report.byChannel[channel] = (report.byChannel[channel] || 0) + 1;
      }

      if (goldFact) {
        const producerIndex = goldProducerIndex(goldTrace, index, goldFact);
        if (producerIndex !== null) report.goldBindingsWithKnownProducer += 1;
        if (inferred) {
          report.recoveredGoldBindings += 1;
          if (producerIndex !== null && inferred.index === producerIndex) report.exactGoldProducerAgreements += 1;
          report.recovered.push({
            task: task.id,
            index,
            action: goldEvent.action,
            field,
            fact: goldFact,
            role: eligibility.role,
            eligibility: eligibility.reason,
            sourceIndex: inferred.index,
            sourceAction: inferred.action,
            channel: inferred.channel,
            match: inferred.match,
            exactGoldProducer: producerIndex === null ? null : inferred.index === producerIndex
          });
        } else {
          report.misses.push({ task: task.id, index, action: goldEvent.action, field, fact: goldFact, role: eligibility.role, reason: 'no-evidence-relation', value: clone(directValue) });
        }
      } else if (inferred) {
        report.inferredOnStaticFields += 1;
        report.staticInferences.push({
          task: task.id,
          index,
          action: goldEvent.action,
          field,
          role: eligibility.role,
          eligibility: eligibility.reason,
          sourceIndex: inferred.index,
          sourceAction: inferred.action,
          channel: inferred.channel,
          match: inferred.match
        });
      }
    }
  }
}

const pct = (n, d) => d ? Number((100 * n / d).toFixed(1)) : 0;
report.summary = {
  executionCoveragePct: pct(report.tasksWithExecution, report.selectedTasks),
  goldLineageRecallPct: pct(report.recoveredGoldBindings, report.goldBindings),
  eligibleGoldLineageRecallPct: pct(report.recoveredGoldBindings, report.eligibleGoldBindings),
  exactGoldProducerAgreementPct: pct(report.exactGoldProducerAgreements, report.goldBindingsWithKnownProducer),
  staticInferenceSharePct: pct(report.inferredOnStaticFields, report.inferredBindingsTotal)
};
report.gates = {
  executionCoverage: report.summary.executionCoveragePct === 100,
  lineageRecall: report.summary.goldLineageRecallPct >= 85,
  precisionGuard: report.summary.staticInferenceSharePct <= 25,
  noTaskSpecificRules: true
};
report.go = Object.values(report.gates).every(Boolean);

console.log(JSON.stringify(report, null, 2));
if (!report.go) process.exitCode = 2;
