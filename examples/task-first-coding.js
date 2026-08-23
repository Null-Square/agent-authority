import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import {
  githubGitRefShaAuthorityExtractor,
  githubIssueListSelectedNumberAuthorityExtractor,
  githubPullRequestCreateNumberAuthorityExtractor
} from '../src/providers/github.js';
import {
  githubContentsWritePathAuthorityExtractor,
  githubGitRefCreateBranchAuthorityExtractor
} from '../src/providers/github-coding.js';
import { createTask } from '../src/task.js';

const repository = 'acme/app';
const marker = 'coding-fixture-42';
const baseBranch = 'main';
const plannedBranch = 'agent/issue-42';
const targetPath = 'src/auth.js';
const baseSha = 'a'.repeat(40);

const task = createTask({
  principal: 'user:demo',
  agent: 'agent:coder',
  request: 'Fix the selected issue on one task branch, change only src/auth.js, and open a draft PR. Do not merge or deploy.',
  permissions: {
    github: {
      allow: ['issue.list', 'git.ref.read', 'git.ref.create', 'repo.contents.write', 'pull_request.create'],
      deny: ['pull_request.merge', 'repo.delete'],
      constraints: {}
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: repository },
    fixture_marker: { kind: 'github.issue.marker', value: marker },
    base_branch: { kind: 'github.git.branch', value: baseBranch },
    planned_branch: { kind: 'github.git.branch.intent', value: plannedBranch },
    target_path: { kind: 'github.repository.path.intent', value: targetPath }
  },
  bindings: [
    { service: 'github', action: 'issue.list', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'issue.list', field: 'fixture_marker', authority: 'fixture_marker' },
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

let reads = 0;
let mutations = 0;

const discovery = await task.run({
  service: 'github',
  action: 'issue.list',
  context: { repository, fixture_marker: marker, state: 'open' }
}, async () => {
  reads += 1;
  return {
    provider: 'github',
    selected_issue_number: 42,
    selected_issue_title: 'Fix auth edge case',
    selected_issue_match_count: 1,
    selected_issue_marker: marker
  };
});
const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: ['repository', 'fixture_marker'],
  extractor: githubIssueListSelectedNumberAuthorityExtractor
});
console.log(`DISCOVER -> issue #${issue.value} became task authority`);

const base = await task.run({
  service: 'github',
  action: 'git.ref.read',
  context: { repository, branch: baseBranch }
}, async () => {
  reads += 1;
  return { provider: 'github', branch: baseBranch, ref: `refs/heads/${baseBranch}`, sha: baseSha };
});
const baseAuthority = task.authorityFrom(base, {
  name: 'base_sha',
  kind: 'github.git.sha',
  from: ['repository', 'base_branch'],
  extractor: githubGitRefShaAuthorityExtractor
});

const branch = await task.run({
  service: 'github',
  action: 'git.ref.create',
  context: { repository, branch: plannedBranch, sha: baseAuthority.value, issue_number: issue.value }
}, async () => {
  mutations += 1;
  return { provider: 'github', branch: plannedBranch, ref: `refs/heads/${plannedBranch}`, sha: baseSha };
});
const taskBranch = task.authorityFrom(branch, {
  name: 'task_branch',
  kind: 'github.git.branch',
  from: ['planned_branch', 'issue', 'base_sha'],
  extractor: githubGitRefCreateBranchAuthorityExtractor
});
console.log(`ALLOW -> created only task branch ${taskBranch.value}`);

async function expectStepUp(request, label) {
  const before = mutations;
  try {
    await task.run(request, async () => { mutations += 1; });
    throw new Error(`${label} unexpectedly executed`);
  } catch (error) {
    if (!(error instanceof AuthorityApprovalRequiredError)) throw error;
    if (mutations !== before) throw new Error(`${label} reached the provider callback`);
    console.log(`STEP-UP -> ${label}: ${task.explain(error).summary}`);
  }
}

await expectStepUp({
  service: 'github',
  action: 'repo.contents.write',
  context: {
    repository,
    branch: baseBranch,
    path: targetPath,
    issue_number: issue.value,
    message: 'wrong branch',
    content_base64: 'd3Jvbmc='
  }
}, 'write directly to main');

await expectStepUp({
  service: 'github',
  action: 'repo.contents.write',
  context: {
    repository,
    branch: taskBranch.value,
    path: 'src/admin.js',
    issue_number: issue.value,
    message: 'wrong file',
    content_base64: 'd3Jvbmc='
  }
}, 'change an unrelated file');

const write = await task.run({
  service: 'github',
  action: 'repo.contents.write',
  context: {
    repository,
    branch: taskBranch.value,
    path: targetPath,
    issue_number: issue.value,
    message: 'Fix issue #42',
    content_base64: Buffer.from('export const fixed = true;\n').toString('base64')
  }
}, async () => {
  mutations += 1;
  return {
    provider: 'github',
    body: { content: { path: targetPath, sha: 'b'.repeat(40) }, commit: { sha: 'c'.repeat(40) } }
  };
});
const changedFile = task.authorityFrom(write, {
  name: 'changed_file',
  kind: 'github.repository.path',
  from: ['task_branch', 'issue', 'target_path'],
  extractor: githubContentsWritePathAuthorityExtractor
});
console.log(`ALLOW -> changed only ${changedFile.value} on ${taskBranch.value}`);

await expectStepUp({
  service: 'github',
  action: 'pull_request.create',
  context: {
    repository,
    head: 'agent/unrelated',
    base: baseBranch,
    issue_number: issue.value,
    changed_path: changedFile.value,
    title: 'Wrong PR head',
    draft: true
  }
}, 'open PR from another branch');

const pr = await task.run({
  service: 'github',
  action: 'pull_request.create',
  context: {
    repository,
    head: taskBranch.value,
    base: baseBranch,
    issue_number: issue.value,
    changed_path: changedFile.value,
    title: 'Fix issue #42',
    draft: true
  }
}, async () => {
  mutations += 1;
  return {
    provider: 'github',
    pull_request_number: 77,
    head: taskBranch.value,
    base: baseBranch,
    draft: true
  };
});
const pullRequest = task.authorityFrom(pr, {
  name: 'pull_request',
  kind: 'github.pull_request.number',
  from: ['issue', 'task_branch', 'changed_file'],
  extractor: githubPullRequestCreateNumberAuthorityExtractor
});
console.log(`ALLOW -> opened draft PR #${pullRequest.value}`);

const beforeMerge = mutations;
try {
  await task.run({
    service: 'github',
    action: 'pull_request.merge',
    context: { repository, pull_request_number: pullRequest.value }
  }, async () => { mutations += 1; });
  throw new Error('merge unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityDeniedError)) throw error;
  if (mutations !== beforeMerge) throw new Error('merge reached provider callback');
  console.log('DENY -> merge remains outside task authority');
}

task.complete('draft PR opened');
console.log(`PASS -> reads=${reads}, authorized mutations=${mutations}; unrelated writes/PRs and merge executed zero callbacks`);
