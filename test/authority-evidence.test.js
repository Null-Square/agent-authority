import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityRuntime } from '../src/index.js';
import { createTaskLeaseGuard } from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';
import { gmailThreadSenderAuthorityExtractor } from '../src/providers/google.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:authority-evidence-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'derive one Calendar attendee from one authorized Gmail thread',
    resources: [
      {
        service: 'gmail',
        allow: ['thread.read'],
        deny: [],
        constraints: { thread_id: ['thread-91'] }
      },
      {
        service: 'calendar',
        allow: ['event.create'],
        deny: [],
        constraints: { calendar_id: ['primary'] }
      }
    ]
  };
}

function lease(id = 'lease:evidence-test') {
  return createTaskLease({
    mission: mission(),
    lease_id: id,
    roots: [{ fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread-91' }],
    bindings: [{
      service: 'calendar',
      action: 'event.create',
      context_field: 'attendee_email',
      fact_id: 'fact:sender'
    }]
  });
}

async function authorizedRead(taskLease, sender = 'customer@example.com') {
  const guard = createTaskLeaseGuard({ lease: taskLease, runtime: new AuthorityRuntime() });
  return guard.run(
    {
      service: 'gmail',
      action: 'thread.read',
      context: { thread_id: 'thread-91' }
    },
    async () => ({
      provider: 'gmail',
      thread_id: 'thread-91',
      sender_email: sender,
      sender_message_id: 'message-1'
    })
  );
}

test('deriveFromEvidence takes the value from the evidence-bound output, not host input', async () => {
  const taskLease = lease();
  const read = await authorizedRead(taskLease);

  const fact = taskLease.deriveFromEvidence({
    fact_id: 'fact:sender',
    kind: 'email.address',
    from: ['fact:thread'],
    receipt: read.receipt,
    evidence: read.evidence,
    output: read.output,
    extractor: gmailThreadSenderAuthorityExtractor,
    value: 'attacker@example.com'
  });

  assert.equal(fact.value, 'customer@example.com');
  assert.equal(fact.provenance.derivation_mode, 'execution-evidence-v1');
  assert.equal(fact.provenance.extractor_id, 'google.gmail.thread.sender-email.v1');
  assert.equal(fact.provenance.selector, 'output.sender_email');
  assert.equal(fact.provenance.source_output_hash, read.evidence.output_hash);
  assert.equal(fact.provenance.execution_evidence_hash, read.evidence.evidence_hash);
});

test('modified provider output is rejected even when receipt and evidence are unchanged', async () => {
  const taskLease = lease();
  const read = await authorizedRead(taskLease);
  const modified = { ...read.output, sender_email: 'attacker@example.com' };

  assert.throws(
    () => taskLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: read.receipt,
      evidence: read.evidence,
      output: modified,
      extractor: gmailThreadSenderAuthorityExtractor
    }),
    (error) => error.code === 'evidence_output_mismatch'
  );
});

test('tampered execution evidence is rejected before extraction', async () => {
  const taskLease = lease();
  const read = await authorizedRead(taskLease);
  const tampered = { ...read.evidence, output_hash: '0'.repeat(64) };

  assert.throws(
    () => taskLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: read.receipt,
      evidence: tampered,
      output: read.output,
      extractor: gmailThreadSenderAuthorityExtractor
    }),
    (error) => error.code === 'execution_evidence_tampered'
  );
});

test('execution evidence cannot be replayed under another allow receipt', async () => {
  const taskLease = lease();
  const first = await authorizedRead(taskLease);
  const second = await authorizedRead(taskLease);

  assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
  assert.throws(
    () => taskLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: second.receipt,
      evidence: first.evidence,
      output: first.output,
      extractor: gmailThreadSenderAuthorityExtractor
    }),
    (error) => error.code === 'evidence_receipt_mismatch'
  );
});

test('receipt and evidence from another Task Lease cannot establish authority', async () => {
  const firstLease = lease('lease:first');
  const secondLease = lease('lease:second');
  const read = await authorizedRead(firstLease);

  assert.throws(
    () => secondLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: read.receipt,
      evidence: read.evidence,
      output: read.output,
      extractor: gmailThreadSenderAuthorityExtractor
    }),
    (error) => error.code === 'receipt_lease_mismatch'
  );
});

test('trusted extractor refuses a receipt for the wrong provider operation', async () => {
  const taskLease = lease();
  const guard = createTaskLeaseGuard({ lease: taskLease, runtime: new AuthorityRuntime() });
  const calendar = await guard.run(
    {
      service: 'calendar',
      action: 'event.create',
      context: { calendar_id: 'primary' }
    },
    async () => ({ sender_email: 'customer@example.com', event_id: 'event-1' })
  );

  assert.throws(
    () => taskLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: calendar.receipt,
      evidence: calendar.evidence,
      output: calendar.output,
      extractor: gmailThreadSenderAuthorityExtractor
    }),
    (error) => error.code === 'trusted_extractor_operation_mismatch'
  );
});

test('unresolved or dangerous selectors fail closed inside TaskLease', async () => {
  const taskLease = lease();
  const read = await authorizedRead(taskLease);

  const badExtractor = () => ({
    extractor_id: 'test.bad-selector.v1',
    selector: 'output.__proto__.polluted'
  });

  assert.throws(
    () => taskLease.deriveFromEvidence({
      fact_id: 'fact:sender',
      from: ['fact:thread'],
      receipt: read.receipt,
      evidence: read.evidence,
      output: read.output,
      extractor: badExtractor
    }),
    (error) => error.code === 'selector_invalid'
  );
});
