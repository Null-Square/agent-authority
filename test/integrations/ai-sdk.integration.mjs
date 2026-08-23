import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { AuthorityRuntime } from '../../src/index.js';
import {
  createTaskLeaseGuard,
  AuthorityApprovalRequiredError,
  AuthorityDeniedError
} from '../../src/guard.js';
import { protectAiSdkTools, UnmappedAiSdkToolError } from '../../src/integrations/ai-sdk.js';
import { createTaskLease } from '../../src/task-lease.js';

function usage() {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 10, text: 10, reasoning: 0 }
  };
}

function buildLease() {
  const mission = {
    version: '0.1',
    mission_id: 'mission:ai-sdk-integration',
    principal: { id: 'user:test' },
    agent: { id: 'agent:vercel-ai-sdk' },
    objective: 'Comment only on the task-bound issue',
    resources: [{
      service: 'github',
      allow: ['issue.comment'],
      deny: ['issue.close'],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }],
    constraints: {}
  };

  return createTaskLease({
    mission,
    roots: [{ fact_id: 'fact:issue', kind: 'github.issue', value: 9 }],
    bindings: [{
      service: 'github',
      action: 'issue.comment',
      context_field: 'issue_number',
      fact_id: 'fact:issue'
    }]
  });
}

function buildTools({ guard, effects }) {
  const tools = {
    commentIssue: tool({
      description: 'Comment on a GitHub issue',
      inputSchema: z.object({
        repository: z.string(),
        issue_number: z.number(),
        body: z.string()
      }),
      execute: async ({ repository, issue_number, body }) => {
        effects.push({ repository, issue_number, body });
        return { ok: true, issue_number };
      }
    })
  };

  return protectAiSdkTools({
    tools,
    guard,
    requests: {
      commentIssue: ({ repository, issue_number }) => ({
        service: 'github',
        action: 'issue.comment',
        context: { repository, issue_number }
      })
    }
  });
}

function oneToolCallModel({ toolName, input, callId = 'call-1' }) {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          warnings: [],
          usage: usage(),
          finishReason: { unified: 'tool-calls', raw: undefined },
          content: [{
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: callId,
            toolName,
            input: JSON.stringify(input)
          }]
        };
      }
      return {
        warnings: [],
        usage: usage(),
        finishReason: { unified: 'stop', raw: undefined },
        content: [{ type: 'text', text: 'done' }]
      };
    }
  });
}

function toolErrors(result) {
  return result.steps.flatMap((step) =>
    step.content.filter((part) => part.type === 'tool-error')
  );
}

function assertHarnessToolError(result, ErrorType, code) {
  const errors = toolErrors(result);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].error instanceof ErrorType);
  assert.equal(errors[0].error.code, code);
}

test('current AI SDK ToolLoopAgent executes an authorized tool through Agent Authority', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  const effects = [];
  const tools = buildTools({ guard, effects });

  const agent = new ToolLoopAgent({
    tools,
    model: oneToolCallModel({
      toolName: 'commentIssue',
      input: {
        repository: 'Null-Square/agent-authority',
        issue_number: 9,
        body: 'framework validation'
      }
    })
  });
  const result = await agent.generate({ prompt: 'Comment on the task issue.' });

  assert.equal(result.text, 'done');
  assert.equal(toolErrors(result).length, 0);
  assert.deepEqual(effects, [{
    repository: 'Null-Square/agent-authority',
    issue_number: 9,
    body: 'framework validation'
  }]);
});

test('ToolLoopAgent cannot execute an unrelated resource through the protected tool set', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  const effects = [];
  const tools = buildTools({ guard, effects });
  const agent = new ToolLoopAgent({
    tools,
    model: oneToolCallModel({
      toolName: 'commentIssue',
      input: {
        repository: 'Null-Square/agent-authority',
        issue_number: 1,
        body: 'must not execute'
      },
      callId: 'blocked-resource'
    })
  });

  const result = await agent.generate({ prompt: 'Comment on issue 1.' });
  assert.equal(result.text, 'done');
  assertHarnessToolError(result, AuthorityApprovalRequiredError, 'authority_delta_required');
  assert.equal(effects.length, 0);
});

test('ToolLoopAgent cannot execute an unmapped executable tool through the protected tool set', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  let effects = 0;
  const tools = protectAiSdkTools({
    guard,
    tools: {
      dangerous: tool({
        description: 'An executable tool with no authority mapping',
        inputSchema: z.object({}),
        execute: async () => { effects += 1; return 'ran'; }
      })
    }
  });
  const agent = new ToolLoopAgent({
    tools,
    model: oneToolCallModel({
      toolName: 'dangerous',
      input: {},
      callId: 'unmapped-through-agent'
    })
  });

  const result = await agent.generate({ prompt: 'Run the dangerous tool.' });
  assert.equal(result.text, 'done');
  assertHarnessToolError(result, UnmappedAiSdkToolError, 'ai_sdk_tool_unmapped');
  assert.equal(effects, 0);
});

test('ToolLoopAgent cannot reuse a protected tool after Task Lease completion', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  const effects = [];
  const tools = buildTools({ guard, effects });
  lease.complete('harness proof complete');

  const agent = new ToolLoopAgent({
    tools,
    model: oneToolCallModel({
      toolName: 'commentIssue',
      input: {
        repository: 'Null-Square/agent-authority',
        issue_number: 9,
        body: 'must not execute after completion'
      },
      callId: 'completed-lease'
    })
  });

  const result = await agent.generate({ prompt: 'Comment on the task issue again.' });
  assert.equal(result.text, 'done');
  assertHarnessToolError(result, AuthorityDeniedError, 'task_lease_completed');
  assert.equal(effects.length, 0);
});

test('AI SDK protected tool direct execution also cannot silently expand to another resource', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  const effects = [];
  const tools = buildTools({ guard, effects });

  await assert.rejects(
    () => tools.commentIssue.execute({
      repository: 'Null-Square/agent-authority',
      issue_number: 1,
      body: 'must not execute'
    }, { toolCallId: 'blocked-call', messages: [] }),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
  );

  assert.equal(effects.length, 0);
});

test('unmapped executable AI SDK tools fail closed on direct execution too', async () => {
  const lease = buildLease();
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  let effects = 0;
  const tools = protectAiSdkTools({
    guard,
    tools: {
      dangerous: tool({
        description: 'An executable tool with no authority mapping',
        inputSchema: z.object({}),
        execute: async () => { effects += 1; return 'ran'; }
      })
    }
  });

  await assert.rejects(
    () => tools.dangerous.execute({}, { toolCallId: 'unmapped-call', messages: [] }),
    (error) => error instanceof UnmappedAiSdkToolError && error.code === 'ai_sdk_tool_unmapped'
  );
  assert.equal(effects, 0);
});
