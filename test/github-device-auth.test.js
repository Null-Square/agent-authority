import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialBroker } from '../src/connections.js';
import {
  requestGitHubDeviceCode,
  pollGitHubDeviceToken,
  connectGitHubWithDeviceFlow
} from '../src/providers/github-device-auth.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('device code request sends client id and requested scopes', async () => {
  let captured = null;
  const result = await requestGitHubDeviceCode({
    clientId: 'client-123',
    scopes: ['repo', 'read:user', 'repo'],
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return jsonResponse({
        device_code: 'device-abc',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5
      });
    }
  });

  assert.equal(captured.url, 'https://github.com/login/device/code');
  const params = new URLSearchParams(captured.options.body);
  assert.equal(params.get('client_id'), 'client-123');
  assert.equal(params.get('scope'), 'repo read:user');
  assert.equal(result.user_code, 'ABCD-EFGH');
});

test('device token polling handles authorization_pending then succeeds', async () => {
  const sleeps = [];
  let calls = 0;
  const token = await pollGitHubDeviceToken({
    clientId: 'client-123',
    deviceCode: 'device-abc',
    interval: 2,
    expiresIn: 900,
    now: () => 0,
    sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: 'authorization_pending' });
      return jsonResponse({ access_token: 'secret-token', token_type: 'bearer', scope: 'repo,read:user' });
    }
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(token.access_token, 'secret-token');
});

test('slow_down increases polling interval by five seconds', async () => {
  const sleeps = [];
  let calls = 0;
  await pollGitHubDeviceToken({
    clientId: 'client-123',
    deviceCode: 'device-abc',
    interval: 3,
    expiresIn: 900,
    now: () => 0,
    sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: 'slow_down' });
      return jsonResponse({ access_token: 'token', token_type: 'bearer', scope: '' });
    }
  });

  assert.deepEqual(sleeps, [8000]);
});

test('connect flow stores token behind broker and returns only safe connection metadata', async () => {
  const broker = new CredentialBroker();
  const shown = [];
  let tokenPolls = 0;

  const fetchImpl = async (url) => {
    if (url === 'https://github.com/login/device/code') {
      return jsonResponse({
        device_code: 'device-abc', user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1
      });
    }
    if (url === 'https://github.com/login/oauth/access_token') {
      tokenPolls += 1;
      if (tokenPolls === 1) return jsonResponse({ error: 'authorization_pending' });
      return jsonResponse({ access_token: 'vault-only-token', token_type: 'bearer', scope: 'repo,read:user' });
    }
    if (url === 'https://api.github.com/user') {
      return jsonResponse({ id: 42, login: 'octocat', name: 'Octo Cat', avatar_url: 'https://example.test/avatar' });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await connectGitHubWithDeviceFlow({
    broker,
    principalId: 'user:test',
    accountId: 'work',
    clientId: 'client-123',
    scopes: ['repo', 'read:user'],
    fetchImpl,
    sleep: async () => {},
    now: () => 0,
    onVerification: async (challenge) => { shown.push(challenge); }
  });

  assert.equal(shown[0].verification_uri, 'https://github.com/login/device');
  assert.equal(shown[0].user_code, 'ABCD-EFGH');
  assert.equal(result.connection.metadata.login, 'octocat');
  assert.equal(result.connection.credential_ref, undefined);
  assert.equal(JSON.stringify(result).includes('vault-only-token'), false);
  assert.equal(
    broker.resolveInternal({ principal_id: 'user:test', service: 'github', account_id: 'work' }).credential.access_token,
    'vault-only-token'
  );
});

test('access_denied fails without creating a connection', async () => {
  const broker = new CredentialBroker();
  await assert.rejects(
    connectGitHubWithDeviceFlow({
      broker,
      principalId: 'user:test',
      clientId: 'client-123',
      fetchImpl: async (url) => {
        if (url === 'https://github.com/login/device/code') {
          return jsonResponse({
            device_code: 'device-abc', user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1
          });
        }
        return jsonResponse({ error: 'access_denied', error_description: 'The user denied the request' });
      },
      sleep: async () => {},
      now: () => 0
    }),
    (error) => error.code === 'access_denied'
  );

  assert.deepEqual(broker.listConnections('user:test'), []);
});
