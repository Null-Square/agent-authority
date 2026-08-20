import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterRegistry } from '../src/index.js';
import { CredentialBroker } from '../src/connections.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';
import { createGitHubProviderAdapter } from '../src/providers/github.js';

function mission(overrides = {}) {
  return {
    version: '0.1',
    mission_id: 'mission:github-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'maintain one repository',
    resources: [{
      service: 'github',
      allow: ['repo.read', 'repo.contents.read', 'issue.create'],
      deny: ['repo.delete'],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }],
    constraints: { max_delegation_depth: 0 },
    ...overrides
  };
}

test('broker lists connection metadata without credential references or tokens', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'null-square',
    auth_kind: 'oauth',
    credential: { access_token: 'super-secret-token' },
    scopes: ['repo']
  });

  const [connection] = broker.listConnections('user:test');
  assert.equal(connection.service, 'github');
  assert.equal('credential_ref' in connection, false);
  assert.equal(JSON.stringify(connection).includes('super-secret-token'), false);
});

test('resource constraints prevent a connected credential being used on another repository', async () => {
  let calls = 0;
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    auth_kind: 'oauth',
    credential: { access_token: 'secret' }
  });

  const adapter = createGitHubProviderAdapter({
    broker,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('should not be called');
    }
  });

  const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });
  const output = await runtime.execute(mission(), {
    service: 'github',
    action: 'repo.read',
    context: { repository: 'Null-Square/another-repo' }
  });

  assert.equal(output.result.decision, 'deny');
  assert.equal(output.result.code, 'resource_constraint_mismatch');
  assert.equal(calls, 0);
});

test('missing connection returns connection_required without executing provider', async () => {
  let calls = 0;
  const broker = new CredentialBroker();
  const adapter = createGitHubProviderAdapter({
    broker,
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    }
  });

  const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });
  const output = await runtime.execute(mission(), {
    service: 'github',
    action: 'repo.read',
    context: { repository: 'Null-Square/agent-authority' }
  });

  assert.equal(output.result.code, 'connection_required');
  assert.equal(calls, 0);
});

test('authorized GitHub execution uses credential internally and returns sanitized output', async () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    auth_kind: 'oauth',
    credential: { access_token: 'super-secret-token' },
    scopes: ['repo']
  });

  let authorizationHeader = null;
  let requestedUrl = null;
  const adapter = createGitHubProviderAdapter({
    broker,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      authorizationHeader = options.headers.authorization;
      return new Response(JSON.stringify({ full_name: 'Null-Square/agent-authority' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-github-request-id': 'TEST123' }
      });
    }
  });

  const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });
  const output = await runtime.execute(mission(), {
    service: 'github',
    action: 'repo.read',
    context: { repository: 'Null-Square/agent-authority' }
  });

  assert.equal(output.result.decision, 'allow');
  assert.equal(requestedUrl, 'https://api.github.com/repos/Null-Square/agent-authority');
  assert.equal(authorizationHeader, 'Bearer super-secret-token');
  assert.equal(output.output.body.full_name, 'Null-Square/agent-authority');
  assert.equal(JSON.stringify(output).includes('super-secret-token'), false);
});

test('provider output recursively redacts nested secrets', async () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test', service: 'github', auth_kind: 'oauth', credential: 'broker-token'
  });
  const adapter = createGitHubProviderAdapter({
    broker,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      nested: { access_token: 'leaked-token', deeper: [{ refresh_token: 'leaked-refresh' }] },
      authorization: 'Bearer leaked'
    }), { status: 200 })
  });
  const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });

  const output = await runtime.execute(mission(), {
    service: 'github', action: 'repo.read', context: { repository: 'Null-Square/agent-authority' }
  });

  assert.equal(output.output.body.nested.access_token, '[redacted]');
  assert.equal(output.output.body.nested.deeper[0].refresh_token, '[redacted]');
  assert.equal(output.output.body.authorization, '[redacted]');
  assert.equal(JSON.stringify(output).includes('leaked-token'), false);
});

test('reconnecting same account rotates credential and destroys stale secret', () => {
  const broker = new CredentialBroker();
  const first = broker.connect({
    principal_id: 'user:test', service: 'github', auth_kind: 'oauth', credential: 'old-token'
  });
  const second = broker.connect({
    principal_id: 'user:test', service: 'github', auth_kind: 'oauth', credential: 'new-token'
  });

  assert.equal(first.connection_id, second.connection_id);
  assert.notEqual(first.credential_ref, second.credential_ref);
  assert.equal(broker.resolveInternal({ principal_id: 'user:test', service: 'github' }).credential, 'new-token');
  assert.throws(() => broker.secrets.get(first.credential_ref), /unavailable/);
});

test('disconnect makes connection unusable and hides vault reference', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test', service: 'github', auth_kind: 'oauth', credential: 'token'
  });

  const disconnected = broker.disconnect({ principal_id: 'user:test', service: 'github' });
  assert.equal(disconnected.status, 'revoked');
  assert.equal(disconnected.credential_ref, undefined);
  assert.throws(
    () => broker.resolveInternal({ principal_id: 'user:test', service: 'github' }),
    (error) => error.code === 'connection_required'
  );
});

test('multi-account selection resolves only the requested account credential', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test', service: 'github', account_id: 'work', auth_kind: 'oauth', credential: 'work-token'
  });
  broker.connect({
    principal_id: 'user:test', service: 'github', account_id: 'personal', auth_kind: 'oauth', credential: 'personal-token'
  });

  assert.equal(
    broker.resolveInternal({ principal_id: 'user:test', service: 'github', account_id: 'work' }).credential,
    'work-token'
  );
  assert.equal(
    broker.resolveInternal({ principal_id: 'user:test', service: 'github', account_id: 'personal' }).credential,
    'personal-token'
  );
});

test('delegated child cannot drop repository constraints', async () => {
  const { deriveMission } = await import('../src/index.js');
  const parent = mission({ constraints: { max_delegation_depth: 1 } });
  assert.throws(() => deriveMission(parent, {
    agent: { id: 'agent:child' },
    resources: [{ service: 'github', allow: ['repo.read'], deny: [] }]
  }), /expands parent authority/);
});
