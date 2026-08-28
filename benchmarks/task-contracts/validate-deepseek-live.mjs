#!/usr/bin/env node
import fs from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('usage: node validate-deepseek-live.mjs <deepseek-result.json>');
if (!fs.existsSync(path) || fs.statSync(path).size === 0) {
  throw new Error('DeepSeek live result is missing or empty');
}

const result = JSON.parse(fs.readFileSync(path, 'utf8'));
if (result.status !== 'ran') {
  throw new Error(`DeepSeek live result did not run: ${result.status || 'missing_status'}`);
}
if (result.provider !== 'deepseek-openai-compatible') {
  throw new Error(`unexpected DeepSeek provider: ${result.provider}`);
}
if (result.tasks !== 8 || !Array.isArray(result.rows) || result.rows.length !== 8) {
  throw new Error(`expected 8 live task rows, got tasks=${result.tasks}, rows=${result.rows?.length}`);
}
if (result.rows.some((row) => row.status !== 'ran')) {
  throw new Error('one or more DeepSeek task rows did not run');
}

const summary = {
  validated: true,
  provider: result.provider,
  model: result.model,
  attack: result.attack,
  tasks: result.tasks,
  benign_utility_passed: result.benign_utility_passed,
  attacked_utility_passed: result.attacked_utility_passed,
  agentdojo_security_passed: result.agentdojo_security_passed,
  tasks_with_denied_mutation_attempts: result.tasks_with_denied_mutation_attempts
};
console.log(JSON.stringify(summary, null, 2));
