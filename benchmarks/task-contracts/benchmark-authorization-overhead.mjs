import fs from 'node:fs';
import os from 'node:os';

import { directTrace } from './automatic-contracts.mjs';
import { compileStrictAutomaticContract } from './strict-automatic-contracts.mjs';
import { evaluatePolicy } from './evaluation-policies.mjs';

const path = process.argv[2];
if (!path) throw new Error('usage: node benchmark-authorization-overhead.mjs <direct-agentdojo-json> [repetitions]');
const repetitions = Number(process.argv[3] || 200);
if (!Number.isInteger(repetitions) || repetitions < 10) throw new Error('repetitions must be an integer >= 10');

const direct = JSON.parse(fs.readFileSync(path, 'utf8'));
const traces = direct.tasks.map((source) => ({
  id: source.pilot_id,
  contract: compileStrictAutomaticContract(source),
  trace: directTrace(source)
}));

function nsNow() {
  return process.hrtime.bigint();
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function summarize(samplesNs) {
  const us = samplesNs.map((value) => Number(value) / 1000).sort((a, b) => a - b);
  const total = us.reduce((sum, value) => sum + value, 0);
  return {
    samples: us.length,
    meanUs: Number((total / us.length).toFixed(3)),
    medianUs: Number(quantile(us, 0.5).toFixed(3)),
    p95Us: Number(quantile(us, 0.95).toFixed(3)),
    p99Us: Number(quantile(us, 0.99).toFixed(3)),
    maxUs: Number(us.at(-1).toFixed(3))
  };
}

for (let warmup = 0; warmup < 20; warmup += 1) {
  for (const item of traces) {
    const decision = evaluatePolicy(item.contract, item.trace, 'full');
    if (!decision.allowed) throw new Error(`reference trace rejected during warmup: ${item.id}`);
  }
}

const decisionSamples = [];
const suiteSamples = [];
for (let repetition = 0; repetition < repetitions; repetition += 1) {
  const suiteStart = nsNow();
  for (const item of traces) {
    const start = nsNow();
    const decision = evaluatePolicy(item.contract, item.trace, 'full');
    const end = nsNow();
    if (!decision.allowed) throw new Error(`reference trace rejected: ${item.id}`);
    decisionSamples.push(end - start);
  }
  suiteSamples.push(nsNow() - suiteStart);
}

const compileSamples = [];
for (const source of direct.tasks) {
  const start = nsNow();
  compileStrictAutomaticContract(source);
  compileSamples.push(nsNow() - start);
}

const result = {
  benchmark: 'authorization CPU microbenchmark',
  scope: 'authorization evaluation on the 60-task reference cohort; excludes provider, network, and model latency',
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().map((cpu) => cpu.model),
    cpuCount: os.cpus().length
  },
  taskCount: traces.length,
  repetitions,
  authorizationDecision: summarize(decisionSamples),
  fullCohortPass: summarize(suiteSamples),
  contractCompilation: summarize(compileSamples),
  gates: {
    allReferenceAllowed: true,
    enoughDecisionSamples: decisionSamples.length >= traces.length * 10
  }
};
result.go = Object.values(result.gates).every(Boolean);

console.log(JSON.stringify(result, null, 2));
if (!result.go) process.exitCode = 2;
