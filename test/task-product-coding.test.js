import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AdapterRegistry } from '../src/index.js';
import { CredentialBroker } from '../src/connections.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError
} from '../src/guard.js';
import { JsonFileExecutionGuard } from '../src/idempotency.js';
import {
  createGitHubProviderAdapter,
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
const writeCommitSha = 'b'.repeat(40);

function connectedRuntime() {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'developer',
    auth_kind: 'github-token',
    credential: { access_token: 'coding-secret-sentinel' }
  });

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    calls.push({ href, method, body: options.body ? JSON.parse(options.body) : null });

    if (method === 'GET' && href.includes('/issues?')) {
      return new Response(JSON.stringify([
        { number: 42, title: 'Fix auth edge case', body: `please handle ${marker}` },
        { number: 7, title: 'Unrelated', body: 'not the task' }
      ]), { status: 200, headers: { 'x-github-request-id': 'ISSUES' } });
    }

    if (method === 'GET' && href.endsWith('/git/ref/heads/main')) {
      return new Response(JSON.stringify({
        ref: 'refs/heads/main',
        object: { sha: baseSha, type: 'commit' }
      }), { status: 200, headers: { 'x-github-request-id': 'BASE' } });
    }

    if (method === 'POST' && href.endsWith('/git/refs')) {
      assert.deepEqual(JSON.parse(options.body), {
        ref: `refs/heads/${plannedBranch}`,
        sha: baseSha
      });
      return new Response(JSON.stringify({
        ref: `refs/heads/${plannedBranch}`,
        object: { sha: baseSha, type: 'commit' }
      }), { status: 201, headers: { 'x-github-request-id': 'BRANCH' } });
    }

    if (method === 'PUT' && href.endsWith('/contents/src/auth.js')) {
      const body = JSON.parse(options.body);
      assert.equal(body.branch, plannedBranch);
      assert.equal(body.message, 'Fix issue #42');
      return new Response(JSON.stringify({
        content: { path: targetPath, sha: 'c'.repeat(40) },
        commit: { sha: writeCommitSha }
      }), { status: 200, headers: { 'x-github-request-id': 'WRITE' } });
    }

    if (method === 'POST' && href.endsWith('/pulls')) {
      const body = JSON.parse(options.body);
      assert.equal(body.head, plannedBranch);
      assert.equal(body.base, baseBranch);
      assert.equal(body.draft, true);
      return new Response(JSON.stringify({
        number: 77,
        html_url: 'https://github.com/acme/app/pull/77',
        head: { ref: plannedBranch },
        base: { ref: baseBranch },
        draft: true
      }), { status: 201, headers: { 'x-github-request-id': 'PR' } });
    }

    throw new Error(`unexpected provider request: ${method} ${href}`);
  };

  const home = mkdtempSync(join(tmpdir(), 'agent-authority-coding-'));
  const executions = new JsonFileExecutionGuard(join(home, 'executions.json'));
  const adapters = new AdapterRegistry().register(createGitHubProviderAdapter({ broker, fetchImpl }));
  return {
    runtime: new ExecutingAuthorityRuntime({ adapters, executions }),
    calls,
    executions,
    cleanup: () => rmSync(home, { recursive: true, force: true })
  };
}

