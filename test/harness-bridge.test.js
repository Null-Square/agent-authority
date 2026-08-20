import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { issueHarnessActionGrant, verifyHarnessActionGrant } from '../src/harness-bridge.js';

const key = randomBytes(32);
const mission = {
  version: '0.1',
  mission_id: 'mission:harness-poc',
  principal: { id: 'user:test' },
  agent: { id: 'agent:chatgpt:test' },
  objective: 'Exercise harness-managed connectors',
  resources: [{ service: 'github', allow: ['repo.read'] }]
};
const request = {
  service: 'github',
  action: 'repo.read',
  context: { repository: 'Null-Square/agent-authority' }
};

test('harness grant verifies only for the exact mission and request', () => {
  const issued = issueHarnessActionGrant({ key, mission, request, ttl_seconds: 30, now: 1_000_000 });
  const claims = verifyHarnessActionGrant(issued.token, { key, mission, request, now: 1_005_000 });
  assert.equal(claims.service, 'github');
  assert.equal(claims.action, 'repo.read');
});

test('harness grant rejects request substitution', () => {
  const issued = issueHarnessActionGrant({ key, mission, request, ttl_seconds: 30, now: 1_000_000 });
  assert.throws(() => verifyHarnessActionGrant(issued.token, {
    key,
    mission,
    request: { ...request, context: { repository: 'Null-Square/another-repo' } },
    now: 1_005_000
  }), (error) => error.code === 'grant_request_mismatch');
});

test('harness grant rejects mission substitution', () => {
  const issued = issueHarnessActionGrant({ key, mission, request, ttl_seconds: 30, now: 1_000_000 });
  assert.throws(() => verifyHarnessActionGrant(issued.token, {
    key,
    mission: { ...mission, mission_id: 'mission:other' },
    request,
    now: 1_005_000
  }), (error) => error.code === 'grant_mission_mismatch');
});

test('harness grant rejects tampering', () => {
  const issued = issueHarnessActionGrant({ key, mission, request, ttl_seconds: 30, now: 1_000_000 });
  const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => verifyHarnessActionGrant(tampered, { key, mission, request, now: 1_005_000 }), (error) => error.code === 'grant_signature_invalid');
});

test('harness grant expires quickly', () => {
  const issued = issueHarnessActionGrant({ key, mission, request, ttl_seconds: 10, now: 1_000_000 });
  assert.throws(() => verifyHarnessActionGrant(issued.token, { key, mission, request, now: 1_011_000 }), (error) => error.code === 'grant_expired');
});
