import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTask } from '../src/task.js';
import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import { JsonFileTaskLeaseStore } from '../src/storage.js';

function selectedIssueExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'issue.list') {
    const error = new Error('wrong operation');
    error.code = 'trusted_extractor_operation_mismatch';
    throw error;
  }
  if (!Number.isSafeInteger(output?.selected_issue_number) || output.selected_issue_number < 1) {
    const error = new Error('invalid selected issue');
    error.code = 'trusted_extractor_output_invalid';
    throw error;
  }
  return {
    extractor_id: 'test.github.selected-issue.v1',
    selector: 'output.selected_issue_number'
  };
}

function taskOptions(overrides = {}) {
  return {
    principal: 'user:product-test',
    agent: 'agent:product-test',
    request: 'Find the selected issue and comment only on that issue',
    permissions: {
      github: {
        allow: ['issue.list', 'issue.comment'],
        deny: ['issue.close', 'repo.delete'],
        constraints: { repository: ['Null-Square/agent-authority'] }
      }
    },
    authority: {
      repository: {
        kind: 'github.repository',
        value: 'Null-Square/agent-authority'
      }
    },
    bindings: [
      { service: 'github', action: 'issue.list', field: 'repository', authority: 'repository' },
      { service: 'github', action: 'issue.comment', field: 'repository', authority: 'repository' }
    ],
    ...overrides
  };
}

test('task-first API turns guarded output into named downstream authority', async () => {
  const task = createTask(taskOptions());

  assert.match(task.id, /^lease:/);
  assert.equal(task.mission.objective, 'Find the selected issue and comment only on that issue');
  assert.equal(task.authority('repository').value, 'Null-Square/agent-authority');

  let reads = 0;
  const discovery = await task.run({
    service: 'github',
    action: 'issue.list',
    context: { repository: 'Null-Square/agent-authority' }
  }, async () => {
    reads += 1;
    return { selected_issue_number: 42, selected_issue_title: 'Fix task-scoped authorization' };
  });

  const issue = task.authorityFrom(discovery, {
    name: 'issue',
    kind: 'github.issue.number',
    from: 'repository',
    extractor: selectedIssueExtractor
  });
  assert.equal(issue.value, 42);
  assert.equal(issue.provenance.derivation_mode, 'execution-evidence-v1');

  task.bind({
    service: 'github',
    action: 'issue.comment',
    field: 'issue_number',
    authority: 'issue'
  });

  let writes = 0;
  const allowed = await task.run({
    service: 'github',
    action: 'issue.comment',
    context: {
      repository: 'Null-Square/agent-authority',
      issue_number: 42,
      body: 'Task-scoped comment'
    }
  }, async () => {
    writes += 1;
    return { comment_id: 1001 };
  });
  assert.equal(allowed.output.comment_id, 1001);
  assert.equal(reads, 1);
  assert.equal(writes, 1);

  let stepUp;
  await assert.rejects(
    () => task.run({
      service: 'github',
      action: 'issue.comment',
      context: {
        repository: 'Null-Square/agent-authority',
        issue_number: 7,
        body: 'Must not execute'
      }
    }, async () => {
      writes += 1;
      return { comment_id: 1002 };
    }),
    (error) => {
      stepUp = error;
      return error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required';
    }
  );
  assert.equal(writes, 1);

  const explanation = task.explain(stepUp);
  assert.equal(explanation.decision, 'require_approval');
  assert.equal(explanation.field, 'issue_number');
  assert.equal(explanation.established_authority.value, 42);
  assert.equal(explanation.requested_value, 7);
  assert.match(explanation.summary, /42/);
  assert.match(explanation.summary, /7/);

  task.complete('issue handled');
  await assert.rejects(
    () => task.run({
      service: 'github',
      action: 'issue.comment',
      context: { repository: 'Null-Square/agent-authority', issue_number: 42, body: 'Too late' }
    }, async () => {
      writes += 1;
      return { comment_id: 1003 };
    }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );
  assert.equal(writes, 1);
});

test('task-first API can make the same developer flow durable without changing calls', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agent-authority-product-task-'));
  try {
    const store = new JsonFileTaskLeaseStore({
      dir: join(home, 'leases'),
      keyPath: join(home, 'master.key')
    });
    const task = createTask(taskOptions({ store }));

    const discovery = await task.run({
      service: 'github',
      action: 'issue.list',
      context: { repository: 'Null-Square/agent-authority' }
    }, async () => ({ selected_issue_number: 42 }));

    task.authorityFrom(discovery, {
      name: 'issue',
      kind: 'github.issue.number',
      from: 'repository',
      extractor: selectedIssueExtractor
    });
    task.bind({ service: 'github', action: 'issue.comment', field: 'issue_number', authority: 'issue' });

    const before = task.id;
    task.complete('durable product test complete');
    assert.equal(task.id, before);
    assert.equal(task.status, 'completed');
    assert.equal(store.load({ mission: task.mission, lease_id: task.id }).status, 'completed');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('task shorthand stays explicit about service permissions', () => {
  assert.throws(
    () => createTask({
      principal: 'user:test',
      agent: 'agent:test',
      request: 'Do anything',
      permissions: {}
    }),
    /permissions must contain at least one service/
  );

  assert.throws(
    () => createTask({
      principal: 'user:test',
      agent: 'agent:test',
      request: 'Do anything',
      permissions: { github: { allow: [] } }
    }),
    /must contain at least one action/
  );
});
