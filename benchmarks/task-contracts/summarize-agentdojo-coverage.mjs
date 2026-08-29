#!/usr/bin/env node
import fs from 'node:fs';
import { AUTHORITY_SCHEMAS } from './authority-schemas.mjs';

const path = process.argv[2];
if (!path) throw new Error('usage: summarize-agentdojo-coverage.mjs <survey.json>');
const survey = JSON.parse(fs.readFileSync(path, 'utf8'));

const schemaActions = new Set(Object.keys(AUTHORITY_SCHEMAS));
const mutationVerb = /^(add_|append_|archive_|book_|cancel_|create_|delete_|edit_|invite_|move_|post_|remove_|reserve_|reschedule_|schedule_|send_|share_|transfer_|update_)/;

const actionStats = new Map();
const taskRows = [];
for (const task of survey.tasks || []) {
  const actions = (task.ground_truth || []).map((call) => call.function);
  const distinct = [...new Set(actions)];
  const knownMutationActions = distinct.filter((action) => schemaActions.has(action));
  const candidateMutationActions = distinct.filter((action) => mutationVerb.test(action));
  const unsupportedCandidateMutations = candidateMutationActions.filter((action) => !schemaActions.has(action));

  for (const action of actions) {
    const row = actionStats.get(action) || { calls: 0, tasks: new Set(), schemaCovered: schemaActions.has(action), candidateMutation: mutationVerb.test(action) };
    row.calls += 1;
    row.tasks.add(task.survey_id);
    actionStats.set(action, row);
  }

  taskRows.push({
    id: task.survey_id,
    suite: task.suite,
    calls: actions.length,
    executionOk: !task.execution_error,
    knownMutationActions,
    candidateMutationActions,
    unsupportedCandidateMutations,
    hasKnownMutation: knownMutationActions.length > 0,
    hasCandidateMutation: candidateMutationActions.length > 0,
    candidateMutationFullySchemaCovered: candidateMutationActions.length > 0 && unsupportedCandidateMutations.length === 0
  });
}

const candidateMutationTasks = taskRows.filter((row) => row.hasCandidateMutation);
const knownMutationTasks = taskRows.filter((row) => row.hasKnownMutation);
const fullyCoveredCandidateMutationTasks = candidateMutationTasks.filter((row) => row.candidateMutationFullySchemaCovered);
const unsupportedActionRows = [...actionStats.entries()]
  .filter(([, row]) => row.candidateMutation && !row.schemaCovered)
  .map(([action, row]) => ({ action, calls: row.calls, tasks: row.tasks.size }))
  .sort((a, b) => b.tasks - a.tasks || b.calls - a.calls || a.action.localeCompare(b.action));

const report = {
  schema: 'nullsquare.agent-authority.agentdojo-coverage-summary.v1',
  benchmark: survey.benchmark,
  benchmarkVersion: survey.benchmark_version,
  tasks: taskRows.length,
  executionFailures: taskRows.filter((row) => !row.executionOk).length,
  distinctActions: actionStats.size,
  schemaActionsPresent: [...actionStats.keys()].filter((action) => schemaActions.has(action)).length,
  candidateMutationTasks: candidateMutationTasks.length,
  knownMutationTasks: knownMutationTasks.length,
  fullySchemaCoveredCandidateMutationTasks: fullyCoveredCandidateMutationTasks.length,
  candidateMutationTaskCoveragePct: candidateMutationTasks.length
    ? Number((100 * fullyCoveredCandidateMutationTasks.length / candidateMutationTasks.length).toFixed(1))
    : 0,
  unsupportedCandidateMutationActions: unsupportedActionRows,
  suiteSummary: Object.fromEntries(
    [...new Set(taskRows.map((row) => row.suite))].sort().map((suite) => {
      const rows = taskRows.filter((row) => row.suite === suite);
      const mutationRows = rows.filter((row) => row.hasCandidateMutation);
      const covered = mutationRows.filter((row) => row.candidateMutationFullySchemaCovered);
      return [suite, {
        tasks: rows.length,
        executionFailures: rows.filter((row) => !row.executionOk).length,
        candidateMutationTasks: mutationRows.length,
        fullySchemaCoveredCandidateMutationTasks: covered.length,
        coveragePct: mutationRows.length ? Number((100 * covered.length / mutationRows.length).toFixed(1)) : 0
      }];
    })
  ),
  actionSummary: [...actionStats.entries()].map(([action, row]) => ({
    action,
    calls: row.calls,
    tasks: row.tasks.size,
    schemaCovered: row.schemaCovered,
    candidateMutation: row.candidateMutation
  })).sort((a, b) => b.tasks - a.tasks || b.calls - a.calls || a.action.localeCompare(b.action)),
  taskSummary: taskRows
};

console.log(JSON.stringify(report, null, 2));
