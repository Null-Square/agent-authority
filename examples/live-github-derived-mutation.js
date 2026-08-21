import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';

const repository = process.env.AA_VALIDATION_REPOSITORY || 'Null-Square/agent-authority';
const marker = process.env.AA_VALIDATION_MARKER || 'agent-authority-live-fixture-v1';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN is required for the live derived-mutation validation');
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`invalid repository: ${repository}`);

const mission = {
  version: '0.1',
  mission_id: 'mission:live-derived-github-mutation',
  principal: { id: 'user:validation' },
  agent: { id: 'agent:github-actions-validation' },
  objective: 'Discover the validation issue and comment only on that issue',
  resources: [
    {
      service: 'github',
      allow: ['issue.list', 'issue.comment'],
      deny: ['issue.close', 'issue.delete', 'repo.write', 'repo.delete'],
      constraints: { repository: [repository] }
    }
  ],
  constraints: { expires_at: '2099-01-01T00:00:00Z' }
};

const lease = createTaskLease({
  mission,
  request: 'Find the Agent Authority live validation fixture and leave one validation comment',
  roots: [
    {
      fact_id: 'fact:repository',
      kind: 'github.repository',
      value: repository,
      source: 'validation-task'
    }
  ],
  bindings: [
    {
      service: 'github',
      action: 'issue.list',
      context_field: 'repository',
      fact_id: 'fact:repository'
    },
    {
      service: 'github',
      action: 'issue.comment',
      context_field: 'repository',
      fact_id: 'fact:repository'
    },
    {
      service: 'github',
      action: 'issue.comment',
      context_field: 'issue_number',
      fact_id: 'fact:discovered-issue-number'
    }
  ]
});

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-authority-derived-mutation-validation',
  'x-github-api-version': '2022-11-28'
};

let providerReadCalls = 0;
let providerMutationCalls = 0;
let cleanupCalls = 0;
let createdCommentId = null;

async function githubJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${body.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function discoverFixtureIssue() {
  return guard.run(
    {
      service: 'github',
      action: 'issue.list',
      context: { repository }
    },
    async () => {
      providerReadCalls += 1;
      const issues = await githubJson(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`
      );
      const fixture = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));
      if (!fixture) throw new Error(`validation fixture with marker ${marker} was not found`);
      return { number: fixture.number, title: fixture.title };
    }
  );
}

async function commentOnIssue(issueNumber, body) {
  return guard.run(
    {
      service: 'github',
      action: 'issue.comment',
      context: { repository, issue_number: issueNumber }
    },
    async () => {
      providerMutationCalls += 1;
      const comment = await githubJson(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body })
        }
      );
      return { id: comment.id, html_url: comment.html_url };
    }
  );
}

async function cleanupComment(commentId) {
  cleanupCalls += 1;
  await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { method: 'DELETE' }
  );
}

try {
  console.log(`Task root repository: ${repository}`);
  console.log('1. Discover fixture through an authorized live GitHub issue-list call');
  const discovered = await discoverFixtureIssue();
  console.log(`   ALLOW -> discovered issue #${discovered.output.number}: ${discovered.output.title}`);

  lease.derive({
    fact_id: 'fact:discovered-issue-number',
    kind: 'github.issue.number',
    value: discovered.output.number,
    from: ['fact:repository'],
    receipt: discovered.receipt,
    selector: 'output.number'
  });
  console.log(`2. Derived authority -> issue #${discovered.output.number}`);

  const validationBody = `Agent Authority live derived-authority validation (${new Date().toISOString()}). Temporary comment; CI removes it after the proof.`;
  const allowedMutation = await commentOnIssue(discovered.output.number, validationBody);
  createdCommentId = allowedMutation.output.id;
  console.log(`3. ALLOW -> real GitHub comment mutation executed (comment ${createdCommentId})`);

  const unrelatedIssue = discovered.output.number === 1 ? 2 : 1;
  try {
    await commentOnIssue(unrelatedIssue, 'THIS MUST NEVER REACH GITHUB');
    throw new Error('unrelated issue mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
      throw error;
    }
    console.log(`4. STEP-UP -> unrelated issue #${unrelatedIssue} blocked before provider mutation`);
  }

  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one task-side provider mutation before completion, got ${providerMutationCalls}`);
  }

  lease.complete('live derived-mutation validation complete');
  try {
    await commentOnIssue(discovered.output.number, 'THIS MUST NOT RUN AFTER TASK COMPLETION');
    throw new Error('post-completion mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityDeniedError) || error.code !== 'task_lease_completed') {
      throw error;
    }
    console.log(`5. DENY -> post-completion mutation blocked for issue #${discovered.output.number}`);
  }

  if (providerReadCalls !== 1) {
    throw new Error(`expected exactly one provider discovery call, got ${providerReadCalls}`);
  }
  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one provider mutation after blocked attempts, got ${providerMutationCalls}`);
  }

  console.log('PASS -> dynamic resource was discovered from GitHub, derived into the Task Lease, and mutated exactly once');
  console.log('PASS -> unrelated and post-completion mutations produced zero additional provider mutation calls');
} finally {
  if (createdCommentId) {
    await cleanupComment(createdCommentId);
    console.log(`Cleanup -> deleted temporary validation comment ${createdCommentId} (outside the agent authority proof)`);
  }
  console.log(`Provider calls observed before cleanup: reads=${providerReadCalls}, task_mutations=${providerMutationCalls}`);
  console.log(`Harness cleanup calls: ${cleanupCalls}`);
}
