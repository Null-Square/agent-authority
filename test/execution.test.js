import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterRegistry } from '../src/index.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';

const mission = {
  version: '0.1',
  mission_id: 'mission:budget',
  principal: { id: 'user:test' },
  agent: { id: 'agent:test' },
  objective: 'spend within budget',
  resources: [{ service: 'shop', allow: ['purchase'], deny: [] }],
  constraints: { budget: { currency: 'USD', amount: 100 }, max_delegation_depth: 0 }
};

function shopAdapter() {
  return {
    kind: 'test-shop',
    supports(service) { return service === 'shop'; },
    async execute({ request }) {
      return { charged: Number(request.context.amount) };
    }
  };
}

test('cumulative budget is recorded after successful execution', async () => {
  const runtime = new ExecutingAuthorityRuntime({
    adapters: new AdapterRegistry().register(shopAdapter())
  });

  const first = await runtime.execute(mission, {
    service: 'shop', action: 'purchase', context: { amount: 40, currency: 'USD' }
  });
  const second = await runtime.execute(mission, {
    service: 'shop', action: 'purchase', context: { amount: 50, currency: 'USD' }
  });

  assert.equal(first.result.decision, 'allow');
  assert.equal(first.usage.spent, 40);
  assert.equal(second.result.decision, 'allow');
  assert.equal(second.usage.spent, 90);
  assert.equal(second.usage.remaining, 10);
});

test('cumulative budget denies later action before provider execution', async () => {
  let calls = 0;
  const adapter = {
    kind: 'test-shop',
    supports(service) { return service === 'shop'; },
    async execute() { calls += 1; return { ok: true }; }
  };
  const runtime = new ExecutingAuthorityRuntime({ adapters: new AdapterRegistry().register(adapter) });

  await runtime.execute(mission, {
    service: 'shop', action: 'purchase', context: { amount: 70, currency: 'USD' }
  });
  const denied = await runtime.execute(mission, {
    service: 'shop', action: 'purchase', context: { amount: 40, currency: 'USD' }
  });

  assert.equal(calls, 1);
  assert.equal(denied.result.decision, 'deny');
  assert.equal(denied.result.code, 'cumulative_budget_exceeded');
  assert.equal(denied.result.spent, 70);
});
