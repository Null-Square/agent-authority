import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalCredentialBroker } from '../src/storage/local.js';

test('local encrypted vault survives process-style broker restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-authority-'));
  try {
    const first = createLocalCredentialBroker({ directory });
    first.connect({
      principal_id: 'user:test',
      service: 'github',
      account_id: 'work',
      auth_kind: 'oauth',
      credential: { access_token: 'persistent-secret-token', refresh_token: 'refresh-secret' },
      scopes: ['repo']
    });

    const second = createLocalCredentialBroker({ directory });
    const resolved = second.resolveInternal({
      principal_id: 'user:test',
      service: 'github',
      account_id: 'work'
    });

    assert.equal(resolved.credential.access_token, 'persistent-secret-token');
    assert.equal(resolved.credential.refresh_token, 'refresh-secret');
    assert.equal(second.listConnections('user:test')[0].credential_ref, undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('vault file never contains plaintext credential material', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-authority-'));
  try {
    const broker = createLocalCredentialBroker({ directory });
    broker.connect({
      principal_id: 'user:test',
      service: 'github',
      auth_kind: 'oauth',
      credential: { access_token: 'do-not-write-me-in-plaintext' }
    });

    const vaultText = fs.readFileSync(path.join(directory, 'vault.json'), 'utf8');
    const connectionsText = fs.readFileSync(path.join(directory, 'connections.json'), 'utf8');
    assert.equal(vaultText.includes('do-not-write-me-in-plaintext'), false);
    assert.equal(connectionsText.includes('do-not-write-me-in-plaintext'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('tampered encrypted credential fails authentication instead of returning data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-authority-'));
  try {
    const broker = createLocalCredentialBroker({ directory });
    const internal = broker.connect({
      principal_id: 'user:test',
      service: 'github',
      auth_kind: 'oauth',
      credential: { access_token: 'secret-token' }
    });

    const vaultPath = path.join(directory, 'vault.json');
    const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    const record = vault[internal.credential_ref];
    record.ciphertext = `${record.ciphertext.slice(0, -2)}AA`;
    fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2));

    const restarted = createLocalCredentialBroker({ directory });
    assert.throws(
      () => restarted.resolveInternal({ principal_id: 'user:test', service: 'github' }),
      /authenticate|Unsupported state|bad decrypt|unable/i
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('disconnect persists and removes encrypted credential', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-authority-'));
  try {
    const broker = createLocalCredentialBroker({ directory });
    broker.connect({
      principal_id: 'user:test',
      service: 'github',
      auth_kind: 'oauth',
      credential: 'token'
    });
    broker.disconnect({ principal_id: 'user:test', service: 'github' });

    const restarted = createLocalCredentialBroker({ directory });
    assert.equal(restarted.listConnections('user:test')[0].status, 'revoked');
    assert.throws(
      () => restarted.resolveInternal({ principal_id: 'user:test', service: 'github' }),
      (error) => error.code === 'connection_required'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
