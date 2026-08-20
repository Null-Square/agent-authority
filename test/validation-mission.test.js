import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMissionPolicy } from '../src/index.js';

const mission = JSON.parse(
  readFileSync(new URL('../examples/missions/chatgpt-web-validation.json', import.meta.url), 'utf8')
);

test('canonical web validation mission allows only the approved repository read', () => {
  const allowed = evaluateMissionPolicy(mission, {
    service: 'mcp:validation-upstream',
    action: 'tool.github_repo_metadata',
    context: { repository: 'Null-Square/agent-authority' }
  });
  assert.equal(allowed.decision, 'allow');

  const otherRepo = evaluateMissionPolicy(mission, {
    service: 'mcp:validation-upstream',
    action: 'tool.github_repo_metadata',
    context: { repository: 'someone/other-repo' }
  });
  assert.equal(otherRepo.decision, 'deny');
  assert.equal(otherRepo.code, 'resource_constraint_mismatch');

  const write = evaluateMissionPolicy(mission, {
    service: 'mcp:validation-upstream',
    action: 'tool.dangerous_demo_write',
    context: { repository: 'Null-Square/agent-authority' }
  });
  assert.equal(write.decision, 'deny');
  assert.equal(write.code, 'explicit_deny');
});
