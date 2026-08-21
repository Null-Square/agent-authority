import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdapterRegistry } from '../src/index.js';
import { ExecutingAuthorityRuntime, InMemoryUsageLedger } from '../src/execution.js';
import { JsonFileApprovalStore } from '../src/approvals.js';

function mission({ budget } = {}) {
  return {
    version: '0.1',
    mission_id: 'mission:approval',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'write approved change',
    resources: [{ service: 'github', allow: ['repo.write'], deny: [] }],
    constraints: budget ? { budget } : {},
    approvals: [{ match: { service: 'github', action: 'repo.write' }, required: true, reason: 'write needs human approval' }]
  };
}

function runtimeFixture({ connected = true, budget } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aa-exec-approval-'));
  const approvals = new JsonFileApprovalStore(join(home, 'approvals.json'));
  let executions = 0;
  const adapter = {
    kind: 'test',
    supports: (service) => service === 'github',
    async prepare() { return connected ? { connection_id: 'test' } : { connection_required: true }; },
    async execute() { executions += 1; return { ok: true, executions }; }
  };
  const adapters = new AdapterRegistry().register(adapter);
  const runtime = new ExecutingAuthorityRuntime({ adapters, approvals, usage: new InMemoryUsageLedger() });
  return { home, approvals, runtime, getExecutions: () => executions, mission: mission({ budget }) };
}

test('does not execute side effect before approval', async () => {
  const f = runtimeFixture();
  try {
    const request = { service: 'github', action: 'repo.write', context: { repository: 'Null-Square/agent-authority' } };
    const first = await f.runtime.execute(f.mission, request);
    assert.equal(first.result.decision, 'require_approval');
    assert.equal(first.approval.status, 'pending');
    assert.equal(f.getExecutions(), 0);
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('approved request executes once and replay is denied', async () => {
  const f = runtimeFixture();
  try {
    const request = { service: 'github', action: 'repo.write', context: { repository: 'Null-Square/agent-authority' } };
    const first = await f.runtime.execute(f.mission, request);
    f.approvals.approve(first.approval.approval_id, { principal_id: 'user:test' });
    const approvedRequest = { ...request, approval_id: first.approval.approval_id };
    const second = await f.runtime.execute(f.mission, approvedRequest);
    assert.equal(second.result.decision, 'allow');
    assert.equal(second.result.approval_id, first.approval.approval_id);
    assert.equal(f.getExecutions(), 1);

    const replay = await f.runtime.execute(f.mission, approvedRequest);
    assert.equal(replay.result.decision, 'deny');
    assert.equal(replay.result.code, 'approval_replayed');
    assert.equal(f.getExecutions(), 1);
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('missing connection is reported before approval is created', async () => {
  const f = runtimeFixture({ connected: false });
  try {
    const request = { service: 'github', action: 'repo.write', context: { repository: 'Null-Square/agent-authority' } };
    const result = await f.runtime.execute(f.mission, request);
    assert.equal(result.result.code, 'connection_required');
    assert.equal(f.approvals.list().length, 0);
    assert.equal(f.getExecutions(), 0);
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});

test('budget violation is reported before approval is created', async () => {
  const f = runtimeFixture({ budget: { currency: 'USD', amount: 10 } });
  try {
    const request = { service: 'github', action: 'repo.write', context: { repository: 'Null-Square/agent-authority', amount: 11, currency: 'USD' } };
    const result = await f.runtime.execute(f.mission, request);
    assert.equal(result.result.code, 'budget_exceeded');
    assert.equal(f.approvals.list().length, 0);
    assert.equal(f.getExecutions(), 0);
  } finally { rmSync(f.home, { recursive: true, force: true }); }
});
