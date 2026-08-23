import assert from 'node:assert/strict';
import { createTask } from '@nullsquare/agent-authority/task';
import {
  githubGitRefShaAuthorityExtractor,
  githubIssueListSelectedNumberAuthorityExtractor,
  githubPullRequestCreateNumberAuthorityExtractor
} from '@nullsquare/agent-authority/providers/github';
import {
  githubContentsWritePathAuthorityExtractor,
  githubGitRefCreateBranchAuthorityExtractor
} from '@nullsquare/agent-authority/providers/github-coding';
import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '@nullsquare/agent-authority/guard';

const repository = 'acme/app';
const branch = 'agent/issue-42';
const path = 'src/auth.js';
const sha = 'a'.repeat(40);

const task = createTask({
  principal: 'user:consumer',
  agent: 'agent:coder',
  request: 'Fix issue 42 on one branch and one file, then open a draft PR',
  permissions: {
    github: {
      allow: ['issue.list', 'git.ref.read', 'git.ref.create', 'repo.contents.write', 'pull_request.create'],
      deny: ['pull_request.merge'],
      constraints: {}
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: repository },
    marker: { kind: 'github.issue.marker', value: 'fixture-42' },
    base_branch: { kind: 'github.git.branch', value: 'main' },
    planned_branch: { kind: 'github.git.branch.intent', value: branch },
    target_path: { kind: 'github.repository.path.intent', value: path }
  },
  bindings: [
    { service: 'github', action: 'issue.list', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'issue.list', field: 'fixture_marker', authority: 'marker' },
    { service: 'github', action: 'git.ref.read', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'git.ref.read', field: 'branch', authority: 'base_branch' },
    { service: 'github', action: 'git.ref.create', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'git.ref.create', field: 'branch', authority: 'planned_branch' },
    { service: 'github', action: 'git.ref.create', field: 'sha', authority: 'base_sha' },
    { service: 'github', action: 'git.ref.create', field: 'issue_number', authority: 'issue' },
    { service: 'github', action: 'repo.contents.write', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'repo.contents.write', field: 'branch', authority: 'task_branch' },
    { service: 'github', action: 'repo.contents.write', field: 'path', authority: 'target_path' },
    { service: 'github', action: 'repo.contents.write', field: 'issue_number', authority: 'issue' },
    { service: 'github', action: 'pull_request.create', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'pull_request.create', field: 'head', authority: 'task_branch' },
    { service: 'github', action: 'pull_request.create', field: 'base', authority: 'base_branch' },
    { service: 'github', action: 'pull_request.create', field: 'issue_number', authority: 'issue' },
    { service: 'github', action: 'pull_request.create', field: 'changed_path', authority: 'changed_file' }
  ]
});

let effects = 0;
const discovery = await task.run({ service: 'github', action: 'issue.list', context: { repository, fixture_marker: 'fixture-42' } }, async () => ({
  provider: 'github', selected_issue_number: 42, selected_issue_match_count: 1, selected_issue_marker: 'fixture-42'
}));
const issue = task.authorityFrom(discovery, { name: 'issue', kind: 'github.issue.number', from: ['repository', 'marker'], extractor: githubIssueListSelectedNumberAuthorityExtractor });

const base = await task.run({ service: 'github', action: 'git.ref.read', context: { repository, branch: 'main' } }, async () => ({ provider: 'github', branch: 'main', ref: 'refs/heads/main', sha }));
const baseSha = task.authorityFrom(base, { name: 'base_sha', kind: 'github.git.sha', from: ['repository', 'base_branch'], extractor: githubGitRefShaAuthorityExtractor });

const created = await task.run({ service: 'github', action: 'git.ref.create', context: { repository, branch, sha: baseSha.value, issue_number: issue.value } }, async () => {
  effects += 1;
  return { provider: 'github', branch, ref: `refs/heads/${branch}`, sha };
});
const taskBranch = task.authorityFrom(created, { name: 'task_branch', kind: 'github.git.branch', from: ['planned_branch', 'issue', 'base_sha'], extractor: githubGitRefCreateBranchAuthorityExtractor });

await assert.rejects(
  task.run({ service: 'github', action: 'repo.contents.write', context: { repository, branch: 'main', path, issue_number: issue.value } }, async () => { effects += 1; }),
  (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
);
assert.equal(effects, 1);

const write = await task.run({ service: 'github', action: 'repo.contents.write', context: { repository, branch: taskBranch.value, path, issue_number: issue.value } }, async () => {
  effects += 1;
  return { provider: 'github', body: { content: { path } } };
});
const changed = task.authorityFrom(write, { name: 'changed_file', kind: 'github.repository.path', from: ['task_branch', 'issue', 'target_path'], extractor: githubContentsWritePathAuthorityExtractor });

const pr = await task.run({ service: 'github', action: 'pull_request.create', context: { repository, head: taskBranch.value, base: 'main', issue_number: issue.value, changed_path: changed.value } }, async () => {
  effects += 1;
  return { provider: 'github', pull_request_number: 77, head: branch, base: 'main' };
});
const prFact = task.authorityFrom(pr, { name: 'pull_request', kind: 'github.pull_request.number', from: ['issue', 'task_branch', 'changed_file'], extractor: githubPullRequestCreateNumberAuthorityExtractor });
assert.equal(prFact.value, 77);

await assert.rejects(
  task.run({ service: 'github', action: 'pull_request.merge', context: { repository, pull_request_number: 77 } }, async () => { effects += 1; }),
  (error) => error instanceof AuthorityDeniedError
);
assert.equal(effects, 3);
console.log('PASS -> registry coding workflow carries issue -> branch -> file -> PR authority while merge stays outside the task');
