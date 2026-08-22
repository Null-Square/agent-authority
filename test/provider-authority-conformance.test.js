import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialBroker } from '../src/connections.js';
import { AuthorityRuntime } from '../src/index.js';
import { createTaskLeaseGuard } from '../src/guard.js';
import { createGitHubProviderAdapter } from '../src/providers/github.js';
import { createGoogleProviderAdapter } from '../src/providers/google.js';
import { createTaskLease } from '../src/task-lease.js';

function conformanceCases() {
  const googleMission = {
    version: '0.1',
    mission_id: 'mission:conformance:google',
    principal: { id: 'user:conformance' },
    agent: { id: 'agent:conformance' },
    objective: 'prove Gmail authority extraction contract',
    resources: [
      { service: 'gmail', allow: ['thread.read'], deny: [], constraints: { thread_id: ['thread-91'] } },
      { service: 'calendar', allow: ['event.create'], deny: [], constraints: { calendar_id: ['primary'] } }
    ]
  };

  const githubMission = {
    version: '0.1',
    mission_id: 'mission:conformance:github',
    principal: { id: 'user:conformance' },
    agent: { id: 'agent:conformance' },
    objective: 'prove GitHub authority extraction contract',
    resources: [{
      service: 'github',
      allow: ['issue.list', 'issue.comment'],
      deny: [],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }]
  };

  const googleAdapter = createGoogleProviderAdapter({
    broker: new CredentialBroker(),
    fetchImpl: async () => { throw new Error('provider dispatch is not part of extractor conformance'); }
  });
  const githubAdapter = createGitHubProviderAdapter({
    broker: new CredentialBroker(),
    fetchImpl: async () => { throw new Error('provider dispatch is not part of extractor conformance'); }
  });

  return [
    {
      name: 'Google Gmail sender',
      mission: googleMission,
      leaseIdPrefix: 'google',
      roots: [{ fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread-91' }],
      bindings: [{ service: 'gmail', action: 'thread.read', context_field: 'thread_id', fact_id: 'fact:thread' }],
      sourceRequest: { service: 'gmail', action: 'thread.read', context: { thread_id: 'thread-91' } },
      sourceOutput: {
        provider: 'gmail',
        thread_id: 'thread-91',
        sender_email: 'customer@example.com',
        sender_message_id: 'message-1'
      },
      tamperedOutput: {
        provider: 'gmail',
        thread_id: 'thread-91',
        sender_email: 'attacker@example.com',
        sender_message_id: 'message-1'
      },
      wrongOperationRequest: {
        service: 'calendar',
        action: 'event.create',
        context: { calendar_id: 'primary', attendee_email: 'customer@example.com' }
      },
      wrongOperationOutput: { provider: 'calendar', event_id: 'event-1', sender_email: 'customer@example.com' },
      adapter: googleAdapter,
      kind: 'email.address',
      factId: 'fact:sender',
      from: ['fact:thread'],
      expectedValue: 'customer@example.com'
    },
    {
      name: 'GitHub selected issue number',
      mission: githubMission,
      leaseIdPrefix: 'github',
      roots: [
        { fact_id: 'fact:repo', kind: 'github.repository', value: 'Null-Square/agent-authority' },
        { fact_id: 'fact:marker', kind: 'github.issue.marker', value: 'fixture-marker-91' }
      ],
      bindings: [
        { service: 'github', action: 'issue.list', context_field: 'repository', fact_id: 'fact:repo' },
        { service: 'github', action: 'issue.list', context_field: 'fixture_marker', fact_id: 'fact:marker' }
      ],
      sourceRequest: {
        service: 'github',
        action: 'issue.list',
        context: { repository: 'Null-Square/agent-authority', fixture_marker: 'fixture-marker-91' }
      },
      sourceOutput: {
        provider: 'github',
        selected_issue_number: 9,
        selected_issue_title: 'Authority fixture',
        selected_issue_match_count: 1,
        selected_issue_marker: 'fixture-marker-91'
      },
      tamperedOutput: {
        provider: 'github',
        selected_issue_number: 1,
        selected_issue_title: 'Authority fixture',
        selected_issue_match_count: 1,
        selected_issue_marker: 'fixture-marker-91'
      },
      wrongOperationRequest: {
        service: 'github',
        action: 'issue.comment',
        context: { repository: 'Null-Square/agent-authority', issue_number: 9, body: 'test' }
      },
      wrongOperationOutput: { provider: 'github', comment_id: 12, selected_issue_number: 9 },
      adapter: githubAdapter,
      kind: 'github.issue.number',
      factId: 'fact:issue-number',
      from: ['fact:repo', 'fact:marker'],
      expectedValue: 9
    }
  ];
}

function makeLease(definition, suffix) {
  return createTaskLease({
    mission: definition.mission,
    lease_id: `lease:conformance:${definition.leaseIdPrefix}:${suffix}`,
    roots: definition.roots,
    bindings: definition.bindings
  });
}

async function runGuarded(lease, request, output) {
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  return guard.run(request, async () => structuredClone(output));
}

for (const definition of conformanceCases()) {
  test(`${definition.name} passes the shared execution-evidence authority contract`, async () => {
    const lease = makeLease(definition, 'positive');
    const source = await runGuarded(lease, definition.sourceRequest, definition.sourceOutput);
    const extractor = definition.adapter.authorityExtractor(definition.sourceRequest, definition.kind);
    assert.equal(typeof extractor, 'function');

    const fact = lease.deriveFromEvidence({
      fact_id: definition.factId,
      kind: definition.kind,
      from: definition.from,
      receipt: source.receipt,
      evidence: source.evidence,
      output: source.output,
      extractor,
      value: 'caller-must-not-control-this'
    });

    assert.deepEqual(fact.value, definition.expectedValue);
    assert.equal(fact.provenance.derivation_mode, 'execution-evidence-v1');
    assert.equal(fact.provenance.source_output_hash, source.evidence.output_hash);
    assert.equal(typeof fact.provenance.extractor_id, 'string');
    assert.ok(fact.provenance.extractor_id.length > 0);
  });

  test(`${definition.name} rejects modified output under unchanged evidence`, async () => {
    const lease = makeLease(definition, 'tamper');
    const source = await runGuarded(lease, definition.sourceRequest, definition.sourceOutput);
    const extractor = definition.adapter.authorityExtractor(definition.sourceRequest, definition.kind);

    assert.throws(
      () => lease.deriveFromEvidence({
        fact_id: definition.factId,
        kind: definition.kind,
        from: definition.from,
        receipt: source.receipt,
        evidence: source.evidence,
        output: definition.tamperedOutput,
        extractor
      }),
      (error) => error.code === 'evidence_output_mismatch'
    );
  });

  test(`${definition.name} rejects evidence replay under a second ALLOW receipt`, async () => {
    const lease = makeLease(definition, 'replay');
    const first = await runGuarded(lease, definition.sourceRequest, definition.sourceOutput);
    const second = await runGuarded(lease, definition.sourceRequest, definition.sourceOutput);
    const extractor = definition.adapter.authorityExtractor(definition.sourceRequest, definition.kind);

    assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
    assert.throws(
      () => lease.deriveFromEvidence({
        fact_id: definition.factId,
        kind: definition.kind,
        from: definition.from,
        receipt: second.receipt,
        evidence: first.evidence,
        output: first.output,
        extractor
      }),
      (error) => error.code === 'evidence_receipt_mismatch'
    );
  });

  test(`${definition.name} rejects receipt/evidence reuse across Task Leases`, async () => {
    const firstLease = makeLease(definition, 'first');
    const secondLease = makeLease(definition, 'second');
    const source = await runGuarded(firstLease, definition.sourceRequest, definition.sourceOutput);
    const extractor = definition.adapter.authorityExtractor(definition.sourceRequest, definition.kind);

    assert.throws(
      () => secondLease.deriveFromEvidence({
        fact_id: definition.factId,
        kind: definition.kind,
        from: definition.from,
        receipt: source.receipt,
        evidence: source.evidence,
        output: source.output,
        extractor
      }),
      (error) => error.code === 'receipt_lease_mismatch'
    );
  });

  test(`${definition.name} extractor rejects evidence from another operation`, async () => {
    const lease = makeLease(definition, 'wrong-operation');
    const wrong = await runGuarded(lease, definition.wrongOperationRequest, definition.wrongOperationOutput);
    const extractor = definition.adapter.authorityExtractor(definition.sourceRequest, definition.kind);

    assert.throws(
      () => lease.deriveFromEvidence({
        fact_id: definition.factId,
        kind: definition.kind,
        from: definition.from,
        receipt: wrong.receipt,
        evidence: wrong.evidence,
        output: wrong.output,
        extractor
      }),
      (error) => error.code === 'trusted_extractor_operation_mismatch'
    );
  });
}
