import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { TaskLease } from './task-lease.js';

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

function loadOrCreateMasterKey(keyPath) {
  ensureDir(dirname(keyPath));
  if (!existsSync(keyPath)) {
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    try { chmodSync(keyPath, 0o600); } catch {}
  }
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Agent Authority master key is invalid');
  return key;
}

function deriveLocalKey(keyPath, purpose) {
  return createHmac('sha256', loadOrCreateMasterKey(keyPath))
    .update(`agent-authority/${purpose}/v1`)
    .digest();
}

function safeLeaseFileName(leaseId) {
  if (typeof leaseId !== 'string' || leaseId.trim() === '') throw new Error('lease_id is required');
  return `${Buffer.from(leaseId, 'utf8').toString('base64url')}.json`;
}

function taskLeaseEnvelopePayload(envelope) {
  return JSON.stringify({
    version: envelope.version,
    lease_id: envelope.lease_id,
    mission_id: envelope.mission_id,
    lease_hash: envelope.lease_hash,
    snapshot: envelope.snapshot
  });
}

function taskLeaseMac(key, envelope) {
  return createHmac('sha256', key).update(taskLeaseEnvelopePayload(envelope)).digest('hex');
}

function authenticationError(message) {
  const error = new Error(message);
  error.code = 'task_lease_state_authentication_failed';
  return error;
}

function stateConflictError(message, details = {}) {
  const error = new Error(message);
  error.code = 'task_lease_state_conflict';
  Object.assign(error, details);
  return error;
}

function stateLockedError(leaseId) {
  const error = new Error(`task lease ${leaseId} is already being updated by another local worker`);
  error.code = 'task_lease_state_locked';
  error.lease_id = leaseId;
  return error;
}

function transactionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
      task_leases: join(home, 'state', 'task-leases'),
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
    return loadOrCreateMasterKey(this.keyPath);
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

/**
 * Local authenticated persistence for Task Lease authority state.
 *
 * The entire snapshot is written atomically and authenticated with an HMAC key
 * derived from the Agent Authority local master key. Loading verifies the MAC,
 * exact lease/mission identity, snapshot hash and TaskLease lineage validation
 * before reconstructed authority is returned to the caller.
 *
 * Durable mutations should go through transact(). The per-lease lock serializes
 * local read-modify-write transactions, while expected_lease_hash provides an
 * optimistic compare-and-swap check for workers operating on recovered views.
 *
 * This protects against accidental/caller-controlled state-file modification and
 * stale local writers on the trusted host. It is not designed to contain a
 * malicious host or an attacker that can read the local master key.
 */
export class JsonFileTaskLeaseStore {
  constructor({ dir, keyPath }) {
    if (!dir) throw new Error('task lease store dir is required');
    if (!keyPath) throw new Error('task lease store keyPath is required');
    this.dir = dir;
    this.keyPath = keyPath;
    ensureDir(dir);
    ensureDir(dirname(keyPath));
  }

  key() {
    return deriveLocalKey(this.keyPath, 'task-lease-state');
  }

  path(leaseId) {
    return join(this.dir, safeLeaseFileName(leaseId));
  }

  lockPath(leaseId) {
    return `${this.path(leaseId)}.lock`;
  }

  withLeaseLock(leaseId, fn) {
    const lockPath = this.lockPath(leaseId);
    try {
      mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') throw stateLockedError(leaseId);
      throw error;
    }

    try {
      return fn();
    } finally {
      rmSync(lockPath, { recursive: true, force: true });
    }
  }

  envelopeFor(lease) {
    const snapshot = lease.snapshot();
    const envelope = {
      version: 1,
      lease_id: lease.lease_id,
      mission_id: lease.mission.mission_id,
      lease_hash: lease.hash(),
      snapshot
    };
    envelope.mac = taskLeaseMac(this.key(), envelope);
    return envelope;
  }

  writeLease(lease, path = this.path(lease.lease_id)) {
    const envelope = this.envelopeFor(lease);
    atomicJson(path, envelope, 0o600);
    return {
      lease_id: envelope.lease_id,
      mission_id: envelope.mission_id,
      lease_hash: envelope.lease_hash
    };
  }

