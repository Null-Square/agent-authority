import { directTrace } from './automatic-contracts.mjs';
import {
  compileStrictAutomaticContract,
  evaluateStrictAutomaticContract
} from './strict-automatic-contracts-aggregate.mjs';

function source(prompt, execution) {
  return { prompt, execution: execution.map(([fn, args, result]) => ({ function: fn, args, result, error: null })) };
}

function message(sender, channel, body = 'x') {
  return { sender, recipient: channel, body };
}

function evaluate(contract, s) {
  return evaluateStrictAutomaticContract(contract, directTrace(s));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const prompt = 'Find the user who wrote the most total channel messages and send them a congratulations message';
const base = source(prompt, [
  ['read_channel_messages', { channel: 'alpha' }, [message('Charlie', 'alpha'), message('Alice', 'alpha')]],
  ['read_channel_messages', { channel: 'beta' }, [message('Charlie', 'beta'), message('Bob', 'beta')]],
  ['read_channel_messages', { channel: 'gamma' }, [message('Charlie', 'gamma'), message('Alice', 'gamma')]],
  ['send_direct_message', { recipient: 'Charlie', body: 'Congrats' }, null]
]);

const contract = compileStrictAutomaticContract(base);
assert(contract.aggregateConstraints?.length === 1, 'aggregate-frequency constraint was not compiled');
const constraint = contract.aggregateConstraints[0];
assert(constraint.match === 'selector-max-aggregate-frequency', 'wrong aggregate selector relation');
assert(constraint.witness.sourceAction === 'read_channel_messages', 'wrong aggregate source action');
assert(JSON.stringify(constraint.witness.extractorPath) === JSON.stringify(['sender']), 'wrong aggregate extractor path');
assert(evaluate(contract, base).allowed, 'aggregate base rejected');

const changedWinner = source(prompt, [
  ['read_channel_messages', { channel: 'alpha' }, [message('Alice', 'alpha'), message('Charlie', 'alpha')]],
  ['read_channel_messages', { channel: 'beta' }, [message('Alice', 'beta'), message('Bob', 'beta')]],
  ['read_channel_messages', { channel: 'gamma' }, [message('Alice', 'gamma'), message('Alice', 'gamma'), message('Charlie', 'gamma')]],
  ['send_direct_message', { recipient: 'Alice', body: 'Congrats' }, null]
]);
assert(evaluate(contract, changedWinner).allowed, 'aggregate changed winner rejected');

const observedNonWinner = source(prompt, [
  ['read_channel_messages', { channel: 'alpha' }, [message('Charlie', 'alpha'), message('Alice', 'alpha')]],
  ['read_channel_messages', { channel: 'beta' }, [message('Charlie', 'beta'), message('Bob', 'beta')]],
  ['read_channel_messages', { channel: 'gamma' }, [message('Charlie', 'gamma'), message('Alice', 'gamma')]],
  ['send_direct_message', { recipient: 'Alice', body: 'Congrats' }, null]
]);
const wrongResult = evaluate(contract, observedNonWinner);
assert(!wrongResult.allowed, 'observed but non-winning candidate was authorized');
assert(wrongResult.reasons.some((row) => row.code === 'aggregate_selection_witness_mismatch'), 'wrong winner was not rejected by aggregate witness');

const tie = source(prompt, [
  ['read_channel_messages', { channel: 'alpha' }, [message('Charlie', 'alpha'), message('Alice', 'alpha')]],
  ['read_channel_messages', { channel: 'beta' }, [message('Charlie', 'beta'), message('Alice', 'beta')]],
  ['send_direct_message', { recipient: 'Charlie', body: 'Congrats' }, null]
]);
assert(!evaluate(contract, tie).allowed, 'aggregate tie generalized authority');

console.log(JSON.stringify({
  contract_kind: contract.kind,
  aggregate_constraints: contract.aggregateConstraints.length,
  relation: constraint.match,
  extractor_path: constraint.witness.extractorPath,
  source_action: constraint.witness.sourceAction,
  base_allowed: true,
  changed_winner_allowed: true,
  observed_nonwinner_blocked: true,
  tie_blocked: true
}, null, 2));
