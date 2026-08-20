import { AuthorityRuntime } from '../src/index.js';
import { createAuthorityGuard } from '../src/guard.js';

const mission = {
  version: '0.1',
  mission_id: 'mission:direct-guard-demo',
  principal: { id: 'user:demo' },
  agent: { id: 'agent:demo' },
  objective: 'Inspect only the Agent Authority public repository',
  resources: [{
    service: 'github',
    allow: ['repo.read'],
    deny: ['repo.delete', 'repo.write'],
    constraints: { repository: ['Null-Square/agent-authority'] }
  }]
};

const guard = createAuthorityGuard({
  mission,
  runtime: new AuthorityRuntime(),
  onDecision: ({ result, receipt }, request) => {
    console.log(`${result.decision.toUpperCase()} ${request.service}:${request.action} receipt=${receipt.receipt_hash}`);
  }
});

const repository = process.argv[2] || 'Null-Square/agent-authority';

try {
  const { output } = await guard.run({
    service: 'github',
    action: 'repo.read',
    context: { repository }
  }, async () => {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'agent-authority-direct-guard-demo' }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const repo = await response.json();
    return {
      full_name: repo.full_name,
      visibility: repo.visibility,
      default_branch: repo.default_branch
    };
  });

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 2;
}
