import fs from 'node:fs';

const legacyPath = process.argv[2];
const transplantPath = process.argv[3];
if (!legacyPath || !transplantPath) {
  throw new Error('usage: node validate-expanded-strict-gate.mjs <legacy-strict-json> <exact-transplant-json>');
}

const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
const transplant = JSON.parse(fs.readFileSync(transplantPath, 'utf8'));

const nonTransplantFamilies = Object.entries(legacy.mutants?.byFamily || {})
  .filter(([family]) => family !== 'transplant');

const result = {
  tasks: legacy.tasks,
  baseUtility: legacy.gates?.allBaseUtility === true,
  enoughCounterfactuals: legacy.gates?.enoughCounterfactuals === true,
  counterfactualUtility: legacy.gates?.counterfactualUtility === true,
  generalizationGap: legacy.gates?.generalizationGap === true,
  unresolvedFailClosed: legacy.gates?.unresolvedFailClosed === true,
  hasSelectionWitness: legacy.gates?.hasSelectionWitness === true,
  nonTransplantFamilies: Object.fromEntries(nonTransplantFamilies),
  allNonTransplantMutantsBlocked: nonTransplantFamilies.every(([, row]) => row.total === row.strictBlocked),
  exactTransplant: {
    constructed: transplant.constructed,
    blocked: transplant.blocked,
    allowed: transplant.allowed,
    gates: transplant.gates
  },
  exactTransplantPass: transplant.go === true
};

result.go = [
  result.tasks === 60,
  result.baseUtility,
  result.enoughCounterfactuals,
  result.counterfactualUtility,
  result.generalizationGap,
  result.unresolvedFailClosed,
  result.hasSelectionWitness,
  result.allNonTransplantMutantsBlocked,
  result.exactTransplantPass
].every(Boolean);

console.log(JSON.stringify(result, null, 2));
if (!result.go) process.exitCode = 2;
