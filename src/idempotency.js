import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashObject } from './index.js';

function ensureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try { chmodSync(path, 0o700); } catch {}
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function atomicJson(path, value) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch {}
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch {}
}

function guardError(code, message, record = null) {
  const error = new Error(message);
  error.code = code;
  error.execution_record = record;
  return error;
}

function fingerprintRequest(request = {}) {
  const { approval_id, ...rest } = request;
  return rest;
}

export function executionFingerprint(mission, request) {
  return hashObject({ mission_hash: hashObject(mission), request: fingerprintRequest(request) });
}

export class JsonFileExecutionGuard {
  constructor(path) {
    this.path = path;
    ensureDir(dirname(path));
  }

  all() { return readJson(this.path); }
  write(value) { atomicJson(this.path, value); }
  key(missionId, idempotencyKey) { return `${missionId}\u0000${idempotencyKey}`; }

  begin({ mission, request, now = Date.now() }) {
    const idempotencyKey = request?.idempotency_key;
    if (!idempotencyKey) throw guardError('idempotency_key_required', 'mutating actions require request.idempotency_key');
    if (String(idempotencyKey).length > 200) throw guardError('invalid_idempotency_key', 'idempotency key is too long');

    const all = this.all();
    const key = this.key(mission.mission_id, idempotencyKey);
    const fingerprint = executionFingerprint(mission, request);
    const existing = all[key];
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw guardError('idempotency_conflict', 'idempotency key was already used for a different request', existing);
      }
      throw guardError(
        existing.status === 'succeeded' ? 'duplicate_execution' : 'execution_already_started',
        `idempotent execution is already ${existing.status}`,
        existing
      );
    }

    const record = {
      execution_id: `execution:${randomUUID()}`,
      mission_id: mission.mission_id,
      agent_id: mission.agent.id,
      idempotency_key: String(idempotencyKey),
      fingerprint,
      service: request.service,
      action: request.action,
      status: 'in_progress',
      started_at: new Date(Number(now)).toISOString(),
      completed_at: null,
      receipt_id: null,
      error_code: null
    };
    all[key] = record;
    this.write(all);
    return { ...record };
  }

  complete({ mission, request, receipt_id = null, now = Date.now() }) {
    return this.finish({ mission, request, status: 'succeeded', receipt_id, now });
  }

  uncertain({ mission, request, error_code = 'execution_uncertain', now = Date.now() }) {
    return this.finish({ mission, request, status: 'uncertain', error_code, now });
  }

  finish({ mission, request, status, receipt_id = null, error_code = null, now = Date.now() }) {
    const all = this.all();
    const key = this.key(mission.mission_id, request.idempotency_key);
    const record = all[key];
    if (!record) throw guardError('execution_record_missing', 'execution guard record is missing');
    record.status = status;
    record.completed_at = new Date(Number(now)).toISOString();
    record.receipt_id = receipt_id;
    record.error_code = error_code;
    all[key] = record;
    this.write(all);
    return { ...record };
  }

  list({ mission_id, status } = {}) {
    return Object.values(this.all())
      .filter((record) => !mission_id || record.mission_id === mission_id)
      .filter((record) => !status || record.status === status)
      .map((record) => ({ ...record }));
  }
}
