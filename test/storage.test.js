import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EncryptedFileSecretStore,
  JsonFileConnectionRegistry,
  JsonFileRevocationStore,
  JsonFileUsageLedger,
  ensureAuthorityHome,
  loadConfig
} from '../src/storage.js';

test('authority home persists encrypted secrets and state across instances', () => {
  const home = mkdtempSync(join(tmpdir(), 'agent-authority-'));
  ensureAuthorityHome({ home, principal_id: 'user:test' });
  const config = loadConfig({ home });

  const secrets = new EncryptedFileSecretStore({ path: config.paths.secrets, keyPath: config.paths.master_key });
  const ref = secrets.put({ access_token: 'super-secret-token' });
  assert.equal(secrets.get(ref).access_token, 'super-secret-token');
  assert.doesNotMatch(readFileSync(config.paths.secrets, 'utf8'), /super-secret-token/);

  const connections = new JsonFileConnectionRegistry(config.paths.connections);
  connections.connect({ principal_id: 'user:test', service: 'github', account_id: 'octo', auth_kind: 'github-token', credential_ref: ref });
  assert.equal(new JsonFileConnectionRegistry(config.paths.connections).get({ principal_id: 'user:test', service: 'github', account_id: 'octo' }).status, 'active');

  const revocations = new JsonFileRevocationStore(config.paths.revocations);
  revocations.revoke('mission:test', 'stopped');
  assert.equal(new JsonFileRevocationStore(config.paths.revocations).get('mission:test').reason, 'stopped');

  const usage = new JsonFileUsageLedger(config.paths.usage);
  usage.record('mission:test', 'USD', 20);
  usage.record('mission:test', 'USD', 30);
  assert.equal(new JsonFileUsageLedger(config.paths.usage).spent('mission:test', 'USD'), 50);
});
