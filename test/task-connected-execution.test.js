import test from 'node:test';
import assert from 'node:assert/strict';

import { AdapterRegistry } from '../src/index.js';
import { CredentialBroker } from '../src/connections.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError
} from '../src/guard.js';
import { createGitHubProviderAdapter } from '../src/providers/github.js';
import { createTask } from '../src/task.js';

function connectedRuntime({ broker, fetchImpl }) {
  const adapters = new AdapterRegistry()
    .register(createGitHubProviderAdapter({ broker, fetchImpl }));
  return new ExecutingAuthorityRuntime({ adapters });
}

function repoTask(runtime, repository = 'acme/private') {
  return createTask({
    principal: 'user:test',
    agent: 'agent:test',
    request: `Inspect only ${repository}`,
    permissions: {
      github: {
        allow: ['repo.read'],
        deny: ['repo.write', 'repo.delete'],
        constraints: {}
      }
    },
    authority: {
      repository: { kind: 'github.repository', value: repository }
    },
    bindings: [
      { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
    ],
    runtime
  });
}

test('task.execute keeps credentials broker-internal and blocks unrelated resources before provider execution', async () => {
  const token = 'github-secret-sentinel';
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'octocat',
    auth_kind: 'github-token',
    credential: { access_token: token },
    scopes: ['metadata:read']
  });

  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), authorization: options.headers?.authorization || null });
    return new Response(JSON.stringify({
      full_name: 'acme/private',
      private: true,
      html_url: 'https://github.com/acme/private'
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-github-request-id': 'REQ-1'
      }
    });
  };

  const runtime = connectedRuntime({ broker, fetchImpl });
  const task = repoTask(runtime);

  const execution = await task.execute({
    service: 'github',
    action: 'repo.read',
    context: { repository: 'acme/private' }
  });

  assert.equal(execution.result.decision, 'allow');
  assert.equal(execution.output.provider, 'github');
  assert.equal(execution.output.body.full_name, 'acme/private');
  assert.ok(execution.evidence);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, `Bearer ${token}`);

  const publicState = JSON.stringify({
    mission: task.mission,
    authorities: task.authorities(),
    connections: broker.listConnections('user:test'),
    output: execution.output,
    receipt: execution.receipt,
    evidence: execution.evidence
  });
  assert.equal(publicState.includes(token), false);
  assert.equal(publicState.includes('credential_ref'), false);

  await assert.rejects(
    task.execute({
      service: 'github',
      action: 'repo.read',
      context: { repository: 'acme/other' }
    }),
    (error) => {
      assert.ok(error instanceof AuthorityApprovalRequiredError);
      assert.equal(error.code, 'authority_delta_required');
      assert.match(task.explain(error).summary, /acme\/private/);
      assert.match(task.explain(error).summary, /acme\/other/);
      return true;
    }
  );

  assert.equal(requests.length, 1, 'unrelated repository must be blocked before provider execution');
});

test('default account resolves only when exactly one active service connection exists', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'alice',
    auth_kind: 'github-token',
    credential: { access_token: 'alice-token' }
  });

  assert.equal(
    broker.getConnection({ principal_id: 'user:test', service: 'github' })?.account_id,
    'alice'
  );

  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'bob',
    auth_kind: 'github-token',
    credential: { access_token: 'bob-token' }
  });

  assert.equal(
    broker.getConnection({ principal_id: 'user:test', service: 'github' }),
    null,
    'ambiguous default account must fail closed'
  );
  assert.equal(
    broker.getConnection({ principal_id: 'user:test', service: 'github', account_id: 'alice' })?.account_id,
    'alice'
  );
});

test('disconnect default resolves and removes the sole non-default connection', () => {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'verified-login',
    auth_kind: 'github-token',
    credential: { access_token: 'secret' }
  });

  const disconnected = broker.disconnect({ principal_id: 'user:test', service: 'github' });
  assert.equal(disconnected.account_id, 'verified-login');
  assert.equal(disconnected.status, 'revoked');
  assert.equal(broker.getConnection({ principal_id: 'user:test', service: 'github' })?.status, undefined);
});

test('task.execute reports connection_required without invoking provider fetch', async () => {
  let fetches = 0;
  const broker = new CredentialBroker();
  const runtime = connectedRuntime({
    broker,
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('must not run');
    }
  });
  const task = repoTask(runtime);

  await assert.rejects(
    task.execute({
      service: 'github',
      action: 'repo.read',
      context: { repository: 'acme/private' }
    }),
    (error) => {
      assert.ok(error instanceof AuthorityDeniedError);
      assert.equal(error.code, 'connection_required');
      return true;
    }
  );

  assert.equal(fetches, 0);
});

test('task.execute requires an executing runtime', async () => {
  const task = createTask({
    principal: 'user:test',
    agent: 'agent:test',
    request: 'Inspect one repository',
    permissions: { github: { allow: ['repo.read'] } },
    authority: { repository: { kind: 'github.repository', value: 'acme/private' } },
    bindings: [
      { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
    ]
  });

  await assert.rejects(
    task.execute({ service: 'github', action: 'repo.read', context: { repository: 'acme/private' } }),
    /does not support connected provider execution/
  );
});
