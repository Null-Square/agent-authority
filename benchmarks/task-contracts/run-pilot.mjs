import { PILOT_TASKS } from './fixtures.mjs';
import { compileFieldwise, compileStateful, contractFamilies, evaluateTrace } from './contracts.mjs';
import { generateMutants } from './mutants.mjs';

const result = {
  tasks: PILOT_TASKS.length,
  represented: 0,
  training: { total: 0, fieldwiseAccepted: 0, statefulAccepted: 0 },
  heldOut: { total: 0, fieldwiseAccepted: 0, statefulAccepted: 0 },
  mutants: { total: 0, fieldwiseBlocked: 0, statefulBlocked: 0, byFamily: {} },
  families: new Set(),
  taskResults: []
};

for (const task of PILOT_TASKS) {
  const fieldwise = compileFieldwise(task.train);
  const stateful = compileStateful(task.train);
  const mutants = generateMutants(task);
  for (const family of contractFamilies(stateful)) result.families.add(family);
  result.represented += 1;

  const row = { id: task.id, train: [], heldOut: [], mutants: [] };
  for (const trace of task.train) {
    const f = evaluateTrace(fieldwise, trace).allowed;
    const s = evaluateTrace(stateful, trace).allowed;
    result.training.total += 1;
    result.training.fieldwiseAccepted += Number(f);
    result.training.statefulAccepted += Number(s);
    row.train.push({ fieldwise: f, stateful: s });
  }
  for (const trace of task.heldOut) {
    const f = evaluateTrace(fieldwise, trace).allowed;
    const s = evaluateTrace(stateful, trace).allowed;
    result.heldOut.total += 1;
    result.heldOut.fieldwiseAccepted += Number(f);
    result.heldOut.statefulAccepted += Number(s);
    row.heldOut.push({ fieldwise: f, stateful: s });
  }
  for (const mutant of mutants) {
    const f = evaluateTrace(fieldwise, mutant.trace).allowed;
    const sResult = evaluateTrace(stateful, mutant.trace);
    const s = sResult.allowed;
    result.mutants.total += 1;
    result.mutants.fieldwiseBlocked += Number(!f);
    result.mutants.statefulBlocked += Number(!s);
    const family = result.mutants.byFamily[mutant.family] ||= { total: 0, fieldwiseBlocked: 0, statefulBlocked: 0 };
    family.total += 1;
    family.fieldwiseBlocked += Number(!f);
    family.statefulBlocked += Number(!s);
    row.mutants.push({ family: mutant.family, fieldwiseAllowed: f, statefulAllowed: s, statefulReason: sResult.reasons[0]?.code || null });
  }
  result.taskResults.push(row);
}

result.families = [...result.families].sort();
const pct = (a, b) => b ? Number((100 * a / b).toFixed(1)) : 0;
result.summary = {
  representationPct: pct(result.represented, result.tasks),
  trainingStatefulAcceptancePct: pct(result.training.statefulAccepted, result.training.total),
  heldOutFieldwiseAcceptancePct: pct(result.heldOut.fieldwiseAccepted, result.heldOut.total),
  heldOutStatefulAcceptancePct: pct(result.heldOut.statefulAccepted, result.heldOut.total),
  fieldwiseMutantBlockPct: pct(result.mutants.fieldwiseBlocked, result.mutants.total),
  statefulMutantBlockPct: pct(result.mutants.statefulBlocked, result.mutants.total)
};

const gates = {
  representation: result.summary.representationPct >= 85,
  grammar: result.families.length <= 6,
  training: result.summary.trainingStatefulAcceptancePct === 100,
  mutants: result.summary.statefulMutantBlockPct >= 95,
  heldOut: result.summary.heldOutStatefulAcceptancePct >= 90,
  fieldwiseGap: result.summary.statefulMutantBlockPct > result.summary.fieldwiseMutantBlockPct,
  generalizationGap: result.summary.heldOutStatefulAcceptancePct > result.summary.heldOutFieldwiseAcceptancePct
};
result.gates = gates;
result.go = Object.values(gates).every(Boolean);

console.log(JSON.stringify(result, null, 2));
if (!result.go) process.exitCode = 2;
