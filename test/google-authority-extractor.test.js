import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialBroker } from '../src/connections.js';
import {
  createGoogleProviderAdapter,
  gmailThreadSenderAuthorityExtractor
} from '../src/providers/google.js';

test('Gmail sender extractor accepts only canonical gmail:thread.read output', () => {
  const descriptor = gmailThreadSenderAuthorityExtractor({
    receipt: { service: 'gmail', action: 'thread.read' },
    output: { sender_email: 'customer@example.com' }
  });

  assert.deepEqual(descriptor, {
    extractor_id: 'google.gmail.thread.sender-email.v1',
    selector: 'output.sender_email'
  });

  assert.throws(
    () => gmailThreadSenderAuthorityExtractor({
      receipt: { service: 'calendar', action: 'event.create' },
      output: { sender_email: 'customer@example.com' }
    }),
    (error) => error.code === 'trusted_extractor_operation_mismatch'
  );

  assert.throws(
    () => gmailThreadSenderAuthorityExtractor({
      receipt: { service: 'gmail', action: 'thread.read' },
      output: { sender_email: 'Customer@Example.com' }
    }),
    (error) => error.code === 'trusted_extractor_output_invalid'
  );
});

test('Google adapter advertises the trusted extractor only for the supported authority mapping', () => {
  const broker = new CredentialBroker();
  const adapter = createGoogleProviderAdapter({
    broker,
    fetchImpl: async () => new Response('{}', { status: 200 })
  });

  assert.equal(
    adapter.authorityExtractor({ service: 'gmail', action: 'thread.read' }, 'email.address'),
    gmailThreadSenderAuthorityExtractor
  );
  assert.equal(
    adapter.authorityExtractor({ service: 'calendar', action: 'event.create' }, 'email.address'),
    null
  );
  assert.equal(
    adapter.authorityExtractor({ service: 'gmail', action: 'thread.read' }, 'calendar.event'),
    null
  );
});
