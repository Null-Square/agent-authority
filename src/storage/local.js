import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { CredentialBroker } from '../connections.js';

function connectionKey(principalId, service, accountId = 'default') {
  return `${principalId}\u0000${service}\u0000${accountId}`;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch { /* best effort on platforms without POSIX modes */ }
}

function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  ensureDirectory(directory);
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(tempPath, 0o600); } catch { /* best effort */ }
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return fallback;
  return JSON.parse(text);
}

export function defaultAgentAuthorityDirectory() {
  return process.env.AGENT_AUTHORITY_HOME || path.join(os.homedir(), '.agent-authority');
}

export class FileConnectionRegistry {
  constructor({ filePath } = {}) {
    this.filePath = filePath || path.join(defaultAgentAuthorityDirectory(), 'connections.json');
    ensureDirectory(path.dirname(this.filePath));
    this.connections = new Map();
    this.reload();
  }

  reload() {
    this.connections.clear();
    const records = readJson(this.filePath, []);
    if (!Array.isArray(records)) throw new Error('connection store must contain an array');
    for (const connection of records) {
      if (!connection?.principal_id || !connection?.service) continue;
      this.connections.set(
        connectionKey(connection.principal_id, connection.service, connection.account_id || 'default'),
        connection
      );
    }
  }

  persist() {
    atomicWriteJson(this.filePath, [...this.connections.values()]);
  }

  connect({ principal_id, service, account_id = 'default', auth_kind, credential_ref, scopes = [], metadata = {} }) {
    if (!principal_id) throw new Error('principal_id is required');
    if (!service) throw new Error('service is required');
    if (!auth_kind) throw new Error('auth_kind is required');
    if (!credential_ref) throw new Error('credential_ref is required');

    const key = connectionKey(principal_id, service, account_id);
    const previous = this.connections.get(key);
    const now = new Date().toISOString();
    const connection = {
      connection_id: previous?.connection_id || `connection:${randomUUID()}`,
      principal_id,
      service,
      account_id,
      auth_kind,
      credential_ref,
      scopes: [...new Set(scopes)],
      metadata,
      status: 'active',
      connected_at: previous?.connected_at || now,
      updated_at: now
    };

    this.connections.set(key, connection);
    this.persist();
    return { ...connection };
  }

  get({ principal_id, service, account_id = 'default' }) {
    const connection = this.connections.get(connectionKey(principal_id, service, account_id));
    return connection ? { ...connection } : null;
  }

  list(principal_id) {
    return [...this.connections.values()]
      .filter((connection) => !principal_id || connection.principal_id === principal_id)
      .map((connection) => ({ ...connection }));
  }

  disconnect({ principal_id, service, account_id = 'default' }) {
    const key = connectionKey(principal_id, service, account_id);
    const current = this.connections.get(key);
    if (!current) return null;
    const connection = { ...current, status: 'revoked', updated_at: new Date().toISOString() };
    this.connections.set(key, connection);
    this.persist();
    return { ...connection };
  }
}

function loadOrCreateMasterKey(keyPath) {
  ensureDirectory(path.dirname(keyPath));
  if (fs.existsSync(keyPath)) {
    const encoded = fs.readFileSync(keyPath, 'utf8').trim();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('Agent Authority master key must be 32 bytes');
    return key;
  }

  const key = randomBytes(32);
  fs.writeFileSync(keyPath, `${key.toString('base64')}\n`, { mode: 0o600, flag: 'wx' });
  try { fs.chmodSync(keyPath, 0o600); } catch { /* best effort */ }
  return key;
}

export class EncryptedFileSecretStore {
  constructor({ filePath, keyPath } = {}) {
    const directory = defaultAgentAuthorityDirectory();
    this.filePath = filePath || path.join(directory, 'vault.json');
    this.keyPath = keyPath || path.join(directory, 'master.key');
    ensureDirectory(path.dirname(this.filePath));
    ensureDirectory(path.dirname(this.keyPath));
    this.key = loadOrCreateMasterKey(this.keyPath);
    this.records = readJson(this.filePath, {});
    if (!this.records || typeof this.records !== 'object' || Array.isArray(this.records)) {
      throw new Error('encrypted vault must contain an object');
    }
  }

  persist() {
    atomicWriteJson(this.filePath, this.records);
  }

  put(value) {
    const ref = `secret:${randomUUID()}`;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    this.records[ref] = {
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };
    this.persist();
    return ref;
  }

  get(ref) {
    const record = this.records[ref];
    if (!record) throw new Error('credential secret is unavailable');
    if (record.algorithm !== 'aes-256-gcm') throw new Error('unsupported vault encryption algorithm');

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(record.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final()
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  delete(ref) {
    if (!(ref in this.records)) return false;
    delete this.records[ref];
    this.persist();
    return true;
  }
}

export function createLocalCredentialBroker({ directory = defaultAgentAuthorityDirectory() } = {}) {
  ensureDirectory(directory);
  return new CredentialBroker({
    connections: new FileConnectionRegistry({ filePath: path.join(directory, 'connections.json') }),
    secrets: new EncryptedFileSecretStore({
      filePath: path.join(directory, 'vault.json'),
      keyPath: path.join(directory, 'master.key')
    })
  });
}
