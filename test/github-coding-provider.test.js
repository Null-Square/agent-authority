import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialBroker } from '../src/connections.js';
import {
  createGitHubProviderAdapter,
  githubGitRefShaAuthorityExtractor
} from '../src/providers/github.js';
import {
  githubContentsWritePathAuthorityExtractor,
  githubGitRefCreateBranchAuthorityExtractor
} from '../src/providers/github-coding.js';

function broker() {
  const value = new CredentialBroker();
  value.connect({
    principal_id: 'user:test',
    service: 'github',
    account_id: 'developer',
    auth_kind: 'github-token',
    credential: { access_token: 'secret' }
  });
  return value;
}

function mission(actions) {
  return {
    version: '0.1',
    mission_id: 'mission:github-coding-provider-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'exercise coding workflow provider operations',
    resources: [{ service: 'github', allow: actions, deny: [], constraints: {} }]
  };
}

test('git.ref.read maps a branch read and exposes only canonical branch/SHA output', async () => {
  const calls = [];
  const adapter = createGitHubProviderAdapter({
    broker: broker(),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        ref: 'refs/heads/main',
        object: { sha: 'a'.repeat(40), type: 'commit' }
      }), { status: 200, headers: { 'x-github-request-id': 'REF-READ' } });
    }
  });

  const request = {
    service: 'github',
    action: 'git.ref.read',
    context: { repository: 'acme/app', branch: 'main' }
  };
  const output = await adapter.execute({ mission: mission(['git.ref.read']), request });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/app/git/ref/heads/main');
  assert.equal(output.branch, 'main');
  assert.equal(output.ref, 'refs/heads/main');
  assert.equal(output.sha, 'a'.repeat(40));
  assert.deepEqual(
    githubGitRefShaAuthorityExtractor({ receipt: { service: 'github', action: 'git.ref.read' }, output }),
    { extractor_id: 'github.git.ref.sha.v1', selector: 'output.sha' }
  );
});

test('git.ref.create maps exact branch and SHA and supports branch authority extraction', async () => {
  const calls = [];
  const sha = 'b'.repeat(40);
  const adapter = createGitHubProviderAdapter({
    broker: broker(),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        ref: 'refs/heads/agent/issue-42',
        object: { sha, type: 'commit' }
      }), { status: 201 });
    }
  });

  const request = {
    service: 'github',
    action: 'git.ref.create',
    context: {
      repository: 'acme/app',
      branch: 'agent/issue-42',
      sha
    }
  };
  const output = await adapter.execute({ mission: mission(['git.ref.create']), request });

  assert.equal(calls[0].url, 'https://api.github.com/repos/acme/app/git/refs');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    ref: 'refs/heads/agent/issue-42',
    sha
  });
  assert.equal(adapter.isMutation(request), true);
  assert.deepEqual(
    githubGitRefCreateBranchAuthorityExtractor({ receipt: { service: 'github', action: 'git.ref.create' }, output }),
    { extractor_id: 'github.git.ref.create.branch.v1', selector: 'output.branch' }
  );
});

test('unsafe branch names and repository paths fail before provider execution', () => {
  const adapter = createGitHubProviderAdapter({ broker: broker(), fetchImpl: async () => { throw new Error('must not run'); } });

  for (const branch of ['../main', 'agent//x', 'agent/x.lock', 'agent x', '/main']) {
    assert.throws(
      () => adapter.validateRequest({
        service: 'github',
        action: 'git.ref.create',
        context: { repository: 'acme/app', branch, sha: 'c'.repeat(40) }
      }),
      (error) => error.code === 'invalid_git_branch'
    );
  }

  for (const path of ['../secret', 'src/../secret', '/etc/passwd', 'src\\secret', 'src//x']) {
    assert.throws(
      () => adapter.validateRequest({
        service: 'github',
        action: 'repo.contents.write',
        context: {
          repository: 'acme/app',
          path,
          branch: 'agent/issue-42',
          message: 'test',
          content_base64: 'eA=='
        }
      }),
      (error) => error.code === 'invalid_repository_path'
    );
  }
});

test('changed-path extractor accepts only canonical contents-write evidence shape', () => {
  const output = {
    provider: 'github',
    body: {
      content: { path: 'src/auth.js', sha: 'd'.repeat(40) },
      commit: { sha: 'e'.repeat(40) }
    }
  };

  assert.deepEqual(
    githubContentsWritePathAuthorityExtractor({
      receipt: { service: 'github', action: 'repo.contents.write' },
      output
    }),
    { extractor_id: 'github.repo.contents.write.path.v1', selector: 'output.body.content.path' }
  );

  assert.throws(
    () => githubContentsWritePathAuthorityExtractor({
      receipt: { service: 'github', action: 'repo.contents.read' },
      output
    }),
    (error) => error.code === 'trusted_extractor_operation_mismatch'
  );

  assert.throws(
    () => githubContentsWritePathAuthorityExtractor({
      receipt: { service: 'github', action: 'repo.contents.write' },
      output: { provider: 'github', body: { content: { path: '../secret' } } }
    }),
    (error) => error.code === 'trusted_extractor_output_invalid'
  );
});
