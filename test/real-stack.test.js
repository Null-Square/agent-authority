import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:real-stack-network',
    principal: { id: 'user:test' },
    agent: { id: 'agent:ordinary-node-app' },
    objective: 'Read exactly one task-authorized provider resource',
    resources: [{
      service: 'provider',
      allow: ['resource.read'],
      deny: [],
      constraints: {}
    }],
    constraints: {}
  };
}

async function withProviderServer(run) {
  const calls = [];
  const server = createServer((req, res) => {
    calls.push({ path: req.url, authorization: req.headers.authorization || null });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, calls });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('Task Lease prevents ambient provider authority from reaching an unrelated network resource', async () => {
  await withProviderServer(async ({ baseUrl, calls }) => {
    const lease = createTaskLease({
      mission: mission(),
      request: 'Read resource alpha only',
      roots: [{
        fact_id: 'fact:resource',
        kind: 'provider.resource',
        value: 'alpha'
      }],
      bindings: [{
        service: 'provider',
        action: 'resource.read',
        context_field: 'resource',
        fact_id: 'fact:resource'
      }]
    });

    const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
    const broadCredential = 'broad-provider-token';

    const providerRead = (resource) => guard.run({
      service: 'provider',
      action: 'resource.read',
      context: { resource }
    }, async () => {
      const response = await fetch(`${baseUrl}/resource/${resource}`, {
        headers: { authorization: `Bearer ${broadCredential}` }
      });
      return response.json();
    });

    const allowed = await providerRead('alpha');
    assert.equal(allowed.output.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/resource/alpha');
    assert.equal(calls[0].authorization, 'Bearer broad-provider-token');

    await assert.rejects(
      () => providerRead('beta'),
      (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
    );
    assert.equal(calls.length, 1, 'unrelated resource must be blocked before any network request');

    lease.complete('authorized resource read completed');
    await assert.rejects(
      () => providerRead('alpha'),
      (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
    );
    assert.equal(calls.length, 1, 'completed task must not reach provider even though credential still exists');
  });
});
