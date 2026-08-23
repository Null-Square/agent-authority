import { createTask } from '@nullsquare/agent-authority/task';
import { AuthorityApprovalRequiredError } from '@nullsquare/agent-authority/guard';
import { githubIssueListSelectedNumberAuthorityExtractor } from '@nullsquare/agent-authority/providers/github';

const repository = 'acme/app';
const marker = 'quickstart-selected-issue';

const task = createTask({
  principal: 'user:quickstart',
  agent: 'agent:quickstart',
  request: 'Handle the issue selected for this task and comment only on that issue',
  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['repo.delete'],
      constraints: { repository: [repository] }
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: repository },
    marker: { kind: 'github.issue.marker', value: marker }
  },
  bindings: [
    { service: 'github', action: 'issue.list', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'issue.list', field: 'fixture_marker', authority: 'marker' },
    { service: 'github', action: 'issue.comment', field: 'repository', authority: 'repository' }
  ]
});

let effects = 0;

const discovery = await task.run({
  service: 'github',
  action: 'issue.list',
  context: { repository, fixture_marker: marker }
}, async () => {
  effects += 1;

  // This is provider-shaped fixture output so the quickstart needs no account.
  // In a real app, replace only this callback with the SDK/provider call you already use.
  return {
    provider: 'github',
    status: 200,
    ok: true,
    selected_issue_number: 42,
    selected_issue_title: 'Quickstart issue',
    selected_issue_match_count: 1,
    selected_issue_marker: marker
  };
});

const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: ['repository', 'marker'],
  extractor: githubIssueListSelectedNumberAuthorityExtractor
});

task.bind({
  service: 'github',
  action: 'issue.comment',
  field: 'issue_number',
  authority: 'issue'
});

await task.run({
  service: 'github',
  action: 'issue.comment',
  context: { repository, issue_number: issue.value, body: 'Handled.' }
}, async () => {
  effects += 1;
  return { comment_id: 1001 };
});

console.log(`ALLOW -> task discovered issue #${issue.value} and the exact comment effect ran`);

try {
  await task.run({
    service: 'github',
    action: 'issue.comment',
    context: { repository, issue_number: 7, body: 'This must not run.' }
  }, async () => {
    effects += 1;
    return { comment_id: 1002 };
  });

  throw new Error('unrelated issue unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
    throw error;
  }

  console.log(`STEP-UP -> ${task.explain(error).summary}`);
}

if (effects !== 2) {
  throw new Error(`expected exactly 2 provider-shaped effects, observed ${effects}`);
}

task.complete('quickstart complete');
console.log('PASS -> useful task work ran; unrelated standing permission did not become task authority');
