import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { gmailThreadSenderAuthorityExtractor } from '../src/providers/google.js';
import { createTaskLease } from '../src/task-lease.js';

function buildMission() {
  return {
    version: '0.1',
    mission_id: 'mission:google-cross-provider-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'Read one Gmail thread and create one Calendar event for the discovered sender',
    resources: [
      {
        service: 'gmail',
        allow: ['thread.read'],
        deny: ['message.send'],
        constraints: { thread_id: ['thread-91'] }
      },
      {
        service: 'calendar',
        allow: ['event.create'],
        deny: ['event.delete'],
        constraints: { calendar_id: ['primary'] }
      }
    ]
  };
}

test('evidence-verified Gmail sender bounds Calendar mutation and blocked effects never invoke provider callbacks', async () => {
  const lease = createTaskLease({
    mission: buildMission(),
    request: 'schedule a meeting with the sender in thread-91',
    roots: [
      { fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread-91' },
      { fact_id: 'fact:calendar', kind: 'google.calendar', value: 'primary' }
    ],
    bindings: [
      {
        service: 'gmail',
        action: 'thread.read',
        context_field: 'thread_id',
        fact_id: 'fact:thread'
      },
      {
        service: 'calendar',
        action: 'event.create',
        context_field: 'calendar_id',
        fact_id: 'fact:calendar'
      },
      {
        service: 'calendar',
        action: 'event.create',
        context_field: 'attendee_email',
        fact_id: 'fact:sender'
      }
    ]
  });

  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  let gmailProviderCalls = 0;
  let calendarProviderCalls = 0;

  const read = await guard.run(
    {
      service: 'gmail',
      action: 'thread.read',
      context: { thread_id: 'thread-91' }
    },
    async () => {
      gmailProviderCalls += 1;
      return {
        provider: 'gmail',
        thread_id: 'thread-91',
        sender_email: 'customer@example.com',
        sender_message_id: 'message-1'
      };
    }
  );

  const senderFact = lease.deriveFromEvidence({
    fact_id: 'fact:sender',
    kind: 'email.address',
    from: ['fact:thread'],
    receipt: read.receipt,
    evidence: read.evidence,
    output: read.output,
    extractor: gmailThreadSenderAuthorityExtractor
  });

  assert.equal(senderFact.value, 'customer@example.com');
  assert.equal(senderFact.provenance.derivation_mode, 'execution-evidence-v1');

  const allowed = await guard.run(
    {
      service: 'calendar',
      action: 'event.create',
      context: {
        calendar_id: 'primary',
        attendee_email: 'customer@example.com'
      }
    },
    async () => {
      calendarProviderCalls += 1;
      return { event_id: 'event-1' };
    }
  );

  assert.equal(allowed.output.event_id, 'event-1');
  assert.equal(gmailProviderCalls, 1);
  assert.equal(calendarProviderCalls, 1);

  await assert.rejects(
    guard.run(
      {
        service: 'calendar',
        action: 'event.create',
        context: {
          calendar_id: 'primary',
          attendee_email: 'attacker@example.com'
        }
      },
      async () => {
        calendarProviderCalls += 1;
        return { event_id: 'must-not-exist' };
      }
    ),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
  );

  assert.equal(calendarProviderCalls, 1);

  lease.complete('test complete');

  await assert.rejects(
    guard.run(
      {
        service: 'calendar',
        action: 'event.create',
        context: {
          calendar_id: 'primary',
          attendee_email: 'customer@example.com'
        }
      },
      async () => {
        calendarProviderCalls += 1;
        return { event_id: 'must-not-exist-after-completion' };
      }
    ),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );

  assert.equal(calendarProviderCalls, 1);
});
