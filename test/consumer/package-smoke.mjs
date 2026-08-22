import assert from 'node:assert/strict';
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createExecutionEvidence } from '@nullsquare/agent-authority/authority-evidence';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '@nullsquare/agent-authority/guard';
import { protectAiSdkTools } from '@nullsquare/agent-authority/integrations/ai-sdk';
import { githubIssueListSelectedNumberAuthorityExtractor } from '@nullsquare/agent-authority/providers/github';
import { gmailThreadSenderAuthorityExtractor } from '@nullsquare/agent-authority/providers/google';
import { createTaskLease } from '@nullsquare/agent-authority/task-lease';

assert.equal(typeof createExecutionEvidence, 'function');
assert.equal(typeof gmailThreadSenderAuthorityExtractor, 'function');
assert.equal(typeof githubIssueListSelectedNumberAuthorityExtractor, 'function');

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

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
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

lease.complete('consumer smoke complete');
await assert.rejects(
  () => tools.saveItem.execute({ item: 'alpha' }, {}),
  (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
);
assert.equal(effects, 1);

console.log('PASS -> packed package imported only through public exports');
console.log('PASS -> authority evidence plus Google and GitHub extractor exports are present');
console.log('PASS -> authorized effect executed exactly once');
console.log('PASS -> unrelated and post-completion effects executed zero times');
