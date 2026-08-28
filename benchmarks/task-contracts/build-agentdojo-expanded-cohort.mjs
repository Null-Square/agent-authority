#!/usr/bin/env node
import fs from 'node:fs';
import { AUTHORITY_SCHEMAS } from './authority-schemas.mjs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: build-agentdojo-expanded-cohort.mjs <survey.json> <output.json>');

const survey = JSON.parse(fs.readFileSync(input, 'utf8'));
const schemaActions = new Set(Object.keys(AUTHORITY_SCHEMAS));
const mutationVerb = /^(add_|append_|archive_|book_|cancel_|create_|delete_|edit_|invite_|move_|post_|remove_|reserve_|reschedule_|schedule_|send_|share_|transfer_|update_)/;

const selected = [];
const excluded = [];
for (const task of survey.tasks || []) {
  const actions = [...new Set((task.ground_truth || []).map((call) => call.function))];
  const candidateMutations = actions.filter((action) => mutationVerb.test(action));
  if (!candidateMutations.length) continue;
  const unsupported = candidateMutations.filter((action) => !schemaActions.has(action));
  if (unsupported.length || task.execution_error) {
    excluded.push({ id: task.survey_id, unsupported, execution_error: task.execution_error || null });
    continue;
  }
  selected.push({
    pilot_id: task.survey_id,
    suite: task.suite,
    task_id: task.task_id,
    prompt: task.prompt,
    ground_truth: task.ground_truth,
    execution: task.execution
  });
}

fs.writeFileSync(output, JSON.stringify({
  benchmark: survey.benchmark,
  agentdojo_package: survey.agentdojo_package,
  benchmark_version: survey.benchmark_version,
  mode: 'expanded-schema-covered-ground-truth-plus-execution',
  selection: {
    rule: 'all mutation-like ground-truth actions covered by provider/action schemas; no task IDs',
    selected: selected.length,
    excluded: excluded.length
  },
  excluded,
  tasks: selected
}, null, 2));
