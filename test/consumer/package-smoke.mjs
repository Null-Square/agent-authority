import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createExecutionEvidence } from '@nullsquare/agent-authority/authority-evidence';
import {
  createDurableTaskLeaseSession,
  DurableTaskLeaseSession
} from '@nullsquare/agent-authority/durable-task-lease';
import { ExecutingAuthorityRuntime } from '@nullsquare/agent-authority/execution';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '@nullsquare/agent-authority/guard';
import { protectAiSdkTools } from '@nullsquare/agent-authority/integrations/ai-sdk';
import { MissionMcpGateway } from '@nullsquare/agent-authority/mcp-gateway';
import { githubIssueListSelectedNumberAuthorityExtractor } from '@nullsquare/agent-authority/providers/github';
import { gmailThreadSenderAuthorityExtractor } from '@nullsquare/agent-authority/providers/google';
import { JsonFileTaskLeaseStore } from '@nullsquare/agent-authority/storage';
import { createTask } from '@nullsquare/agent-authority/task';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';

assert.equal(typeof createExecutionEvidence, 'function');
assert.equal(typeof gmailThreadSenderAuthorityExtractor, 'function');
assert.equal(typeof githubIssueListSelectedNumberAuthorityExtractor, 'function');
assert.equal(typeof ExecutingAuthorityRuntime.prototype.executeTaskLease, 'function');
assert.equal(typeof MissionMcpGateway, 'function');
assert.equal(typeof DurableTaskLeaseSession, 'function');
assert.equal(typeof JsonFileTaskLeaseStore, 'function');
assert.equal(typeof createTask, 'function');

const mission = {
  version: '0.1',
  mission_id: 'mission:packed-consumer-smoke',
  principal: { id: 'user:consumer' },
  agent: { id: 'agent:consumer' },
  objective: 'Modify only the resource approved for this task',
  resources: [{
    service: 'demo',
    allow: ['item.write'],
    deny: [],
    constraints: {}
  }],
  constraints: {}
};

const lease = createTaskLease({
  mission,
  request: 'Update item alpha',
  roots: [{ fact_id: 'fact:item', kind: 'demo.item', value: 'alpha' }],
  bindings: [{
    service: 'demo',
    action: 'item.write',
    context_field: 'item',
    fact_id: 'fact:item'
  }]
});

const home = mkdtempSync(join(tmpdir(), 'agent-authority-packed-consumer-'));
try {
  const store = new JsonFileTaskLeaseStore({
    dir: join(home, 'state', 'task-leases'),
    keyPath: join(home, 'vault', 'master.key')
  });
  const session = createDurableTaskLeaseSession({ store, lease });
  assert.ok(session instanceof DurableTaskLeaseSession);

  const guard = createTaskLeaseGuard({ lease: session, runtime: new AuthorityRuntime() });
  let effects = 0;

  const originalTools = {
    saveItem: {
      description: 'Save one item',
      inputSchema: { type: 'object' },
      async execute(input) {
        effects += 1;
        return { saved: input.item };
      }
    }
  };

  const tools = protectAiSdkTools({
    tools: originalTools,
    guard,
    requests: {
      saveItem: ({ item }) => ({
        service: 'demo',
        action: 'item.write',
        context: { item }
      })
    }
  });

  assert.equal(tools.saveItem.description, originalTools.saveItem.description);
  assert.equal(tools.saveItem.inputSchema, originalTools.saveItem.inputSchema);

  const allowed = await tools.saveItem.execute({ item: 'alpha' }, {});
  assert.deepEqual(allowed, { saved: 'alpha' });
  assert.equal(effects, 1);

  await assert.rejects(
    () => tools.saveItem.execute({ item: 'beta' }, {}),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
  );
  assert.equal(effects, 1);

  session.complete('consumer smoke complete');
  await assert.rejects(
    () => tools.saveItem.execute({ item: 'alpha' }, {}),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );
  assert.equal(effects, 1);

  const productTask = createTask({
    principal: 'user:consumer',
    agent: 'agent:consumer',
    request: 'Update only item alpha through the task-first API',
    permissions: {
      demo: { allow: ['item.write'], constraints: {} }
    },
    authority: {
      item: { kind: 'demo.item', value: 'alpha' }
    },
    bindings: [
      { service: 'demo', action: 'item.write', field: 'item', authority: 'item' }
    ],
    store: new JsonFileTaskLeaseStore({
      dir: join(home, 'state', 'product-task-leases'),
      keyPath: join(home, 'vault', 'master.key')
    })
  });

  let productEffects = 0;
  const productAllowed = await productTask.run(
    { service: 'demo', action: 'item.write', context: { item: 'alpha' } },
    async () => {
      productEffects += 1;
      return { saved: 'alpha' };
    }
  );
  assert.deepEqual(productAllowed.output, { saved: 'alpha' });

  let productStepUp;
  await assert.rejects(
    () => productTask.run(
      { service: 'demo', action: 'item.write', context: { item: 'beta' } },
      async () => {
        productEffects += 1;
        return { saved: 'beta' };
      }
    ),
    (error) => {
      productStepUp = error;
      return error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required';
    }
  );
  assert.equal(productEffects, 1);
  assert.equal(productTask.explain(productStepUp).established_authority.value, 'alpha');
  productTask.complete('task-first consumer smoke complete');
  assert.equal(productTask.status, 'completed');

  console.log('PASS -> packed package imported only through public exports');
  console.log('PASS -> task-first public API is usable with explicit permissions and durable local state');
  console.log('PASS -> durable Task Lease store/session public exports are usable');
  console.log('PASS -> evidence, provider extractor and transport-invariance exports are present');
  console.log('PASS -> authorized effects execute while unrelated and post-completion effects execute zero times');
} finally {
  rmSync(home, { recursive: true, force: true });
}
