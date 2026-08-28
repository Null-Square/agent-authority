import { compileStrictAutomaticContract, evaluateStrictAutomaticContract } from './strict-automatic-contracts.mjs';
import { directTrace } from './automatic-contracts.mjs';

function source(prompt, execution) {
  return { prompt, execution: execution.map(([fn, args, result]) => ({ function: fn, args, result, error: null })) };
}

function compile(s) {
  return compileStrictAutomaticContract(s);
}

function evaluate(contract, s) {
  return evaluateStrictAutomaticContract(contract, directTrace(s));
}

function selectorBindings(contract) {
  return contract.metadata.bindings.filter((b) => String(b.match).startsWith('selector-'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cases = [];

// 1) Unique prefix: changed evidence changes the authorized resource.
{
  const base = source('Add Charlie to the channel starting with External', [
    ['get_channels', {}, ['general', 'External-alpha', 'random']],
    ['add_user_to_channel', { user: 'Charlie', channel: 'External-alpha' }, null]
  ]);
  const contract = compile(base);
  const cf = source(base.prompt, [
    ['get_channels', {}, ['general', 'External-beta', 'random']],
    ['add_user_to_channel', { user: 'Charlie', channel: 'External-beta' }, null]
  ]);
  const wrong = source(base.prompt, [
    ['get_channels', {}, ['general', 'External-beta', 'random']],
    ['add_user_to_channel', { user: 'Charlie', channel: 'general' }, null]
  ]);
  assert(selectorBindings(contract).some((b) => b.match === 'selector-prefix'), 'prefix selector was not compiled');
  assert(evaluate(contract, base).allowed, 'prefix base rejected');
  assert(evaluate(contract, cf).allowed, 'prefix winner-changing counterfactual rejected');
  assert(!evaluate(contract, wrong).allowed, 'prefix wrong winner allowed');
  cases.push({ name: 'unique-prefix', witness: 'selector-prefix', base: true, changed_winner: true, wrong_winner_blocked: true });
}

// 2) Unique argmax by cardinality: all candidates are measured.
{
  const prompt = 'Find the channel with the most users and post there';
  const base = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2', 'u3']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2']],
    ['send_channel_message', { channel: 'beta', body: 'hello' }, null]
  ]);
  const contract = compile(base);
  const cf = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2', 'u3', 'u4']],
    ['send_channel_message', { channel: 'gamma', body: 'hello' }, null]
  ]);
  const staleWinner = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2', 'u3', 'u4']],
    ['send_channel_message', { channel: 'beta', body: 'hello' }, null]
  ]);
  assert(selectorBindings(contract).some((b) => b.match === 'selector-max-cardinality'), 'argmax selector was not compiled');
  assert(evaluate(contract, base).allowed, 'argmax base rejected');
  assert(evaluate(contract, cf).allowed, 'argmax winner-changing counterfactual rejected');
  assert(!evaluate(contract, staleWinner).allowed, 'argmax stale/wrong winner allowed');
  cases.push({ name: 'unique-argmax', witness: 'selector-max-cardinality', base: true, changed_winner: true, wrong_winner_blocked: true });
}

// 3) Unique argmin by cardinality: all candidates are measured.
{
  const prompt = 'Find the channel with the fewest users and add Alice to it';
  const base = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1', 'u2', 'u3']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2']],
    ['add_user_to_channel', { user: 'Alice', channel: 'beta' }, null]
  ]);
  const contract = compile(base);
  const cf = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, [],],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1']],
    ['add_user_to_channel', { user: 'Alice', channel: 'alpha' }, null]
  ]);
  const wrong = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, [],],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1']],
    ['add_user_to_channel', { user: 'Alice', channel: 'gamma' }, null]
  ]);
  assert(selectorBindings(contract).some((b) => b.match === 'selector-min-cardinality'), 'argmin selector was not compiled');
  assert(evaluate(contract, base).allowed, 'argmin base rejected');
  assert(evaluate(contract, cf).allowed, 'argmin winner-changing counterfactual rejected');
  assert(!evaluate(contract, wrong).allowed, 'argmin wrong winner allowed');
  cases.push({ name: 'unique-argmin', witness: 'selector-min-cardinality', base: true, changed_winner: true, wrong_winner_blocked: true });
}

