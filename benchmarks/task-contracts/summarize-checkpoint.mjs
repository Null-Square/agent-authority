import fs from 'node:fs';

const [lineagePath, automaticPath, referencePath, outputPath] = process.argv.slice(2);
if (!lineagePath || !automaticPath || !referencePath || !outputPath) {
  throw new Error('usage: node summarize-checkpoint.mjs <lineage.json> <automatic.json> <reference.json> <output.json>');
}

const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
const automatic = JSON.parse(fs.readFileSync(automaticPath, 'utf8'));
const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));

const checkpoint = {
  schema: 'nullsquare.agent-authority.task-contract-checkpoint.v1',
  benchmark: {
    name: lineage.benchmark,
    version: lineage.benchmarkVersion,
    selectedTasks: lineage.selectedTasks
  },
  automaticLineage: {
    goldBindings: lineage.goldBindings,
    eligibleGoldBindings: lineage.eligibleGoldBindings,
    recoveredGoldBindings: lineage.recoveredGoldBindings,
    exactGoldProducerAgreements: lineage.exactGoldProducerAgreements,
    goldBindingsWithKnownProducer: lineage.goldBindingsWithKnownProducer,
    inferredBindingsTotal: lineage.inferredBindingsTotal,
    inferredOnStaticFields: lineage.inferredOnStaticFields,
    summary: lineage.summary,
    gates: lineage.gates,
    go: lineage.go
  },
  annotationFreeContract: {
    tasks: automatic.tasks,
    inferredBindings: automatic.inferredBindings,
    selectorBindings: automatic.selectorBindings,
    unresolvedDynamicCandidates: automatic.unresolvedDynamicCandidates,
    frozenUnresolvedCandidates: automatic.frozenUnresolvedCandidates,
    unsafeUnresolvedCandidates: automatic.unsafeUnresolvedCandidates,
    base: automatic.base,
    variants: automatic.variants,
    mutants: automatic.mutants,
    summary: automatic.summary,
    gates: automatic.gates,
    go: automatic.go
  },
  annotatedReference: {
    tasks: reference.tasks,
    represented: reference.represented,
    training: reference.training,
    heldOut: reference.heldOut,
    mutants: reference.mutants,
    families: reference.families,
    summary: reference.summary,
    gates: reference.gates,
    go: reference.go
  },
  allGreen: Boolean(lineage.go && automatic.go && reference.go)
};

fs.writeFileSync(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
console.log(JSON.stringify({
  allGreen: checkpoint.allGreen,
  benchmark: checkpoint.benchmark,
  automaticLineage: checkpoint.automaticLineage.summary,
  annotationFreeContract: checkpoint.annotationFreeContract.summary,
  annotatedReference: checkpoint.annotatedReference.summary
}, null, 2));

if (!checkpoint.allGreen) process.exitCode = 2;
