#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PILOT_TASKS } from './fixtures.mjs';
import { projectMutation } from './contracts.mjs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: node validate-agentdojo-projection.mjs <agentdojo-pilot.json>');

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
assert.equal(input.benchmark, 'AgentDojo');
assert.equal(input.benchmark_version, 'v1.2.2');
assert.equal(input.tasks.length, 20);

const curatedById = new Map(PILOT_TASKS.map((task) => [task.id, task]));
const report = {
  benchmark: input.benchmark,
  version: input.benchmark_version,
  mode: 'direct-agentdojo-projection-validation',
  selected_tasks: input.tasks.length,
  matched_pilot_tasks: 0,
  action_sequence_matches: 0,
  mutation_calls: 0,
  projected_mutation_calls: 0,
  schema_coverage: 0,
  task_results: []
};

for (const task of input.tasks) {
  const curated = curatedById.get(task.pilot_id);
  assert.ok(curated, `missing curated pilot definition for ${task.pilot_id}`);
  report.matched_pilot_tasks += 1;

  const directActions = task.ground_truth.map((call) => call.function);
  const curatedActions = curated.train[0].map((event) => event.action);
  const actionsMatch = JSON.stringify(directActions) === JSON.stringify(curatedActions);
  if (actionsMatch) report.action_sequence_matches += 1;

  let mutationCalls = 0;
  let projectedCalls = 0;
  for (const call of task.ground_truth) {
    const projected = projectMutation({ action: call.function, args: call.args });
    if (!projected) continue;
    mutationCalls += 1;
    assert.ok(Object.keys(projected.fields).length > 0, `${task.pilot_id}:${call.function} projected zero authority fields`);
    projectedCalls += 1;
  }

  report.mutation_calls += mutationCalls;
  report.projected_mutation_calls += projectedCalls;
  report.task_results.push({
    pilot_id: task.pilot_id,
    actions_match: actionsMatch,
    direct_actions: directActions,
    curated_actions: curatedActions,
    mutation_calls: mutationCalls,
    projected_mutation_calls: projectedCalls
  });
}

report.schema_coverage = report.mutation_calls === 0 ? 0 : report.projected_mutation_calls / report.mutation_calls;
report.action_sequence_match_rate = report.action_sequence_matches / report.selected_tasks;

assert.equal(report.matched_pilot_tasks, 20);
assert.equal(report.schema_coverage, 1, 'all benchmark mutation calls in the pilot must project through a generic authority schema');
assert.equal(report.action_sequence_match_rate, 1, 'curated pilot action sequences must match direct AgentDojo ground truth');

console.log(JSON.stringify(report, null, 2));
console.log('PASS -> direct AgentDojo pilot: 20/20 tasks match curated action sequences and all mutation calls project through generic authority schemas');
