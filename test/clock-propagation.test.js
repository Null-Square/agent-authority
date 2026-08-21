import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import { createTaskLease } from '../src/task-lease.js';

test('Task Lease evaluates mission ceiling with the same explicit clock', () => {
  const mission = {
    version: '0.1',
    mission_id: 'mission:clock-propagation',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'Validate deterministic expiry',
    resources: [{
      service: 'github',
      allow: ['repo.read'],
      deny: [],
      constraints: {}
    }],
    constraints: { expires_at: '2030-01-01T00:00:00Z' }
  };

  const lease = createTaskLease({
    mission,
    expires_at: '2040-01-01T00:00:00Z'
  });

  const result = lease.evaluate(
    new AuthorityRuntime(),
    { service: 'github', action: 'repo.read', context: {} },
    new Date('2030-01-01T00:00:01Z')
  );

  assert.equal(result.result.decision, 'deny');
  assert.equal(result.result.code, 'mission_expired');
});
