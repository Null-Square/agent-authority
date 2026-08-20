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

test('delegated child cannot drop repository constraints', async () => {
  const { deriveMission } = await import('../src/index.js');
  const parent = mission({ constraints: { max_delegation_depth: 1 } });
  assert.throws(() => deriveMission(parent, {
    agent: { id: 'agent:child' },
    resources: [{ service: 'github', allow: ['repo.read'], deny: [] }]
  }), /expands parent authority/);
});
