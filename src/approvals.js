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

function approvalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requestForFingerprint(request = {}) {
  const { approval_id, ...rest } = request;
  return rest;
}

export function approvalFingerprint(mission, request) {
  return hashObject({
    mission_hash: hashObject(mission),
    request: requestForFingerprint(request)
  });
}

function summarizeContext(context = {}) {
  const summary = {};
  for (const key of ['repository', 'account', 'resource', 'amount', 'currency', 'domain', 'zone', 'project']) {
    if (context[key] !== undefined) summary[key] = context[key];
  }
  return summary;
}

export class JsonFileApprovalStore {
  constructor(path, { defaultTtlSeconds = 600 } = {}) {
    this.path = path;
    this.defaultTtlSeconds = defaultTtlSeconds;
    ensureDir(dirname(path));
  }

  all() { return readJson(this.path); }
  write(value) { atomicJson(this.path, value); }

  request({ mission, request, reason = 'human approval required', ttl_seconds = this.defaultTtlSeconds, now = Date.now() }) {
    const fingerprint = approvalFingerprint(mission, request);
    const all = this.all();
    const currentMs = Number(now);
    const existing = Object.values(all).find((record) =>
      record.fingerprint === fingerprint &&
      record.status === 'pending' &&
      Date.parse(record.expires_at) > currentMs
    );
    if (existing) return { ...existing };

    const approvalId = `approval:${randomUUID()}`;
    const created = new Date(currentMs);
    const expires = new Date(currentMs + Number(ttl_seconds) * 1000);
    const record = {
      approval_id: approvalId,
      status: 'pending',
      principal_id: mission.principal.id,
      agent_id: mission.agent.id,
      mission_id: mission.mission_id,
      service: request.service,
      action: request.action,
      context: summarizeContext(request.context),
      reason,
      fingerprint,
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
      decided_at: null,
      decided_by: null,
      consumed_at: null
    };
    all[approvalId] = record;
    this.write(all);
    return { ...record };
  }

  get(approvalId) {
    const record = this.all()[approvalId];
    return record ? { ...record } : null;
  }

  list({ principal_id, status } = {}) {
    return Object.values(this.all())
      .filter((record) => !principal_id || record.principal_id === principal_id)
      .filter((record) => !status || record.status === status)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((record) => ({ ...record }));
  }

  decide(approvalId, { principal_id, decision, now = Date.now() }) {
    if (!['approved', 'denied'].includes(decision)) throw new Error('approval decision must be approved or denied');
    const all = this.all();
    const record = all[approvalId];
    if (!record) throw approvalError('approval_not_found', 'approval request does not exist');
    if (principal_id && record.principal_id !== principal_id) throw approvalError('principal_mismatch', 'approval belongs to another principal');
    if (record.status !== 'pending') throw approvalError('approval_already_decided', `approval is already ${record.status}`);
    if (Date.parse(record.expires_at) <= Number(now)) {
      record.status = 'expired';
      all[approvalId] = record;
      this.write(all);
      throw approvalError('approval_expired', 'approval request has expired');
    }
    record.status = decision;
    record.decided_at = new Date(Number(now)).toISOString();
    record.decided_by = principal_id || record.principal_id;
    all[approvalId] = record;
    this.write(all);
    return { ...record };
  }

  approve(approvalId, options = {}) { return this.decide(approvalId, { ...options, decision: 'approved' }); }
  deny(approvalId, options = {}) { return this.decide(approvalId, { ...options, decision: 'denied' }); }

  consume(approvalId, { mission, request, now = Date.now() }) {
    const all = this.all();
    const record = all[approvalId];
    if (!record) throw approvalError('approval_not_found', 'approval request does not exist');
    if (Date.parse(record.expires_at) <= Number(now)) throw approvalError('approval_expired', 'approval request has expired');
    if (record.status === 'denied') throw approvalError('approval_denied', 'human denied this action');
    if (record.status === 'consumed' || record.consumed_at) {
      throw approvalError('approval_replayed', 'approval has already been consumed');
    }
    if (record.status !== 'approved') throw approvalError('approval_pending', 'approval has not been granted yet');
    if (record.principal_id !== mission.principal.id || record.agent_id !== mission.agent.id || record.mission_id !== mission.mission_id) {
      throw approvalError('approval_binding_mismatch', 'approval is bound to a different principal, agent, or mission');
    }
    if (record.fingerprint !== approvalFingerprint(mission, request)) {
      throw approvalError('approval_binding_mismatch', 'approval is bound to a different action or request context');
    }

    record.status = 'consumed';
    record.consumed_at = new Date(Number(now)).toISOString();
    all[approvalId] = record;
    this.write(all);
    return { ...record };
  }
}
