import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import { createTaskLease } from '../src/task-lease.js';
import { createTaskLeaseGuard } from '../src/guard.js';
import { withAiSdkAuthority } from '../src/integrations/ai-sdk.js';

function setup() {
  const mission = {
    version: '0.1',
    mission_id: 'mission:ai-sdk-wrapper',
    principal: { id: 'user:test' },
    agent: { id: 'agent:ai-sdk' },
    objective: 'Comment on the task-authorized issue',
    resources: [{
      service: 'github',
      allow: ['issue.comment'],
      deny: ['issue.delete'],
      constraints: {}
    }],
    constraints: {}
  };

  const lease = createTaskLease({
    mission,
    roots: [{ fact_id: 'fact:issue', kind: 'github.issue', value: 9 }],
    bindings: [{
      service: 'github',
      action: 'issue.comment',
      context_field: 'issue_number',
      fact_id: 'fact:issue'
    }]
  });

  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  return { lease, guard };
}

test('AI SDK wrapper preserves tool metadata and executes authorized tool exactly once', async () => {
  const { guard } = setup();
  let executions = 0;
  let observedReceipt = null;
  const schema = { parse: (value) => value };

  const wrapped = withAiSdkAuthority({
    guard,
    tools: {
      commentIssue: {
        tool: {
          description: 'Comment on an issue',
          inputSchema: schema,
          execute: async ({ issueNumber, body }) => {
            executions += 1;
            return { issueNumber, body };
          }
        },
        request: ({ issueNumber }) => ({
          service: 'github',
          action: 'issue.comment',
          context: { issue_number: issueNumber }
        }),
        onAuthorizedResult: ({ receipt }) => { observedReceipt = receipt; }
      }
    }
  });

  assert.equal(wrapped.commentIssue.description, 'Comment on an issue');
  assert.equal(wrapped.commentIssue.inputSchema, schema);

  const output = await wrapped.commentIssue.execute({ issueNumber: 9, body: 'hello' }, { toolCallId: 'call-1' });
  assert.deepEqual(output, { issueNumber: 9, body: 'hello' });
  assert.equal(executions, 1);
  assert.equal(observedReceipt.decision, 'allow');
});

test('AI SDK wrapper blocks an authority delta before original execute runs', async () => {
  const { guard } = setup();
  let executions = 0;

  const wrapped = withAiSdkAuthority({
    guard,
    tools: {
      commentIssue: {
        tool: {
          execute: async () => { executions += 1; return 'should not happen'; }
        },
        request: ({ issueNumber }) => ({
          service: 'github',
          action: 'issue.comment',
          context: { issue_number: issueNumber }
        })
      }
    }
  });

  await assert.rejects(
    () => wrapped.commentIssue.execute({ issueNumber: 1 }),
    (error) => error.code === 'authority_delta_required'
  );
  assert.equal(executions, 0);
});

test('AI SDK wrapper blocks execution after Task Lease completion', async () => {
  const { lease, guard } = setup();
  let executions = 0;

  const wrapped = withAiSdkAuthority({
    guard,
    tools: {
      commentIssue: {
        tool: { execute: async () => { executions += 1; } },
        request: ({ issueNumber }) => ({
          service: 'github',
          action: 'issue.comment',
          context: { issue_number: issueNumber }
        })
      }
    }
  });

  lease.complete('done');
  await assert.rejects(
    () => wrapped.commentIssue.execute({ issueNumber: 9 }),
    (error) => error.code === 'task_lease_completed'
  );
  assert.equal(executions, 0);
});
