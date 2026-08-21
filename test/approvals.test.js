import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileApprovalStore } from '../src/approvals.js';

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'aa-approval-'));
  const store = new JsonFileApprovalStore(join(home, 'approvals.json'));
  const mission = {
    version: '0.1',
    mission_id: 'mission:test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'deploy',
    resources: [{ service: 'github', allow: ['repo.write'], deny: [] }]
  };
  const request = {
    service: 'github',
    action: 'repo.write',
    context: { repository: 'Null-Square/agent-authority', content: 'sensitive-not-for-approval-log' }
  };
  return { home, store, mission, request };
}

test('creates a pending approval and deduplicates identical pending requests', () => {
  const f = fixture();
  try {
    const first = f.store.request({ mission: f.mission, request: f.request, now: 1_000_000 });
    const second = f.store.request({ mission: f.mission, request: f.request, now: 1_001_000 });
    assert.equal(first.approval_id, second.approval_id);
    assert.equal(first.status, 'pending');
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('approval record stores only selected context summary fields', () => {
  const f = fixture();
  try {
    const approval = f.store.request({ mission: f.mission, request: f.request });
    assert.equal(approval.context.repository, 'Null-Square/agent-authority');
    assert.equal('content' in approval.context, false);
    const raw = readFileSync(join(f.home, 'approvals.json'), 'utf8');
    assert.equal(raw.includes('sensitive-not-for-approval-log'), false);
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('approved request can be consumed exactly once', () => {
  const f = fixture();
  try {
    const pending = f.store.request({ mission: f.mission, request: f.request, now: 1_000_000 });
    f.store.approve(pending.approval_id, { principal_id: 'user:test', now: 1_001_000 });
    const consumed = f.store.consume(pending.approval_id, { mission: f.mission, request: f.request, now: 1_002_000 });
    assert.equal(consumed.status, 'consumed');
    assert.throws(
      () => f.store.consume(pending.approval_id, { mission: f.mission, request: f.request, now: 1_003_000 }),
      (error) => error.code === 'approval_replayed'
    );
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('approval cannot authorize a modified request', () => {
  const f = fixture();
  try {
    const pending = f.store.request({ mission: f.mission, request: f.request, now: 1_000_000 });
    f.store.approve(pending.approval_id, { principal_id: 'user:test', now: 1_001_000 });
    const modified = { ...f.request, context: { ...f.request.context, repository: 'Null-Square/other' } };
    assert.throws(
      () => f.store.consume(pending.approval_id, { mission: f.mission, request: modified, now: 1_002_000 }),
      (error) => error.code === 'approval_binding_mismatch'
    );
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('approval cannot authorize another agent or mission', () => {
  const f = fixture();
  try {
    const pending = f.store.request({ mission: f.mission, request: f.request, now: 1_000_000 });
    f.store.approve(pending.approval_id, { principal_id: 'user:test', now: 1_001_000 });
    const otherMission = { ...f.mission, mission_id: 'mission:other' };
    assert.throws(
      () => f.store.consume(pending.approval_id, { mission: otherMission, request: f.request, now: 1_002_000 }),
      (error) => error.code === 'approval_binding_mismatch'
    );
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('denied approval cannot be consumed', () => {
  const f = fixture();
  try {
    const pending = f.store.request({ mission: f.mission, request: f.request, now: 1_000_000 });
    f.store.deny(pending.approval_id, { principal_id: 'user:test', now: 1_001_000 });
    assert.throws(
      () => f.store.consume(pending.approval_id, { mission: f.mission, request: f.request, now: 1_002_000 }),
      (error) => error.code === 'approval_denied'
    );
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('expired approval cannot be granted or consumed', () => {
  const f = fixture();
  try {
    const pending = f.store.request({ mission: f.mission, request: f.request, ttl_seconds: 1, now: 1_000_000 });
    assert.throws(
      () => f.store.approve(pending.approval_id, { principal_id: 'user:test', now: 1_002_000 }),
      (error) => error.code === 'approval_expired'
    );
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});
