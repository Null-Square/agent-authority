import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialBroker } from '../src/connections.js';
import {
  createGitHubProviderAdapter,
  githubIssueListSelectedNumberAuthorityExtractor
} from '../src/providers/github.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:github-provider-evidence-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'test GitHub issue mappings',
    resources: [{
      service: 'github',
      allow: ['issue.list', 'issue.comment'],
      deny: [],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }]
  };
}

function connectedBroker() {
  const broker = new CredentialBroker();
  broker.connect({
    principal_id: 'user:test',
    service: 'github',
    auth_kind: 'oauth',
    credential: { access_token: 'secret-github-token' },
    scopes: ['issues:write']
  });
  return broker;
}

test('GitHub issue.list normalizes one root-bound marker match without exposing issue bodies', async () => {
  const calls = [];
  const adapter = createGitHubProviderAdapter({
    broker: connectedBroker(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([
        { number: 9, title: 'Authority fixture', body: 'prefix fixture-marker-91 suffix' },
        { number: 10, title: 'Ordinary issue', body: 'unrelated' },
        { number: 11, title: 'PR-shaped result', body: 'fixture-marker-91', pull_request: { url: 'x' } }
      ]), {
        status: 200,
        headers: { 'x-github-request-id': 'REQ-91' }
      });
    }
  });

  const request = {
    service: 'github',
    action: 'issue.list',
    context: {
      repository: 'Null-Square/agent-authority',
      fixture_marker: 'fixture-marker-91',
      state: 'open',
      per_page: 100
    }
  };

  const output = await adapter.execute({ mission: mission(), request });

  assert.match(calls[0].url, /repos\/Null-Square\/agent-authority\/issues\?state=open&per_page=100/);
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-github-token');
  assert.equal(output.selected_issue_number, 9);
  assert.equal(output.selected_issue_title, 'Authority fixture');
  assert.equal(output.selected_issue_match_count, 1);
  assert.equal(output.selected_issue_marker, 'fixture-marker-91');
  assert.equal(JSON.stringify(output).includes('prefix fixture-marker-91 suffix'), false);
  assert.equal(JSON.stringify(output).includes('secret-github-token'), false);
});

test('GitHub issue.comment maps the exact issue number and comment body', async () => {
  const calls = [];
  const adapter = createGitHubProviderAdapter({
    broker: connectedBroker(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 1234, html_url: 'https://github.com/example/comment/1234' }), { status: 201 });
    }
  });

  const output = await adapter.execute({
    mission: mission(),
    request: {
      service: 'github',
      action: 'issue.comment',
      context: {
        repository: 'Null-Square/agent-authority',
        issue_number: 9,
        body: 'evidence-derived comment'
      }
    }
  });

  assert.equal(calls[0].url, 'https://api.github.com/repos/Null-Square/agent-authority/issues/9/comments');
  assert.deepEqual(JSON.parse(calls[0].options.body), { body: 'evidence-derived comment' });
  assert.equal(output.comment_id, 1234);
  assert.equal(output.issue_number, 9);
  assert.equal(adapter.isMutation({ service: 'github', action: 'issue.comment' }), true);
});

test('GitHub issue-number extractor requires canonical issue.list selection output', () => {
  const descriptor = githubIssueListSelectedNumberAuthorityExtractor({
    receipt: { service: 'github', action: 'issue.list' },
    output: {
      provider: 'github',
      selected_issue_number: 9,
      selected_issue_match_count: 1,
      selected_issue_marker: 'fixture-marker-91'
    }
  });

  assert.deepEqual(descriptor, {
    extractor_id: 'github.issue.list.selected-number.v1',
    selector: 'output.selected_issue_number'
  });

  assert.throws(
    () => githubIssueListSelectedNumberAuthorityExtractor({
      receipt: { service: 'github', action: 'issue.comment' },
      output: {
        provider: 'github',
        selected_issue_number: 9,
        selected_issue_match_count: 1,
        selected_issue_marker: 'fixture-marker-91'
      }
    }),
    (error) => error.code === 'trusted_extractor_operation_mismatch'
  );

  assert.throws(
    () => githubIssueListSelectedNumberAuthorityExtractor({
      receipt: { service: 'github', action: 'issue.list' },
      output: {
        provider: 'github',
        selected_issue_number: 9,
        selected_issue_match_count: 2,
        selected_issue_marker: 'fixture-marker-91'
      }
    }),
    (error) => error.code === 'trusted_extractor_output_invalid'
  );
});

test('GitHub adapter advertises authority extraction only for marker-bound issue.list requests', () => {
  const adapter = createGitHubProviderAdapter({ broker: connectedBroker(), fetchImpl: async () => new Response('[]') });
  const request = {
    service: 'github',
    action: 'issue.list',
    context: { repository: 'Null-Square/agent-authority', fixture_marker: 'fixture-marker-91' }
  };

  assert.equal(adapter.authorityExtractor(request, 'github.issue.number'), githubIssueListSelectedNumberAuthorityExtractor);
  assert.equal(adapter.authorityExtractor({ ...request, context: { repository: 'Null-Square/agent-authority' } }, 'github.issue.number'), null);
  assert.equal(adapter.authorityExtractor(request, 'email.address'), null);
  assert.equal(adapter.authorityExtractor({ service: 'github', action: 'issue.comment', context: request.context }, 'github.issue.number'), null);
});
