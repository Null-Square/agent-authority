import { createTask } from '@nullsquare/agent-authority/task';
import { AuthorityApprovalRequiredError } from '@nullsquare/agent-authority/guard';

const allowedRepository = process.argv[2] || 'Null-Square/agent-authority';
const blockedRepository = process.argv[3] || 'octocat/Hello-World';

const task = createTask({
  principal: 'user:quickstart',
  agent: 'agent:quickstart',
  request: `Inspect only ${allowedRepository}`,
  permissions: {
    github: {
      allow: ['repo.read'],
      deny: ['repo.write', 'repo.delete'],
      constraints: { repository: [allowedRepository] }
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: allowedRepository }
  },
  bindings: [
    { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
  ]
});

let outboundCalls = 0;

async function readRepository(repository) {
  return task.run({
    service: 'github',
    action: 'repo.read',
    context: { repository }
  }, async () => {
    outboundCalls += 1;

    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'agent-authority-live-quickstart',
      'x-github-api-version': '2022-11-28'
    };
    if (process.env.GITHUB_TOKEN) {
      headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(`https://api.github.com/repos/${repository}`, { headers });
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} for ${repository}`);
    }

    const body = await response.json();
    return {
      full_name: body.full_name,
      private: body.private,
      html_url: body.html_url
    };
  });
}

console.log(`Task authority -> ${allowedRepository}`);
console.log(`GitHub mode -> ${process.env.GITHUB_TOKEN ? 'authenticated token' : 'public API; no credential required'}`);

const allowed = await readRepository(allowedRepository);
console.log(`ALLOW -> real GitHub returned ${allowed.output.full_name}`);

try {
  await readRepository(blockedRepository);
  throw new Error('unrelated repository unexpectedly reached GitHub');
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
    throw error;
  }

  console.log(`STEP-UP -> ${task.explain(error).summary}`);
}

if (outboundCalls !== 1) {
  throw new Error(`expected exactly one outbound GitHub call, observed ${outboundCalls}`);
}

task.complete('live GitHub quickstart complete');
console.log('PASS -> unrelated repository was blocked before fetch()');
