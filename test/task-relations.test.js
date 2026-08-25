import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { createTaskLease, restoreTaskLease } from '../src/task-lease.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:typed-relations',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'Exercise narrow typed task authority relations',
    resources: [
      { service: 'slack', allow: ['channel.add'], deny: [], constraints: {} },
      { service: 'payments', allow: ['refund.create'], deny: [], constraints: {} }
    ],
    constraints: {}
  };
}

test('exact remains the default relation for backward compatibility', () => {
  const runtime = new AuthorityRuntime();
  const lease = createTaskLease({
    mission: mission(),
    roots: [{ fact_id: 'fact:channel', value: 'general' }],
    bindings: [{
      service: 'slack', action: 'channel.add', context_field: 'channel', fact_id: 'fact:channel'
    }]
  });

  assert.equal(lease.snapshot().bindings[0].relation, 'exact');
  assert.equal(lease.evaluate(runtime, {
    service: 'slack', action: 'channel.add', context: { channel: 'general' }
  }).result.decision, 'allow');
  assert.equal(lease.evaluate(runtime, {
    service: 'slack', action: 'channel.add', context: { channel: 'random' }
  }).result.code, 'authority_delta_required');
});

test('oneOf permits only values in the established finite set', async () => {
  const runtime = new AuthorityRuntime();
  const lease = createTaskLease({
    mission: mission(),
    roots: [{ fact_id: 'fact:channels', value: ['general', 'random'] }],
    bindings: [{
      service: 'slack', action: 'channel.add', context_field: 'channel',
      fact_id: 'fact:channels', relation: 'oneOf'
    }]
  });
  const guard = createTaskLeaseGuard({ lease, runtime });
  let effects = 0;

  await guard.run({
    service: 'slack', action: 'channel.add', context: { channel: 'general' }
  }, async () => { effects += 1; return { ok: true }; });
  await guard.run({
    service: 'slack', action: 'channel.add', context: { channel: 'random' }
  }, async () => { effects += 1; return { ok: true }; });

  await assert.rejects(
    () => guard.run({
      service: 'slack', action: 'channel.add', context: { channel: 'private-attacker-channel' }
    }, async () => { effects += 1; return { should_not_run: true }; }),
    (error) => {
      assert.equal(error instanceof AuthorityApprovalRequiredError, true);
      assert.equal(error.code, 'authority_delta_required');
      assert.equal(error.result.authority_delta.relation, 'oneOf');
      return true;
    }
  );

  assert.equal(effects, 2);
});

test('max permits equal or smaller numeric effects and steps up an over-limit effect', async () => {
  const runtime = new AuthorityRuntime();
  const lease = createTaskLease({
    mission: mission(),
    roots: [{ fact_id: 'fact:max-refund', value: 12500 }],
    bindings: [{
      service: 'payments', action: 'refund.create', context_field: 'amount_minor',
      fact_id: 'fact:max-refund', relation: 'max'
    }]
  });
  const guard = createTaskLeaseGuard({ lease, runtime });
  let refunds = 0;

  await guard.run({
    service: 'payments', action: 'refund.create', context: { amount_minor: 12500 }
  }, async () => { refunds += 1; return { ok: true }; });
  await guard.run({
    service: 'payments', action: 'refund.create', context: { amount_minor: 5000 }
  }, async () => { refunds += 1; return { ok: true }; });

  await assert.rejects(
    () => guard.run({
      service: 'payments', action: 'refund.create', context: { amount_minor: 12501 }
    }, async () => { refunds += 1; return { should_not_run: true }; }),
    (error) => {
      assert.equal(error instanceof AuthorityApprovalRequiredError, true);
      assert.equal(error.code, 'authority_delta_required');
      assert.equal(error.result.authority_delta.relation, 'max');
      return true;
    }
  );

  assert.equal(refunds, 2);
});

test('invalid relation facts fail closed instead of weakening authority', async () => {
  const runtime = new AuthorityRuntime();
  const lease = createTaskLease({
    mission: mission(),
    roots: [{ fact_id: 'fact:not-a-set', value: 'general' }],
    bindings: [{
      service: 'slack', action: 'channel.add', context_field: 'channel',
      fact_id: 'fact:not-a-set', relation: 'oneOf'
    }]
  });
  const guard = createTaskLeaseGuard({ lease, runtime });
  let effects = 0;

  await assert.rejects(
    () => guard.run({
      service: 'slack', action: 'channel.add', context: { channel: 'general' }
    }, async () => { effects += 1; }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'authority_relation_invalid'
  );
  assert.equal(effects, 0);
});

test('unknown relation names are rejected at binding construction', () => {
  assert.throws(
    () => createTaskLease({
      mission: mission(),
      roots: [{ fact_id: 'fact:channel', value: 'general' }],
      bindings: [{
        service: 'slack', action: 'channel.add', context_field: 'channel',
        fact_id: 'fact:channel', relation: 'arbitraryExpression'
      }]
    }),
    /binding\.relation must be one of: exact, oneOf, max/
  );
});

test('typed relations survive authenticated snapshot recovery while old snapshots default to exact', () => {
  const source = createTaskLease({
    mission: mission(),
    lease_id: 'lease:relations',
    roots: [{ fact_id: 'fact:channels', value: ['general', 'random'] }],
    bindings: [{
      service: 'slack', action: 'channel.add', context_field: 'channel',
      fact_id: 'fact:channels', relation: 'oneOf'
    }]
  });

  const restored = restoreTaskLease({ mission: mission(), snapshot: source.snapshot() });
  assert.equal(restored.snapshot().bindings[0].relation, 'oneOf');

  const oldSnapshot = source.snapshot();
  delete oldSnapshot.bindings[0].relation;
  const restoredOld = restoreTaskLease({ mission: mission(), snapshot: oldSnapshot });
  assert.equal(restoredOld.snapshot().bindings[0].relation, 'exact');
});
