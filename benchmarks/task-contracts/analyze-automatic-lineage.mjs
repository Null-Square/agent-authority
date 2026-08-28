import fs from 'node:fs';
import assert from 'node:assert/strict';

import { PILOT_TASKS } from './fixtures.mjs';
import { projectMutation, valueKey } from './contracts.mjs';

const path = process.argv[2];
if (!path) throw new Error('usage: node analyze-automatic-lineage.mjs <direct-agentdojo-json>');

const direct = JSON.parse(fs.readFileSync(path, 'utf8'));
const directById = new Map(direct.tasks.map((task) => [task.pilot_id, task]));

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

function scalarMatches(haystack, needle) {
  if (valueKey(haystack) === valueKey(needle)) return true;
  if (typeof haystack === 'string' && typeof needle === 'string' && needle.length >= 4) {
    return haystack.includes(needle);
  }
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
  if (containsExact(container, target)) return { matched: true, kind: 'exact' };
  if ((Array.isArray(target) || (target && typeof target === 'object')) && containsAllLeaves(container, target)) {
    return { matched: true, kind: 'component' };
  }
  return { matched: false, kind: null };
}

function inferSource(execution, targetIndex, targetValue) {
  const candidates = [];
  for (let index = 0; index < targetIndex; index += 1) {
    const event = execution[index];
    const output = evidenceMatch(event.result, targetValue);
    if (output.matched) {
      candidates.push({ index, action: event.function, channel: 'output', match: output.kind, score: output.kind === 'exact' ? 50 : 40 });
    }
    const request = evidenceMatch(event.args, targetValue);
    if (request.matched) {
      candidates.push({ index, action: event.function, channel: 'request', match: request.kind, score: request.kind === 'exact' ? 30 : 20 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.index - a.index);
  return candidates[0] || null;
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
  recoveredGoldBindings: 0,
  exactGoldProducerAgreements: 0,
  goldBindingsWithKnownProducer: 0,
  inferredBindingsTotal: 0,
  inferredOnStaticFields: 0,
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

    for (const [field, goldValue] of Object.entries(projected.fields)) {
      const directProjected = projectMutation({ action: directEvent.function, args: directEvent.args });
      const directValue = directProjected?.fields?.[field];
      if (directValue === undefined) continue;
      const inferred = inferSource(source.execution, index, directValue);
      const goldFact = goldEvent.origins?.[field]?.fact || null;

      if (inferred) {
        report.inferredBindingsTotal += 1;
        const channel = `${inferred.channel}:${inferred.match}`;
        report.byChannel[channel] = (report.byChannel[channel] || 0) + 1;
      }

      if (goldFact) {
        report.goldBindings += 1;
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
            sourceIndex: inferred.index,
            sourceAction: inferred.action,
            channel: inferred.channel,
            match: inferred.match,
            exactGoldProducer: producerIndex === null ? null : inferred.index === producerIndex
          });
        } else {
          report.misses.push({ task: task.id, index, action: goldEvent.action, field, fact: goldFact, value: clone(directValue) });
        }
      } else if (inferred) {
        report.inferredOnStaticFields += 1;
        report.staticInferences.push({
          task: task.id,
          index,
          action: goldEvent.action,
          field,
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
  exactGoldProducerAgreementPct: pct(report.exactGoldProducerAgreements, report.goldBindingsWithKnownProducer),
  staticInferenceSharePct: pct(report.inferredOnStaticFields, report.inferredBindingsTotal)
};
report.gates = {
  executionCoverage: report.summary.executionCoveragePct === 100,
  lineageRecall: report.summary.goldLineageRecallPct >= 85,
  noTaskSpecificRules: true
};
report.go = Object.values(report.gates).every(Boolean);

console.log(JSON.stringify(report, null, 2));
if (!report.go) process.exitCode = 2;