function codingTask(runtime) {
  return createTask({
    principal: 'user:test',
    agent: 'agent:coder',
    request: 'Fix the selected issue on one task branch, change only src/auth.js, and open a draft PR. Do not merge or deploy.',
    permissions: {
      github: {
        allow: [
          'issue.list',
          'git.ref.read',
          'git.ref.create',
          'repo.contents.write',
          'pull_request.create'
        ],
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
    ],
    runtime
  });
}

async function expectStepUp(task, request, expectedCalls, calls) {
  await assert.rejects(
    task.execute(request),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
  );
  assert.equal(calls.length, expectedCalls, 'authority delta must stop before provider execution');
}

test('coding workflow carries exact task authority from issue to branch to changed file to PR', async () => {
  const { runtime, calls, executions, cleanup } = connectedRuntime();
  try {
    const task = codingTask(runtime);

    // The planned branch cannot be created until the task has actually established
    // both the selected issue and the exact base commit SHA.
    await assert.rejects(
      task.execute({
        service: 'github',
        action: 'git.ref.create',
        context: { repository, branch: plannedBranch, sha: baseSha, issue_number: 42 }
      }),
      (error) => error instanceof AuthorityDeniedError && error.code === 'authority_fact_unresolved'
    );
    assert.equal(calls.length, 0);

    const discovery = await task.execute({
      service: 'github',
      action: 'issue.list',
      context: { repository, fixture_marker: marker, state: 'open', per_page: 100 }
    });
    const issue = task.authorityFrom(discovery, {
      name: 'issue',
      kind: 'github.issue.number',
      from: ['repository', 'fixture_marker'],
      extractor: githubIssueListSelectedNumberAuthorityExtractor
    });
    assert.equal(issue.value, 42);

    const base = await task.execute({
      service: 'github',
      action: 'git.ref.read',
      context: { repository, branch: baseBranch }
    });
    const baseAuthority = task.authorityFrom(base, {
      name: 'base_sha',
      kind: 'github.git.sha',
      from: ['repository', 'base_branch'],
      extractor: githubGitRefShaAuthorityExtractor
    });
    assert.equal(baseAuthority.value, baseSha);

    const branchCreation = await task.execute({
      service: 'github',
      action: 'git.ref.create',
      idempotency_key: 'branch-issue-42',
      context: {
        repository,
        branch: plannedBranch,
        sha: baseAuthority.value,
        issue_number: issue.value
      }
    });
    const taskBranch = task.authorityFrom(branchCreation, {
      name: 'task_branch',
      kind: 'github.git.branch',
      from: ['planned_branch', 'issue', 'base_sha'],
      extractor: githubGitRefCreateBranchAuthorityExtractor
    });
    assert.equal(taskBranch.value, plannedBranch);

    await expectStepUp(task, {
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
    }, 3, calls);

    await expectStepUp(task, {
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
    }, 3, calls);

    const write = await task.execute({
      service: 'github',
      action: 'repo.contents.write',
      idempotency_key: 'write-auth-js-42',
      context: {
        repository,
        branch: taskBranch.value,
        path: targetPath,
        issue_number: issue.value,
        message: 'Fix issue #42',
        content_base64: Buffer.from('export const fixed = true;\n').toString('base64')
      }
    });
    const changedFile = task.authorityFrom(write, {
      name: 'changed_file',
      kind: 'github.repository.path',
      from: ['task_branch', 'issue', 'target_path'],
      extractor: githubContentsWritePathAuthorityExtractor
    });
    assert.equal(changedFile.value, targetPath);

    await expectStepUp(task, {
      service: 'github',
      action: 'pull_request.create',
      context: {
        repository,
        head: 'agent/unrelated',
        base: baseBranch,
        issue_number: issue.value,
        changed_path: changedFile.value,
        title: 'Wrong head',
        draft: true
      }
    }, 4, calls);

    const prCreation = await task.execute({
      service: 'github',
      action: 'pull_request.create',
      idempotency_key: 'pr-issue-42',
      context: {
        repository,
        head: taskBranch.value,
        base: baseBranch,
        issue_number: issue.value,
        changed_path: changedFile.value,
        title: 'Fix issue #42',
        body: 'Task-authorized change for issue #42.',
        draft: true
      }
    });
    const pullRequest = task.authorityFrom(prCreation, {
      name: 'pull_request',
      kind: 'github.pull_request.number',
      from: ['issue', 'task_branch', 'changed_file'],
      extractor: githubPullRequestCreateNumberAuthorityExtractor
    });
    assert.equal(pullRequest.value, 77);
    assert.equal(calls.length, 5);
    assert.equal(executions.list({ status: 'succeeded' }).length, 3, 'all three provider mutations must be idempotency-guarded');

    await assert.rejects(
      task.execute({
        service: 'github',
        action: 'pull_request.merge',
        context: { repository, pull_request_number: pullRequest.value }
      }),
      (error) => error instanceof AuthorityDeniedError
    );
    assert.equal(calls.length, 5, 'merge stays outside task authority and provider execution');

    task.complete('draft PR opened; merge remains human-owned');
    await assert.rejects(
      task.execute({
        service: 'github',
        action: 'pull_request.create',
        context: {
          repository,
          head: taskBranch.value,
          base: baseBranch,
          issue_number: issue.value,
          changed_path: changedFile.value,
          title: 'Retry',
          draft: true
        }
      }),
      (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
    );
    assert.equal(calls.length, 5);

    assert.deepEqual(
      calls.map(({ method, href }) => `${method} ${new URL(href).pathname}`),
      [
        'GET /repos/acme/app/issues',
        'GET /repos/acme/app/git/ref/heads/main',
        'POST /repos/acme/app/git/refs',
        'PUT /repos/acme/app/contents/src/auth.js',
        'POST /repos/acme/app/pulls'
      ]
    );
  } finally {
    cleanup();
  }
});
