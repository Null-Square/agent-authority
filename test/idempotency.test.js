import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdapterRegistry } from '../src/index.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';
import { JsonFileExecutionGuard } from '../src/idempotency.js';

const mission = {
  version: '0.1',
  mission_id: 'mission:idempotency',
  principal: { id: 'user:test' },
  agent: { id: 'agent:test' },
  objective: 'mutate safely',
  resources: [{ service: 'test', allow: ['item.create'], deny: [] }]
};

function request(key = 'key-1', name = 'one') {
  return { service: 'test', action: 'item.create', idempotency_key: key, context: { name } };
}

test('execution guard blocks duplicate and conflicting idempotency keys', () => {
  const home = mkdtempSync(join(tmpdir(), 'aa-idempotency-'));
  try {
    const guard = new JsonFileExecutionGuard(join(home, 'executions.json'));
    guard.begin({ mission, request: request() });
    guard.complete({ mission, request: request(), receipt_id: 'receipt:1' });
    assert.throws(() => guard.begin({ mission, request: request() }), (error) => error.code === 'duplicate_execution');
    assert.throws(() => guard.begin({ mission, request: request('key-1', 'changed') }), (error) => error.code === 'idempotency_conflict');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('mutating runtime requires idempotency key and executes a key only once', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aa-idempotency-runtime-'));
  try {
    const executions = new JsonFileExecutionGuard(join(home, 'executions.json'));
    let calls = 0;
    const adapter = {
      kind: 'mutation-test',
      supports: (service) => service === 'test',
      isMutation: () => true,
      async prepare() { return { ready: true }; },
      async execute() { calls += 1; return { ok: true, calls }; }
    };
    const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter), executions });

    const missing = await runtime.execute(mission, { service: 'test', action: 'item.create', context: { name: 'x' } });
    assert.equal(missing.result.code, 'idempotency_key_required');
    assert.equal(calls, 0);

    const first = await runtime.execute(mission, request());
    assert.equal(first.result.decision, 'allow');
    assert.equal(calls, 1);

    const duplicate = await runtime.execute(mission, request());
    assert.equal(duplicate.result.code, 'duplicate_execution');
    assert.equal(calls, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('provider failure leaves mutation in uncertain state and blocks retry', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aa-idempotency-failure-'));
  try {
    const executions = new JsonFileExecutionGuard(join(home, 'executions.json'));
    let calls = 0;
    const adapter = {
      kind: 'mutation-test',
      supports: (service) => service === 'test',
      isMutation: () => true,
      async prepare() { return { ready: true }; },
      async execute() {
        calls += 1;
        const error = new Error('transport failed after dispatch');
        error.code = 'transport_error';
        throw error;
      }
    };
    const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter), executions });
    await assert.rejects(() => runtime.execute(mission, request()), /transport failed/);
    assert.equal(calls, 1);
    assert.equal(executions.list()[0].status, 'uncertain');

    const retry = await runtime.execute(mission, request());
    assert.equal(retry.result.code, 'execution_already_started');
    assert.equal(calls, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
