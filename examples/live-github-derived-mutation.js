import { CredentialBroker } from '../src/connections.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError
} from '../src/guard.js';
import { createGitHubProviderAdapter } from '../src/providers/github.js';
import { createTask } from '../src/task.js';

const repository = process.env.AA_VALIDATION_REPOSITORY || 'Null-Square/agent-authority';
const marker = process.env.AA_VALIDATION_MARKER || 'agent-authority-live-fixture-v1';
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error('GITHUB_TOKEN is required for the live derived-mutation validation');
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`invalid repository: ${repository}`);

const task = createTask({
  mission_id: 'mission:live-derived-github-mutation',
  principal: 'user:validation',
  agent: 'agent:github-actions-validation',
  request: 'Find the Agent Authority live validation fixture and leave one validation comment',
  objective: 'Discover the validation issue and comment only on that issue',
  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['issue.close', 'issue.delete', 'repo.write', 'repo.delete'],
      constraints: { repository: [repository] }
    }
  },
  constraints: { expires_at: '2099-01-01T00:00:00Z' },
  authority: {
    repository: {
      kind: 'github.repository',
      value: repository,
      source: 'validation-task'
    },
    fixtureMarker: {
      kind: 'github.issue.marker',
      value: marker,
      source: 'validation-task'
    }
  },
  bindings: [
    {
      service: 'github',
      action: 'issue.list',
      field: 'repository',
      authority: 'repository'
    },
    {
      service: 'github',
      action: 'issue.list',
      field: 'fixture_marker',
      authority: 'fixtureMarker'
    },
    {
      service: 'github',
      action: 'issue.comment',
      field: 'repository',
      authority: 'repository'
    }
  ]
});

const mission = task.mission;
const broker = new CredentialBroker();
broker.connect({
  principal_id: mission.principal.id,
  service: 'github',
  auth_kind: 'github-actions-token',
  credential: { access_token: token },
  scopes: ['contents:read', 'issues:write']
});
const adapter = createGitHubProviderAdapter({ broker });

const cleanupHeaders = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-authority-task-first-derived-mutation-validation-cleanup',
  'x-github-api-version': '2022-11-28'
};

let providerReadCalls = 0;
let providerMutationCalls = 0;
let cleanupCalls = 0;
let createdCommentId = null;

function discoveryRequest() {
  return {
    service: 'github',
    action: 'issue.list',
    context: {
      repository,
      fixture_marker: marker,
      state: 'open',
      per_page: 100
    }
  };
}

async function discoverFixtureIssue() {
  const request = discoveryRequest();
  return task.run(request, async () => {
    providerReadCalls += 1;
    return adapter.execute({ mission, request });
  });
}

async function commentOnIssue(issueNumber, body) {
  const request = {
    service: 'github',
    action: 'issue.comment',
    context: { repository, issue_number: issueNumber, body }
  };

  return task.run(request, async () => {
    providerMutationCalls += 1;
    return adapter.execute({ mission, request });
  });
}

async function cleanupComment(commentId) {
  cleanupCalls += 1;
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { method: 'DELETE', headers: cleanupHeaders }
  );
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`GitHub cleanup ${response.status}: ${body.slice(0, 300)}`);
  }
}

try {
  console.log('Task-first live workflow: discover one issue and comment only on that issue');
  console.log(`Task root repository: ${task.authority('repository').value}`);
  console.log(`Task root fixture marker: ${task.authority('fixtureMarker').value}`);
  console.log('1. Discover fixture through task.run() and the reviewed GitHub provider adapter');
  const discovered = await discoverFixtureIssue();

  if (discovered.output.selected_issue_match_count !== 1) {
    throw new Error(`expected exactly one fixture marker match, got ${discovered.output.selected_issue_match_count}`);
  }
  console.log(`   ALLOW -> selected issue #${discovered.output.selected_issue_number}: ${discovered.output.selected_issue_title}`);

  const extractor = adapter.authorityExtractor(discoveryRequest(), 'github.issue.number');
  if (!extractor) throw new Error('GitHub provider did not advertise the issue-number authority extractor');

  const issueFact = task.authorityFrom(discovered, {
    name: 'discoveredIssue',
    kind: 'github.issue.number',
    from: ['repository', 'fixtureMarker'],
    extractor
  });
  task.bind({
    service: 'github',
    action: 'issue.comment',
    field: 'issue_number',
    authority: 'discoveredIssue'
  });
  console.log(`2. task.authorityFrom() -> issue #${issueFact.value}`);

  const validationBody = `Agent Authority live task-first authorization validation (${new Date().toISOString()}). Temporary comment; CI removes it after the proof.`;
  const allowedMutation = await commentOnIssue(issueFact.value, validationBody);
  createdCommentId = allowedMutation.output.comment_id;
  console.log(`3. ALLOW -> real GitHub comment mutation executed (comment ${createdCommentId})`);

  const unrelatedIssue = issueFact.value === 1 ? 2 : 1;
  try {
    await commentOnIssue(unrelatedIssue, 'THIS MUST NEVER REACH GITHUB');
    throw new Error('unrelated issue mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
      throw error;
    }
    const explanation = task.explain(error);
    console.log(`4. STEP-UP -> unrelated issue #${unrelatedIssue} blocked before provider mutation`);
    console.log(`   ${explanation.summary}`);
    if (explanation.established_authority?.value !== issueFact.value) {
      throw new Error('task-first authority-delta explanation lost the established issue authority');
    }
  }

  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one task-side provider mutation before completion, got ${providerMutationCalls}`);
  }

  task.complete('live task-first evidence-derived mutation validation complete');
  try {
    await commentOnIssue(issueFact.value, 'THIS MUST NOT RUN AFTER TASK COMPLETION');
    throw new Error('post-completion mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityDeniedError) || error.code !== 'task_lease_completed') {
      throw error;
    }
    console.log(`5. DENY -> post-completion mutation blocked for issue #${issueFact.value}`);
  }

  if (providerReadCalls !== 1) {
    throw new Error(`expected exactly one provider discovery call, got ${providerReadCalls}`);
  }
  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one provider mutation after blocked attempts, got ${providerMutationCalls}`);
  }

  console.log('PASS -> real GitHub provider output became task-first downstream authority through execution evidence and the reviewed extractor');
  console.log('PASS -> unrelated and post-completion task-first calls produced zero additional provider mutations');
} finally {
  if (createdCommentId) {
    await cleanupComment(createdCommentId);
    console.log(`Cleanup -> deleted temporary validation comment ${createdCommentId} (outside the agent authority proof)`);
  }
  console.log(`Provider calls observed before cleanup: reads=${providerReadCalls}, task_mutations=${providerMutationCalls}`);
  console.log(`Harness cleanup calls: ${cleanupCalls}`);
}
