import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';

function mission(overrides = {}) {
  return {
    version: '0.1',
    mission_id: 'mission:demo-request',
    principal: { id: 'user:test' },
    agent: { id: 'agent:ops' },
    objective: 'Handle one demo request',
    resources: [
      {
        service: 'gmail',
        allow: ['thread.read'],
        deny: ['email.delete'],
        constraints: { thread: ['thread:demo'] }
      },
      {
        service: 'calendar',
        allow: ['event.create'],
        deny: ['event.delete'],
        constraints: {}
      }
    ],
    constraints: {},
    ...overrides
  };
}

function lease(overrides = {}) {
  return createTaskLease({
    mission: mission(),
    request: 'Handle the demo request in thread:demo',
    roots: [
      { fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread:demo' }
    ],
    bindings: [
      {
        service: 'calendar',
        action: 'event.create',
        context_field: 'attendee',
        fact_id: 'fact:sender-email'
      }
    ],
    ...overrides
  });
}

function authorizedReadReceipt(runtime, taskLease) {
  return taskLease.evaluate(runtime, {
    service: 'gmail',
    action: 'thread.read',
    context: { thread: 'thread:demo' }
  }).receipt;
}

function deriveSender(runtime, taskLease, value = 'customer@example.com') {
  return taskLease.derive({
    fact_id: 'fact:sender-email',
    kind: 'email.address',
    value,
    from: ['fact:thread'],
    receipt: authorizedReadReceipt(runtime, taskLease),
    selector: 'output.sender.email'
  });
}

test('bound action cannot run before the task establishes the required fact', async () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  const guard = createTaskLeaseGuard({ lease: taskLease, runtime });
  let effects = 0;

  await assert.rejects(
    () => guard.run({
      service: 'calendar',
      action: 'event.create',
      context: { attendee: 'customer@example.com' }
    }, async () => { effects += 1; }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'authority_fact_unresolved'
  );

  assert.equal(effects, 0);
});

test('authority can follow a fact derived from an authorized task read', async () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  const readReceipt = authorizedReadReceipt(runtime, taskLease);

  const fact = taskLease.derive({
    fact_id: 'fact:sender-email',
    kind: 'email.address',
    value: 'customer@example.com',
    from: ['fact:thread'],
    receipt: readReceipt,
    selector: 'output.sender.email'
  });

  assert.equal(fact.provenance.type, 'derived');
  assert.equal(fact.provenance.task_lease_id, taskLease.lease_id);
  assert.equal(fact.provenance.receipt_id, readReceipt.receipt_id);
  assert.equal(fact.provenance.source_service, 'gmail');
  assert.equal(fact.provenance.source_action, 'thread.read');
  assert.deepEqual(fact.provenance.from, ['fact:thread']);

  const guard = createTaskLeaseGuard({ lease: taskLease, runtime });
  let effects = 0;
  const result = await guard.run({
    service: 'calendar',
    action: 'event.create',
    context: { attendee: 'customer@example.com' }
  }, async () => {
    effects += 1;
    return { event_id: 'event:123' };
  });

  assert.equal(effects, 1);
  assert.equal(result.output.event_id, 'event:123');
  assert.equal(result.receipt.task_lease_id, taskLease.lease_id);
  assert.equal(result.receipt.decision, 'allow');
});

test('different resource becomes an authority delta and never executes automatically', async () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  deriveSender(runtime, taskLease);

  const guard = createTaskLeaseGuard({ lease: taskLease, runtime });
  let effects = 0;

  await assert.rejects(
    () => guard.run({
      service: 'calendar',
      action: 'event.create',
      context: { attendee: 'other@example.com' }
    }, async () => { effects += 1; }),
    (error) => {
      assert.equal(error instanceof AuthorityApprovalRequiredError, true);
      assert.equal(error.code, 'authority_delta_required');
      assert.equal(error.result.authority_delta.context_field, 'attendee');
      assert.equal(error.result.authority_delta.requested_value, 'other@example.com');
      return true;
    }
  );

  assert.equal(effects, 0);
});

