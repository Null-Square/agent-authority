import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterRegistry, AuthorityRuntime, deriveMission, descriptorAdapter } from '../src/index.js';

const mission = {
  version: '0.1', mission_id: 'mission:test', principal: { id: 'user:test' },
  agent: { id: 'agent:parent' }, objective: 'test authority',
  resources: [
    { service: 'github', allow: ['repo.*'], deny: ['repo.delete'] },
    { service: 'google', allow: ['gmail.send'], deny: [] }
  ],
  constraints: { max_delegation_depth: 2, budget: { currency: 'USD', amount: 100 } },
  approvals: [{ match: { service: 'google', action: 'gmail.send' }, required: true }]
};

test('allows an authorized action', () => {
  const out = new AuthorityRuntime().evaluate(mission, { service: 'github', action: 'repo.write' });
  assert.equal(out.result.decision, 'allow');
  assert.match(out.receipt.receipt_id, /^receipt:/);
});

test('explicit deny wins', () => {
  const out = new AuthorityRuntime().evaluate(mission, { service: 'github', action: 'repo.delete' });
  assert.equal(out.result.decision, 'deny');
  assert.equal(out.result.code, 'explicit_deny');
});

test('human approval is a policy outcome', () => {
  const out = new AuthorityRuntime().evaluate(mission, { service: 'google', action: 'gmail.send' });
  assert.equal(out.result.decision, 'require_approval');
});

test('revocation stops a mission', () => {
  const runtime = new AuthorityRuntime();
  runtime.revoke('mission:test', 'principal stopped the job');
  assert.equal(runtime.evaluate(mission, { service: 'github', action: 'repo.read' }).result.code, 'mission_revoked');
});

test('delegated mission cannot expand authority', () => {
  assert.throws(() => deriveMission(mission, {
    agent: { id: 'agent:child' },
    resources: [{ service: 'stripe', allow: ['payment.create'], deny: [] }]
  }), /not authorized/);
});

test('adapter resolves only after authorization', async () => {
  const adapters = new AdapterRegistry().register(descriptorAdapter('oauth', ['github']));
  const out = await new AuthorityRuntime({ adapters }).prepare(mission, { service: 'github', action: 'repo.read' });
  assert.equal(out.result.decision, 'allow');
  assert.equal(out.dispatch.kind, 'oauth');
});
