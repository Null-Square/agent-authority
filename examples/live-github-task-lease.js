import { AuthorityRuntime } from '../src/index.js';
import { AuthorityApprovalRequiredError, createTaskLeaseGuard } from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';

const allowedRepository = process.argv[2] || 'Null-Square/agent-authority';
const blockedRepository = process.argv[3] || 'octocat/Hello-World';

const mission = {
  version: '0.1',
  mission_id: 'mission:live-github-validation',
  principal: { id: 'user:validation' },
  agent: { id: 'agent:ordinary-node-app' },
  objective: 'Read only the repository authorized for this task',
  resources: [{
    service: 'github',
    allow: ['repo.read'],
    deny: ['repo.delete', 'repo.write'],
    constraints: {}
  }],
  constraints: { expires_at: '2099-01-01T00:00:00Z' }
};

const lease = createTaskLease({
  mission,
  request: `Inspect ${allowedRepository}`,
  roots: [{
    fact_id: 'fact:repository',
    kind: 'github.repository',
    value: allowedRepository
  }],
  bindings: [{
    service: 'github',
    action: 'repo.read',
    context_field: 'repository',
    fact_id: 'fact:repository'
  }]
});

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
let outboundCalls = 0;

async function githubRead(repository) {
  return guard.run({
    service: 'github',
    action: 'repo.read',
    context: { repository }
  }, async () => {
    outboundCalls += 1;
    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'agent-authority-live-validation'
    };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const response = await fetch(`https://api.github.com/repos/${repository}`, { headers });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const body = await response.json();
    return { full_name: body.full_name, private: body.private, html_url: body.html_url };
  });
}

console.log(`Task allows exactly: ${allowedRepository}`);
console.log(`Credential mode: ${process.env.GITHUB_TOKEN ? 'authenticated GitHub token' : 'public GitHub API'}`);

const allowed = await githubRead(allowedRepository);
console.log(`ALLOW -> live GitHub returned ${allowed.output.full_name}`);
console.log(`Outbound GitHub calls: ${outboundCalls}`);

try {
  await githubRead(blockedRepository);
  throw new Error('blocked repository unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') throw error;
  console.log(`STEP-UP -> ${blockedRepository} is outside task authority`);
}

if (outboundCalls !== 1) throw new Error(`expected exactly one outbound GitHub call, got ${outboundCalls}`);
console.log('PASS -> unrelated repository was blocked before fetch()');

lease.complete('live validation complete');