  save(lease, { expected_lease_hash = null } = {}) {
    if (!(lease instanceof TaskLease)) throw new Error('TaskLease instance is required');
    return this.withLeaseLock(lease.lease_id, () => {
      const path = this.path(lease.lease_id);
      if (existsSync(path)) {
        const current = this.load({ mission: lease.mission, lease_id: lease.lease_id });
        const currentHash = current.hash();
        const nextHash = lease.hash();

        if (expected_lease_hash !== null && currentHash !== expected_lease_hash) {
          throw stateConflictError('task lease state changed since the caller recovered it', {
            lease_id: lease.lease_id,
            expected_lease_hash,
            current_lease_hash: currentHash
          });
        }
        if (expected_lease_hash === null && currentHash !== nextHash) {
          throw stateConflictError(
            'changed durable Task Lease state requires expected_lease_hash or transact()',
            { lease_id: lease.lease_id, current_lease_hash: currentHash, attempted_lease_hash: nextHash }
          );
        }
        if (currentHash === nextHash) {
          return {
            lease_id: lease.lease_id,
            mission_id: lease.mission.mission_id,
            lease_hash: currentHash
          };
        }
      } else if (expected_lease_hash !== null) {
        throw stateConflictError('task lease state does not exist for the supplied expected hash', {
          lease_id: lease.lease_id,
          expected_lease_hash,
          current_lease_hash: null
        });
      }

      const validated = TaskLease.restore({ mission: lease.mission, snapshot: lease.snapshot() });
      return this.writeLease(validated, path);
    });
  }

  load({ mission, lease_id } = {}) {
    if (!mission) throw new Error('mission is required');
    if (!lease_id) throw new Error('lease_id is required');
    const path = this.path(lease_id);
    if (!existsSync(path)) return null;

    const envelope = readJson(path, null);
    if (!envelope || envelope.version !== 1) {
      throw authenticationError('task lease state envelope is invalid or unsupported');
    }
    if (envelope.lease_id !== lease_id || envelope.mission_id !== mission.mission_id) {
      throw authenticationError('task lease state identity does not match the requested lease and mission');
    }
    if (typeof envelope.mac !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.mac)) {
      throw authenticationError('task lease state authentication tag is invalid');
    }

    const expected = Buffer.from(taskLeaseMac(this.key(), envelope), 'hex');
    const actual = Buffer.from(envelope.mac, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw authenticationError('task lease state authentication failed');
    }

    let lease;
    try {
      // Recover against an isolated mission snapshot so a transaction callback
      // cannot mutate the caller's authority ceiling through shared references.
      lease = TaskLease.restore({ mission: structuredClone(mission), snapshot: envelope.snapshot });
    } catch (error) {
      if (!error.code) error.code = 'task_lease_snapshot_invalid';
      throw error;
    }
    if (lease.lease_id !== lease_id || lease.hash() !== envelope.lease_hash) {
      throw authenticationError('task lease state hash does not match recovered authority');
    }
    return lease;
  }

  /**
   * Apply one synchronous durable mutation to the authenticated current lease.
   *
   * The mutation runs against a freshly recovered lease while holding an
   * exclusive local per-lease lock. If expected_lease_hash is supplied, a stale
   * worker fails before its mutation is applied. The resulting snapshot is fully
   * validated and atomically replaced before the updated lease is returned.
   */
  transact({ mission, lease_id, expected_lease_hash = null, mutate } = {}) {
    if (!mission) throw new Error('mission is required');
    if (!lease_id) throw new Error('lease_id is required');
    if (typeof mutate !== 'function') throw new Error('transaction mutate function is required');

    return this.withLeaseLock(lease_id, () => {
      const current = this.load({ mission, lease_id });
      if (!current) {
        throw transactionError('task_lease_state_missing', `task lease ${lease_id} has no durable state`);
      }

      const previousHash = current.hash();
      if (expected_lease_hash !== null && previousHash !== expected_lease_hash) {
        throw stateConflictError('task lease state changed since the caller recovered it', {
          lease_id,
          expected_lease_hash,
          current_lease_hash: previousHash
        });
      }

      const value = mutate(current);
      if (value && typeof value.then === 'function') {
        throw transactionError(
          'task_lease_transaction_async_unsupported',
          'durable Task Lease transactions must be synchronous and side-effect free outside lease state'
        );
      }
      if (current.lease_id !== lease_id || current.mission.mission_id !== mission.mission_id) {
        throw transactionError('task_lease_transaction_identity_changed', 'transaction changed Task Lease identity');
      }

      const validated = TaskLease.restore({ mission, snapshot: current.snapshot() });
      const saved = this.writeLease(validated, this.path(lease_id));
      return {
        lease: validated,
        value,
        previous_lease_hash: previousHash,
        lease_hash: saved.lease_hash
      };
    });
  }

  delete(leaseId) {
    const path = this.path(leaseId);
    if (!existsSync(path)) return false;
    unlinkSync(path);
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
