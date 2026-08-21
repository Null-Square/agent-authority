import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentToken, decodeAgentToken, parseTtl, verifyAgentToken } from '../src/agent-auth.js';

const key = Buffer.alloc(32, 7);
const mission = {
  version: '0.1',
  mission_id: 'mission:test',
  principal: { id: 'user:test' },
  agent: { id: 'agent:test' },
  objective: 'test',
  resources: [{ service: 'github', allow: ['repo.read'], deny: [] }]
};

test('creates and verifies a mission-bound agent token', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:test', mission_id: 'mission:test', ttl_seconds: 60, now: 1_000_000 });
  const claims = verifyAgentToken(token, { key, principal_id: 'user:test', mission, capability: 'execute', now: 1_010_000 });
  assert.equal(claims.sub, 'agent:test');
  assert.equal(claims.mission_id, 'mission:test');
});

test('rejects a tampered token', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:test' });
  const parts = token.split('.');
  const payload = decodeAgentToken(token).payload;
  parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: 'agent:evil' })).toString('base64url');
  assert.throws(() => verifyAgentToken(parts.join('.'), { key }), /signature is invalid/);
});

test('rejects expired tokens', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:test', ttl_seconds: 10, now: 1_000_000 });
  assert.throws(() => verifyAgentToken(token, { key, now: 1_011_000 }), (error) => error.code === 'agent_token_expired');
});

test('rejects mission substitution', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:test', mission_id: 'mission:one' });
  assert.throws(() => verifyAgentToken(token, { key, mission_id: 'mission:two' }), (error) => error.code === 'mission_binding_mismatch');
});

test('rejects agent identity substitution', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:other' });
  assert.throws(() => verifyAgentToken(token, { key, mission }), (error) => error.code === 'agent_identity_mismatch');
});

test('rejects principal substitution', () => {
  const token = createAgentToken({ key, principal_id: 'user:other', agent_id: 'agent:test' });
  assert.throws(() => verifyAgentToken(token, { key, principal_id: 'user:test' }), (error) => error.code === 'principal_mismatch');
});

test('enforces token capabilities', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:test', capabilities: ['evaluate'] });
  assert.throws(() => verifyAgentToken(token, { key, capability: 'execute' }), (error) => error.code === 'agent_capability_denied');
});

test('admin wildcard token satisfies capabilities', () => {
  const token = createAgentToken({ key, principal_id: 'user:test', agent_id: 'agent:admin', capabilities: ['*'] });
  const claims = verifyAgentToken(token, { key, capability: 'connections.read' });
  assert.deepEqual(claims.capabilities, ['*']);
});

test('TTL parser supports seconds and compact durations', () => {
  assert.equal(parseTtl('90'), 90);
  assert.equal(parseTtl('30m'), 1800);
  assert.equal(parseTtl('2h'), 7200);
  assert.equal(parseTtl('1d'), 86400);
  assert.throws(() => parseTtl('tomorrow'));
});
