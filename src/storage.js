import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function authorityHome(env = process.env) {
  return resolve(env.AGENT_AUTHORITY_HOME || join(homedir(), '.agent-authority'));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try { chmodSync(path, 0o700); } catch {}
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function atomicJson(path, value, mode = 0o600) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  try { chmodSync(tmp, mode); } catch {}
  renameSync(tmp, path);
  try { chmodSync(path, mode); } catch {}
}

export function defaultConfig(home = authorityHome()) {
  return {
    version: 1,
    principal_id: 'user:local',
    server: { host: '127.0.0.1', port: 8787 },
    paths: {
      connections: join(home, 'state', 'connections.json'),
      secrets: join(home, 'vault', 'secrets.enc.json'),
      master_key: join(home, 'vault', 'master.key'),
      revocations: join(home, 'state', 'revocations.json'),
      usage: join(home, 'state', 'usage.json'),
      receipts: join(home, 'receipts')
    }
  };
}

export function ensureAuthorityHome({ home = authorityHome(), principal_id } = {}) {
  ensureDir(home);
  ensureDir(join(home, 'state'));
  ensureDir(join(home, 'vault'));
  ensureDir(join(home, 'missions'));
  ensureDir(join(home, 'receipts'));
  const configPath = join(home, 'config.json');
  if (!existsSync(configPath)) {
    const config = defaultConfig(home);
    if (principal_id) config.principal_id = principal_id;
    atomicJson(configPath, config, 0o600);
  }
  return { home, configPath };
}

export function loadConfig({ home = authorityHome() } = {}) {
  const { configPath } = ensureAuthorityHome({ home });
  const stored = readJson(configPath, {});
  const defaults = defaultConfig(home);
  return {
    ...defaults,
    ...stored,
    server: { ...defaults.server, ...(stored.server || {}) },
    paths: { ...defaults.paths, ...(stored.paths || {}) }
  };
}

export function saveConfig(config, { home = authorityHome() } = {}) {
  ensureAuthorityHome({ home });
  atomicJson(join(home, 'config.json'), config, 0o600);
  return config;
}

function connectionKey(principalId, service, accountId = 'default') {
  return `${principalId}\u0000${service}\u0000${accountId}`;
}

export class JsonFileConnectionRegistry {
  constructor(path) { this.path = path; ensureDir(dirname(path)); }
  all() { return readJson(this.path, {}); }
  write(value) { atomicJson(this.path, value, 0o600); }

  connect({ principal_id, service, account_id = 'default', auth_kind, credential_ref, scopes = [], metadata = {} }) {
    if (!principal_id || !service || !auth_kind || !credential_ref) throw new Error('principal_id, service, auth_kind, and credential_ref are required');
    const all = this.all();
    const k = connectionKey(principal_id, service, account_id);
    const previous = all[k];
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
    all[k] = connection;
    this.write(all);
    return { ...connection };
  }

  get({ principal_id, service, account_id = 'default' }) {
    const value = this.all()[connectionKey(principal_id, service, account_id)];
    return value ? { ...value } : null;
  }

  list(principal_id) {
    return Object.values(this.all()).filter((c) => !principal_id || c.principal_id === principal_id).map((c) => ({ ...c }));
  }

  disconnect({ principal_id, service, account_id = 'default' }) {
    const all = this.all();
    const k = connectionKey(principal_id, service, account_id);
    if (!all[k]) return null;
    all[k] = { ...all[k], status: 'revoked', updated_at: new Date().toISOString() };
    this.write(all);
    return { ...all[k] };
  }
}

export class EncryptedFileSecretStore {
  constructor({ path, keyPath }) {
    this.path = path;
    this.keyPath = keyPath;
    ensureDir(dirname(path));
    ensureDir(dirname(keyPath));
  }

  key() {
    if (!existsSync(this.keyPath)) {
      writeFileSync(this.keyPath, randomBytes(32), { mode: 0o600 });
      try { chmodSync(this.keyPath, 0o600); } catch {}
    }
    const key = readFileSync(this.keyPath);
    if (key.length !== 32) throw new Error('Agent Authority master key is invalid');
    return key;
  }

  all() { return readJson(this.path, {}); }
  write(value) { atomicJson(this.path, value, 0o600); }

  put(value) {
    const ref = `secret:${randomUUID()}`;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const plaintext = Buffer.from(JSON.stringify(value));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const all = this.all();
    all[ref] = { v: 1, alg: 'A256GCM', iv: iv.toString('base64'), tag: tag.toString('base64'), ciphertext: ciphertext.toString('base64') };
    this.write(all);
    return ref;
  }

  get(ref) {
    const record = this.all()[ref];
    if (!record) throw new Error('credential secret is unavailable');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  delete(ref) {
    const all = this.all();
    if (!all[ref]) return false;
    delete all[ref];
    this.write(all);
    return true;
  }
}

export class JsonFileRevocationStore {
  constructor(path) { this.path = path; ensureDir(dirname(path)); }
  all() { return readJson(this.path, {}); }
  revoke(missionId, reason = 'revoked by principal') {
    const all = this.all();
    const record = { reason, revoked_at: new Date().toISOString() };
    all[missionId] = record;
    atomicJson(this.path, all, 0o600);
    return record;
  }
  get(missionId) { return this.all()[missionId] || null; }
}

export class JsonFileUsageLedger {
  constructor(path) { this.path = path; ensureDir(dirname(path)); }
  all() { return readJson(this.path, {}); }
  key(missionId, currency) { return `${missionId}\u0000${currency || 'UNSPECIFIED'}`; }
  spent(missionId, currency) { return Number(this.all()[this.key(missionId, currency)] || 0); }
  record(missionId, currency, amount) {
    const all = this.all();
    const k = this.key(missionId, currency);
    all[k] = Number(all[k] || 0) + Number(amount);
    atomicJson(this.path, all, 0o600);
    return all[k];
  }
}

export function writeReceipt(receiptsDir, receipt) {
  ensureDir(receiptsDir);
  const safe = String(receipt.receipt_id || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, '_');
  atomicJson(join(receiptsDir, `${safe}.json`), receipt, 0o600);
}
