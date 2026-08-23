import { createTask } from '@nullsquare/agent-authority/task';
import { AuthorityApprovalRequiredError } from '@nullsquare/agent-authority/guard';
import { createRuntimeEnvironment } from '@nullsquare/agent-authority/runtime-env';

const repository = process.argv[2] || process.env.GITHUB_REPOSITORY || 'Null-Square/agent-authority';
const unrelatedRepository = process.argv[3] || 'octocat/Hello-World';
const env = createRuntimeEnvironment({ home: process.env.AGENT_AUTHORITY_HOME });

const connection = env.broker.getConnection({
  principal_id: env.config.principal_id,
  service: 'github'
});

if (!connection) {
  throw new Error(
    'No unambiguous GitHub connection. Run: printf %s "$GITHUB_TOKEN" | agent-authority connect github --token-stdin'
  );
}

const task = createTask({
  principal: env.config.principal_id,
  agent: 'agent:connected-quickstart',
  request: `Inspect only ${repository} through the connected GitHub account`,
  permissions: {
    github: {
      allow: ['repo.read'],
      deny: ['repo.write', 'repo.delete'],
      constraints: {}
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: repository }
  },
  bindings: [
    { service: 'github', action: 'repo.read', field: 'repository', authority: 'repository' }
  ],
  runtime: env.runtime
});

console.log(`Connected account -> ${connection.metadata?.login || connection.account_id}`);
console.log('Credential location -> Agent Authority broker/vault (not task context)');
console.log('Standing GitHub permission -> repo.read');
console.log(`Task authority -> ${repository}`);

const allowed = await task.execute({
  service: 'github',
  action: 'repo.read',
  context: { repository }
});

console.log(`ALLOW -> connected GitHub returned ${allowed.output.body.full_name}`);

try {
  await task.execute({
    service: 'github',
    action: 'repo.read',
    context: { repository: unrelatedRepository }
  });
  throw new Error('unrelated repository unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
    throw error;
  }
  console.log(`STEP-UP -> ${task.explain(error).summary}`);
}

const visibleState = JSON.stringify({
  mission: task.mission,
  authorities: task.authorities(),
  connection: env.broker.listConnections(env.config.principal_id),
  allowed_output: allowed.output
});
if (/github_pat_|gh[pousr]_|Bearer\s/i.test(visibleState)) {
  throw new Error('credential-like value leaked into public task state');
}

console.log('PASS -> connected credential stayed broker-internal and unrelated repository stayed outside task authority');
