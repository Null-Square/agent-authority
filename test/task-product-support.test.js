import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import { gmailThreadSenderAuthorityExtractor } from '../src/providers/google.js';
import { createTask } from '../src/task.js';

function supportTask() {
  return createTask({
    principal: 'user:support-test',
    agent: 'agent:support-test',
    request: 'Handle one customer email and schedule only the meeting justified by that thread',
    permissions: {
      gmail: {
        allow: ['thread.read'],
        deny: ['email.delete'],
        constraints: { thread_id: ['thread:91'] }
      },
      calendar: {
        allow: ['event.create'],
        deny: ['event.delete'],
        constraints: { calendar_id: ['primary'] }
      }
    },
    authority: {
      originThread: { kind: 'gmail.thread', value: 'thread:91' },
      calendar: { kind: 'calendar.id', value: 'primary' }
    },
    bindings: [
      { service: 'gmail', action: 'thread.read', field: 'thread_id', authority: 'originThread' },
      { service: 'calendar', action: 'event.create', field: 'calendar_id', authority: 'calendar' }
    ]
  });
}

test('task-first support flow turns one Gmail sender into exact Calendar attendee authority', async () => {
  const task = supportTask();
  let gmailReads = 0;
  let calendarMutations = 0;

  const read = await task.run({
    service: 'gmail',
    action: 'thread.read',
    context: { thread_id: 'thread:91' }
  }, async () => {
    gmailReads += 1;
    return {
      provider: 'gmail',
      sender_email: 'customer@example.com',
      thread_id: 'thread:91',
      message_count: 1
    };
  });

  const customer = task.authorityFrom(read, {
    name: 'customerEmail',
    kind: 'email.address',
    from: 'originThread',
    extractor: gmailThreadSenderAuthorityExtractor
  });
  assert.equal(customer.value, 'customer@example.com');
  assert.equal(customer.provenance.derivation_mode, 'execution-evidence-v1');

  task.bind({
    service: 'calendar',
    action: 'event.create',
    field: 'attendee_email',
    authority: 'customerEmail'
  });

  const allowed = await task.run({
    service: 'calendar',
    action: 'event.create',
    context: {
      calendar_id: 'primary',
      attendee_email: 'customer@example.com',
      start_time: '2030-01-15T10:00:00Z',
      end_time: '2030-01-15T10:30:00Z'
    }
  }, async () => {
    calendarMutations += 1;
    return { provider: 'calendar', event_id: 'event:1' };
  });
  assert.equal(allowed.output.event_id, 'event:1');

  let delta;
  await assert.rejects(
    () => task.run({
      service: 'calendar',
      action: 'event.create',
      context: {
        calendar_id: 'primary',
        attendee_email: 'unrelated@example.com',
        start_time: '2030-01-15T10:00:00Z',
        end_time: '2030-01-15T10:30:00Z'
      }
    }, async () => {
      calendarMutations += 1;
      return { event_id: 'must-not-exist' };
    }),
    (error) => {
      delta = error;
      return error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required';
    }
  );

  assert.equal(gmailReads, 1);
  assert.equal(calendarMutations, 1);
  const explanation = task.explain(delta);
  assert.equal(explanation.established_authority.value, 'customer@example.com');
  assert.equal(explanation.requested_value, 'unrelated@example.com');

  task.complete('support task done');
  await assert.rejects(
    () => task.run({
      service: 'calendar',
      action: 'event.create',
      context: {
        calendar_id: 'primary',
        attendee_email: 'customer@example.com',
        start_time: '2030-01-15T10:00:00Z',
        end_time: '2030-01-15T10:30:00Z'
      }
    }, async () => {
      calendarMutations += 1;
      return { event_id: 'must-not-run' };
    }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );
  assert.equal(calendarMutations, 1);
});

test('support task refuses another thread before the Gmail callback runs', async () => {
  const task = supportTask();
  let effects = 0;
  await assert.rejects(
    () => task.run({
      service: 'gmail',
      action: 'thread.read',
      context: { thread_id: 'thread:other' }
    }, async () => {
      effects += 1;
      return { provider: 'gmail', sender_email: 'other@example.com' };
    }),
    (error) => error instanceof AuthorityApprovalRequiredError || error instanceof AuthorityDeniedError
  );
  assert.equal(effects, 0);
});