test('derived authority cannot be created from a denied receipt', () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  const denied = taskLease.evaluate(runtime, {
    service: 'gmail',
    action: 'thread.read',
    context: { thread: 'thread:other' }
  }).receipt;

  assert.equal(denied.decision, 'deny');
  assert.throws(
    () => taskLease.derive({
      fact_id: 'fact:sender-email',
      value: 'attacker@example.com',
      from: ['fact:thread'],
      receipt: denied,
      selector: 'output.sender.email'
    }),
    (error) => error.code === 'receipt_not_authorized'
  );
});

test('derived authority cannot use an allow receipt from another mission', () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  const otherMission = mission({ mission_id: 'mission:other' });
  const foreignReceipt = runtime.evaluate(otherMission, {
    service: 'gmail',
    action: 'thread.read',
    context: { thread: 'thread:demo' }
  }).receipt;

  assert.equal(foreignReceipt.decision, 'allow');
  assert.throws(
    () => taskLease.derive({
      fact_id: 'fact:sender-email',
      value: 'customer@example.com',
      from: ['fact:thread'],
      receipt: foreignReceipt,
      selector: 'output.sender.email'
    }),
    (error) => error.code === 'receipt_mission_mismatch'
  );
});

test('derived authority cannot use an allow receipt from another task lease', () => {
  const runtime = new AuthorityRuntime();
  const firstLease = lease({ lease_id: 'lease:first' });
  const secondLease = lease({ lease_id: 'lease:second' });
  const foreignReceipt = authorizedReadReceipt(runtime, firstLease);

  assert.throws(
    () => secondLease.derive({
      fact_id: 'fact:sender-email',
      value: 'customer@example.com',
      from: ['fact:thread'],
      receipt: foreignReceipt,
      selector: 'output.sender.email'
    }),
    (error) => error.code === 'receipt_lease_mismatch'
  );
});

test('derived authority requires an explicit parent lineage and extraction selector', () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  const receipt = authorizedReadReceipt(runtime, taskLease);

  assert.throws(
    () => taskLease.derive({
      fact_id: 'fact:no-parent',
      value: 'customer@example.com',
      receipt,
      selector: 'output.sender.email'
    }),
    (error) => error.code === 'parent_fact_required'
  );

  assert.throws(
    () => taskLease.derive({
      fact_id: 'fact:no-selector',
      value: 'customer@example.com',
      from: ['fact:thread'],
      receipt
    }),
    (error) => error.code === 'selector_required'
  );
});

test('explicit mission deny wins even if a lease binding exists', () => {
  const runtime = new AuthorityRuntime();
  const taskLease = createTaskLease({
    mission: mission(),
    bindings: [{
      service: 'calendar',
      action: 'event.delete',
      context_field: 'event_id',
      fact_id: 'fact:event'
    }],
    roots: [{ fact_id: 'fact:event', kind: 'calendar.event', value: 'event:123' }]
  });

  const evaluation = taskLease.evaluate(runtime, {
    service: 'calendar',
    action: 'event.delete',
    context: { event_id: 'event:123' }
  });

  assert.equal(evaluation.result.decision, 'deny');
  assert.equal(evaluation.result.code, 'explicit_deny');
});

test('completing a task revokes the whole lease immediately', async () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease();
  taskLease.complete('demo request handled');
  const guard = createTaskLeaseGuard({ lease: taskLease, runtime });

  await assert.rejects(
    () => guard.run({
      service: 'gmail',
      action: 'thread.read',
      context: { thread: 'thread:demo' }
    }, async () => 'should not run'),
    (error) => error.code === 'task_lease_completed'
  );
});

test('task lease expiry is independent from standing provider credentials', () => {
  const runtime = new AuthorityRuntime();
  const taskLease = lease({ expires_at: '2026-08-21T10:00:00Z' });
  const evaluation = taskLease.evaluate(runtime, {
    service: 'gmail',
    action: 'thread.read',
    context: { thread: 'thread:demo' }
  }, new Date('2026-08-21T10:00:01Z'));

  assert.equal(evaluation.result.decision, 'deny');
  assert.equal(evaluation.result.code, 'task_lease_expired');
});
