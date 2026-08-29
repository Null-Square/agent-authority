#!/usr/bin/env node
import fs from 'node:fs';
import { compileStrictAutomaticContract } from './strict-automatic-contracts-aggregate.mjs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  throw new Error('usage: emit-strict-contracts.mjs <cohort.json> <contracts.json>');
}

const cohort = JSON.parse(fs.readFileSync(input, 'utf8'));
const contracts = {};
for (const source of cohort.tasks || []) {
  contracts[source.pilot_id] = {
    suite: source.suite,
    task_id: source.task_id,
    prompt: source.prompt,
    contract: compileStrictAutomaticContract(source)
  };
}

fs.writeFileSync(output, JSON.stringify({
  benchmark: cohort.benchmark,
  agentdojo_package: cohort.agentdojo_package,
  benchmark_version: cohort.benchmark_version,
  mode: 'strict-contract-runtime-bundle+aggregate-frequency',
  contracts
}, null, 2));
