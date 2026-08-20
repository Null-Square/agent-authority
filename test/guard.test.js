import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createAuthorityGuard
} from '../src/guard.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:guard-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'Read one approved repository and require approval for writes',
    resources: [{
      service: 'github',
      allow: ['repo.read', 'repo.contents.write'],
      deny: ['repo.delete'],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }],
    approvals: [{
      match: { service: 'github', action: 'repo.contents.write' },
      required: true,
      reason: 'repository writes require a human'
    }]
  };
}

test('guard executes an allowed effect and returns a receipt', async () => {
  let calls = 0;
  const guard = createAuthorityGuard({ mission: mission(), runtime: new AuthorityRuntime() });
  const result = await guard.run({
    service: 'github',
    action: 'repo.read',
    context: { repository: 'Null-Square/agent-authority' }
  }, async () => {
    calls += 1;
    return { ok: true };
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.output, { ok: true });
  assert.equal(result.result.decision, 'allow');
  assert.equal(result.receipt.mission_id, 'mission:guard-test');
});

test('guard never executes effect when resource is outside mission', async () => {
  let calls = 0;
  const guard = createAuthorityGuard({ mission: mission(), runtime: new AuthorityRuntime() });

  await assert.rejects(
    guard.run({
      service: 'github',
      action: 'repo.read',
      context: { repository: 'someone/other' }
    }, async () => { calls += 1; }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'resource_constraint_mismatch'
  );
  assert.equal(calls, 0);
});

test('guard never executes effect when action is explicitly denied', async () => {
  let calls = 0;
  const guard = createAuthorityGuard({ mission: mission(), runtime: new AuthorityRuntime() });

  await assert.rejects(
    guard.run({
      service: 'github',
      action: 'repo.delete',
      context: { repository: 'Null-Square/agent-authority' }
    }, async () => { calls += 1; }),
    (error) => error instanceof AuthorityDeniedError && error.code === 'explicit_deny'
  );
  assert.equal(calls, 0);
});

test('guard surfaces approval requirement without executing effect', async () => {
  let calls = 0;
  const guard = createAuthorityGuard({ mission: mission(), runtime: new AuthorityRuntime() });

  await assert.rejects(
    guard.run({
      service: 'github',
      action: 'repo.contents.write',
      context: { repository: 'Null-Square/agent-authority' }
    }, async () => { calls += 1; }),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'approval_required'
  );
  assert.equal(calls, 0);
});

test('guard exposes decisions to host observability without changing enforcement', async () => {
  const decisions = [];
  const guard = createAuthorityGuard({
    mission: mission(),
    runtime: new AuthorityRuntime(),
    onDecision: (evaluation, request) => decisions.push({ decision: evaluation.result.decision, action: request.action })
  });

  await guard.run({
    service: 'github',
    action: 'repo.read',
    context: { repository: 'Null-Square/agent-authority' }
  }, async () => 'ok');

  assert.deepEqual(decisions, [{ decision: 'allow', action: 'repo.read' }]);
});
