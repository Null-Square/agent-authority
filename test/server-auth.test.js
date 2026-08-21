import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureAuthorityHome } from '../src/storage.js';
import { createAgentAuthorityServer } from '../src/server.js';
import { createAgentToken } from '../src/agent-auth.js';

function mission(agent = 'agent:test') {
  return {
    version: '0.1',
    mission_id: 'mission:http',
    principal: { id: 'user:test' },
    agent: { id: agent },
    objective: 'read repository',
    resources: [{ service: 'github', allow: ['repo.read'], deny: [] }]
  };
}

async function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'aa-server-'));
  ensureAuthorityHome({ home, principal_id: 'user:test' });
  const instance = createAgentAuthorityServer({ home, host: '127.0.0.1', port: 0 });
  await new Promise((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(0, '127.0.0.1', resolve);
  });
  const address = instance.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const token = (options = {}) => createAgentToken({
    key: instance.env.agentAuthKey,
    principal_id: 'user:test',
    agent_id: 'agent:test',
    mission_id: 'mission:http',
    ...options
  });
  return {
    home,
    instance,
    baseUrl,
    token,
    async close() {
      await new Promise((resolve) => instance.server.close(resolve));
      rmSync(home, { recursive: true, force: true });
    }
  };
}

async function request(baseUrl, path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  return { response, json };
}

test('health and discovery are public but do not expose principal identity', async () => {
  const f = await fixture();
  try {
    const health = await request(f.baseUrl, '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.json.principal_id, undefined);
    const discovery = await request(f.baseUrl, '/.well-known/agent-authority');
    assert.equal(discovery.response.status, 200);
    assert.equal(discovery.json.authorization.token_type, 'agent-instance');
  } finally { await f.close(); }
});

test('protected API rejects unauthenticated request', async () => {
  const f = await fixture();
  try {
    const result = await request(f.baseUrl, '/v1/evaluate', {
      body: { mission: mission(), request: { service: 'github', action: 'repo.read' } }
    });
    assert.equal(result.response.status, 401);
    assert.equal(result.json.code, 'missing_agent_token');
  } finally { await f.close(); }
});

test('valid mission-bound agent token can evaluate its own mission', async () => {
  const f = await fixture();
  try {
    const result = await request(f.baseUrl, '/v1/evaluate', {
      token: f.token(),
      body: { mission: mission(), request: { service: 'github', action: 'repo.read' } }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.result.decision, 'allow');
  } finally { await f.close(); }
});

test('agent token cannot impersonate another mission agent', async () => {
  const f = await fixture();
  try {
    const result = await request(f.baseUrl, '/v1/evaluate', {
      token: f.token(),
      body: { mission: mission('agent:other'), request: { service: 'github', action: 'repo.read' } }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.code, 'agent_identity_mismatch');
  } finally { await f.close(); }
});

test('mission-bound token cannot be reused for another mission id', async () => {
  const f = await fixture();
  try {
    const other = { ...mission(), mission_id: 'mission:other' };
    const result = await request(f.baseUrl, '/v1/evaluate', {
      token: f.token(),
      body: { mission: other, request: { service: 'github', action: 'repo.read' } }
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.code, 'mission_binding_mismatch');
  } finally { await f.close(); }
});

test('normal agent token cannot list all connected accounts', async () => {
  const f = await fixture();
  try {
    const result = await request(f.baseUrl, '/v1/connections', { token: f.token() });
    assert.equal(result.response.status, 403);
    assert.equal(result.json.code, 'agent_capability_denied');
  } finally { await f.close(); }
});

test('short-lived admin token can access admin API', async () => {
  const f = await fixture();
  try {
    const admin = createAgentToken({
      key: f.instance.env.agentAuthKey,
      principal_id: 'user:test',
      agent_id: 'agent:admin',
      capabilities: ['*'],
      ttl_seconds: 60
    });
    const result = await request(f.baseUrl, '/v1/connections', { token: admin });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json.connections, []);
  } finally { await f.close(); }
});
