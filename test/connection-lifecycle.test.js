import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialBroker, InMemorySecretStore } from '../src/connections.js';

test('reconnecting the same provider account removes the replaced credential', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'octocat',
    auth_kind: 'token',
    credential: { access_token: 'old-token' }
  });

  const first = broker.connections.get({ principal_id: 'user:test', service: 'github', account_id: 'octocat' });

  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'octocat',
    auth_kind: 'token',
    credential: { access_token: 'new-token' }
  });

  const second = broker.connections.get({ principal_id: 'user:test', service: 'github', account_id: 'octocat' });
  assert.notEqual(first.credential_ref, second.credential_ref);
  assert.throws(() => broker.secrets.get(first.credential_ref), /unavailable/);
  assert.equal(broker.secrets.get(second.credential_ref).access_token, 'new-token');
});

test('failed connection registration removes the newly stored credential', () => {
  const secrets = new InMemorySecretStore();
  const connections = {
    get() { return null; },
    connect() { throw new Error('registry unavailable'); },
    list() { return []; },
    disconnect() { return null; }
  };
  const broker = new CredentialBroker({ connections, secrets });

  assert.throws(() => broker.connect({
    principal_id: 'user:test',
    service: 'github',
    auth_kind: 'token',
    credential: { access_token: 'must-not-leak' }
  }), /registry unavailable/);

  assert.equal(secrets.secrets.size, 0);
});
