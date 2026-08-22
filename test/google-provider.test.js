import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialBroker } from '../src/connections.js';
import {
  createGoogleProviderAdapter,
  extractEmailAddress,
  gmailThreadSenderEmail
} from '../src/providers/google.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:google-provider-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'test Google provider mappings',
    resources: [
      { service: 'gmail', allow: ['thread.read'], deny: [], constraints: {} },
      { service: 'calendar', allow: ['event.create', 'event.delete'], deny: [], constraints: {} }
    ]
  };
}

function connectedBroker() {
  const broker = new CredentialBroker();
  for (const service of ['gmail', 'calendar']) {
    broker.connect({
      principal_id: 'user:test',
      service,
      auth_kind: 'oauth2',
      credential: { access_token: 'secret-google-token' },
      scopes: service === 'gmail'
        ? ['https://www.googleapis.com/auth/gmail.readonly']
        : ['https://www.googleapis.com/auth/calendar.events']
    });
  }
  return broker;
}

test('extractEmailAddress accepts display-name From headers', () => {
  assert.equal(extractEmailAddress('Alice Example <Alice@Example.COM>'), 'alice@example.com');
  assert.equal(extractEmailAddress('alice@example.com'), 'alice@example.com');
  assert.equal(extractEmailAddress('not an address'), null);
});

test('gmailThreadSenderEmail extracts the first usable From header', () => {
  const sender = gmailThreadSenderEmail({
    messages: [
      { id: 'm1', payload: { headers: [{ name: 'Subject', value: 'hello' }] } },
      { id: 'm2', payload: { headers: [{ name: 'From', value: 'Alice <alice@example.com>' }] } }
    ]
  });
  assert.deepEqual(sender, {
    email: 'alice@example.com',
    raw: 'Alice <alice@example.com>',
    message_id: 'm2'
  });
});

test('Google adapter reads Gmail metadata and returns only normalized sender authority data', async () => {
  const calls = [];
  const adapter = createGoogleProviderAdapter({
    broker: connectedBroker(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        id: 'thread-91',
        messages: [
          {
            id: 'message-1',
            payload: {
              headers: [
                { name: 'From', value: 'Customer <Customer@Example.com>' }
              ]
            }
          }
        ]
      }), { status: 200 });
    }
  });

  const output = await adapter.execute({
    mission: mission(),
    request: {
      service: 'gmail',
      action: 'thread.read',
      context: { thread_id: 'thread-91' }
    }
  });

  assert.equal(output.thread_id, 'thread-91');
  assert.equal(output.sender_email, 'customer@example.com');
  assert.equal(output.message_count, 1);
  assert.match(calls[0].url, /gmail\/v1\/users\/me\/threads\/thread-91/);
  assert.match(calls[0].url, /format=metadata/);
  assert.match(calls[0].url, /metadataHeaders=From/);
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-google-token');
  assert.equal(JSON.stringify(output).includes('secret-google-token'), false);
});

test('Google adapter creates an exact-attendee Calendar event with notifications disabled by default', async () => {
  const calls = [];
  const adapter = createGoogleProviderAdapter({
    broker: connectedBroker(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        id: 'event-1',
        htmlLink: 'https://calendar.google.com/event?eid=event-1',
        attendees: [{ email: 'customer@example.com' }]
      }), { status: 200 });
    }
  });

  const output = await adapter.execute({
    mission: mission(),
    request: {
      service: 'calendar',
      action: 'event.create',
      context: {
        calendar_id: 'primary',
        attendee_email: 'customer@example.com',
        start_time: '2026-08-22T21:30:00+03:00',
        end_time: '2026-08-22T21:45:00+03:00',
        summary: 'Agent Authority validation',
        transparency: 'transparent'
      }
    }
  });

  assert.equal(output.event_id, 'event-1');
  assert.deepEqual(output.attendees, ['customer@example.com']);
  assert.match(calls[0].url, /calendars\/primary\/events\?sendUpdates=none/);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.attendees, [{ email: 'customer@example.com' }]);
  assert.equal(body.transparency, 'transparent');
});

test('Google adapter fails closed on invalid provider mappings before dispatch', async () => {
  let calls = 0;
  const adapter = createGoogleProviderAdapter({
    broker: connectedBroker(),
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    }
  });

  assert.throws(
    () => adapter.validateRequest({
      service: 'calendar',
      action: 'event.create',
      context: {
        attendee_email: 'customer@example.com',
        start_time: '2026-08-22T21:30:00+03:00',
        end_time: '2026-08-22T21:45:00+03:00',
        send_updates: 'surprise-everyone'
      }
    }),
    (error) => error.code === 'invalid_send_updates'
  );

  await assert.rejects(
    adapter.execute({
      mission: mission(),
      request: { service: 'gmail', action: 'message.send', context: {} }
    }),
    (error) => error.code === 'unsupported_action'
  );
  assert.equal(calls, 0);
});

test('Google adapter identifies Calendar creates/deletes as mutations and Gmail reads as non-mutations', () => {
  const adapter = createGoogleProviderAdapter({ broker: connectedBroker(), fetchImpl: async () => new Response('{}') });
  assert.equal(adapter.isMutation({ service: 'gmail', action: 'thread.read' }), false);
  assert.equal(adapter.isMutation({ service: 'calendar', action: 'event.create' }), true);
  assert.equal(adapter.isMutation({ service: 'calendar', action: 'event.delete' }), true);
});
