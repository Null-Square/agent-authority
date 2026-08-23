import assert from 'node:assert/strict';

import { AdapterRegistry } from '@nullsquare/agent-authority';
import { CredentialBroker } from '@nullsquare/agent-authority/connections';
import { ExecutingAuthorityRuntime } from '@nullsquare/agent-authority/execution';
import { AuthorityApprovalRequiredError } from '@nullsquare/agent-authority/guard';
import { createGitHubProviderAdapter } from '@nullsquare/agent-authority/providers/github';
import { createRuntimeEnvironment } from '@nullsquare/agent-authority/runtime-env';
import { createTask } from '@nullsquare/agent-authority/task';

assert.equal(typeof createRuntimeEnvironment, 'function');

const broker = new CredentialBroker();
broker.connect({
  principal_id: 'user:consumer',
  service: 'github',
  account_id: 'named-account',
  auth_kind: 'github-token',
  credential: { access_token: 'registry-smoke-secret' }
});

let calls = 0;
const adapter = createGitHubProviderAdapter({
  broker,
  fetchImpl: async () => {
    calls += 1;
    return new Response(JSON.stringify({
      full_name: 'acme/private',
      private: true,
      html_url: 'https://github.com/acme/private'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
});
const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });

const task = createTask({
  principal: 'user:consumer',
  agent: 'agent:consumer',
  request: 'Inspect one repository',
  permissions: { github: { allow: ['repo.read'], constraints: {} } },
  authority: { repository: { kind: 'github.repository', value: 'acme/private' } },
  bindings: [
    { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
  ],
  runtime
});

const allowed = await task.execute({
  service: 'github',
  action: 'repo.read',
  context: { repository: 'acme/private' }
});
assert.equal(allowed.output.body.full_name, 'acme/private');
assert.equal(calls, 1);

await assert.rejects(
  task.execute({ service: 'github', action: 'repo.read', context: { repository: 'acme/other' } }),
  (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
);
assert.equal(calls, 1);
assert.equal(JSON.stringify({
  mission: task.mission,
  authorities: task.authorities(),
  connections: broker.listConnections('user:consumer'),
  output: allowed.output
}).includes('registry-smoke-secret'), false);

console.log('PASS -> packed connected-task API keeps credential broker-internal and blocks unrelated provider execution');