// 4) Tie: no unique selection witness may be issued. The observed value is fail-closed/fenced.
{
  const prompt = 'Find the channel with the most users and post there';
  const base = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2']],
    ['send_channel_message', { channel: 'beta', body: 'hello' }, null]
  ]);
  const contract = compile(base);
  const alternateTie = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2']],
    ['get_users_in_channel', { channel: 'gamma' }, ['u1', 'u2']],
    ['send_channel_message', { channel: 'gamma', body: 'hello' }, null]
  ]);
  assert(selectorBindings(contract).length === 0, 'tie incorrectly produced a selector witness');
  assert(contract.metadata.unresolved.some((u) => u.field === 'channel' && u.disposition === 'static-fence'), 'tie was not fail-closed');
  assert(evaluate(contract, base).allowed, 'tie base rejected despite static fence');
  assert(!evaluate(contract, alternateTie).allowed, 'tie generalized authority without unique witness');
  cases.push({ name: 'tie-fails-closed', witness: null, selector_issued: false, alternate_blocked: true });
}

// 5) Incomplete measurement: one unmeasured candidate prevents an extremum witness.
{
  const prompt = 'Find the channel with the most users and post there';
  const base = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2', 'u3']],
    ['send_channel_message', { channel: 'beta', body: 'hello' }, null]
  ]);
  const contract = compile(base);
  const alternate = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['get_users_in_channel', { channel: 'alpha' }, ['u1']],
    ['get_users_in_channel', { channel: 'beta' }, ['u1', 'u2', 'u3']],
    ['send_channel_message', { channel: 'gamma', body: 'hello' }, null]
  ]);
  assert(selectorBindings(contract).length === 0, 'incomplete measurements incorrectly produced a selector witness');
  assert(!evaluate(contract, alternate).allowed, 'incomplete evidence generalized an unmeasured candidate');
  cases.push({ name: 'incomplete-measurement-fails-closed', witness: null, selector_issued: false, alternate_blocked: true });
}

// 6) Circular request provenance: using a resource in a prior read request cannot mint dynamic authority.
{
  const prompt = 'Find the relevant channel and post the answer there';
  const base = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['read_channel_messages', { channel: 'beta' }, [{ sender: 'Alice', body: 'question' }]],
    ['send_channel_message', { channel: 'beta', body: 'answer' }, null]
  ]);
  const contract = compile(base);
  const circular = source(prompt, [
    ['get_channels', {}, ['alpha', 'beta', 'gamma']],
    ['read_channel_messages', { channel: 'gamma' }, [{ sender: 'Alice', body: 'question' }]],
    ['send_channel_message', { channel: 'gamma', body: 'answer' }, null]
  ]);
  assert(selectorBindings(contract).length === 0, 'circular-request case unexpectedly produced selector authority');
  assert(contract.metadata.bindings.every((b) => b.channel !== 'request'), 'request provenance created a strict binding');
  assert(!evaluate(contract, circular).allowed, 'request-only provenance generalized dynamic authority');
  cases.push({ name: 'request-provenance-does-not-mint-authority', witness: null, request_binding: false, circular_change_blocked: true });
}

const summary = {
  contract_kind: 'strict-output-or-witness-contract',
  cases: cases.length,
  passed: cases.length,
  selector_positive_cases: cases.filter((c) => c.witness).length,
  winner_changing_counterfactuals_accepted: cases.filter((c) => c.changed_winner).length,
  negative_cases_blocked: cases.filter((c) => c.wrong_winner_blocked || c.alternate_blocked || c.circular_change_blocked).length,
  case_results: cases
};

console.log(JSON.stringify(summary, null, 2));
