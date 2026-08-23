import { brokeredProviderAdapter } from '../connections.js';

const MUTATING_ACTIONS = new Set([
  'issue.create',
  'issue.comment',
  'git.ref.create',
  'pull_request.create',
  'repo.contents.write'
]);
const ISSUE_STATES = new Set(['open', 'closed', 'all']);

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function repoParts(context = {}) {
  const repository = required(context.repository, 'context.repository');
  const [owner, repo, ...extra] = String(repository).split('/');
  if (!owner || !repo || extra.length) throw new Error('context.repository must be owner/repo');
  return { owner, repo };
}

function repositoryPath(value, name = 'context.path') {
  const path = String(required(value, name));
  if (path.startsWith('/') || path.endsWith('/') || path.includes('\\')) {
    throw providerError('invalid_repository_path', `${name} must be a relative repository path`);
  }
  const segments = path.split('/');
  if (
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    [...path].some((char) => {
      const code = char.charCodeAt(0);
      return code === 0 || code === 127;
    })
  ) {
    throw providerError('invalid_repository_path', `${name} contains an unsafe path segment`);
  }
  return path;
}

function encodedPath(path) {
  return repositoryPath(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

function branchName(value, name = 'context.branch') {
  const branch = String(required(value, name));
  const segments = branch.split('/');
  const hasInvalidCharacter = [...branch].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 32 || code === 127 || '~^:?*[\\'.includes(char);
  });

  if (
    branch.length > 255 ||
    branch === '@' ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.startsWith('.') ||
    branch.endsWith('.') ||
    branch.includes('//') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    hasInvalidCharacter ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.endsWith('.lock'))
  ) {
    throw providerError('invalid_git_branch', `${name} is not a safe Git branch name`);
  }
  return branch;
}

function encodedBranch(value, name = 'context.branch') {
  return branchName(value, name).split('/').map(encodeURIComponent).join('/');
}

function gitSha(value, name = 'context.sha') {
  const sha = String(required(value, name));
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw providerError('invalid_git_sha', `${name} must be a 40-character Git SHA`);
  }
  return sha.toLowerCase();
}

function issueNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw providerError('invalid_issue_number', 'context.issue_number must be a positive integer');
  }
  return number;
}

function issueListQuery(context = {}) {
  const state = context.state || 'open';
  if (!ISSUE_STATES.has(state)) {
    throw providerError('invalid_issue_state', 'context.state must be open, closed, or all');
  }
  const perPage = context.per_page === undefined ? 100 : Number(context.per_page);
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) {
    throw providerError('invalid_issue_page_size', 'context.per_page must be an integer between 1 and 100');
  }
  return new URLSearchParams({ state, per_page: String(perPage) }).toString();
}

function buildOperation(request) {
  const context = request.context || {};
  const { owner, repo } = repoParts(context);
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  switch (request.action) {
    case 'repo.read':
      return { method: 'GET', path: root };

    case 'repo.contents.read': {
      const path = repositoryPath(context.path);
      const query = context.ref ? `?ref=${encodeURIComponent(branchName(context.ref, 'context.ref'))}` : '';
      return { method: 'GET', path: `${root}/contents/${encodedPath(path)}${query}` };
    }

    case 'issue.list':
      return { method: 'GET', path: `${root}/issues?${issueListQuery(context)}` };

    case 'issue.create':
      return {
        method: 'POST',
        path: `${root}/issues`,
        body: {
          title: required(context.title, 'context.title'),
          body: context.body || undefined,
          labels: context.labels || undefined,
          assignees: context.assignees || undefined
        }
      };

    case 'issue.comment':
      return {
        method: 'POST',
        path: `${root}/issues/${issueNumber(context.issue_number)}/comments`,
        body: { body: required(context.body, 'context.body') }
      };

    case 'git.ref.read': {
      const branch = encodedBranch(context.branch);
      return { method: 'GET', path: `${root}/git/ref/heads/${branch}` };
    }

    case 'git.ref.create': {
      const branch = branchName(context.branch);
      return {
        method: 'POST',
        path: `${root}/git/refs`,
        body: {
          ref: `refs/heads/${branch}`,
          sha: gitSha(context.sha)
        }
      };
    }

    case 'pull_request.create':
      return {
        method: 'POST',
        path: `${root}/pulls`,
        body: {
          title: required(context.title, 'context.title'),
          head: branchName(context.head, 'context.head'),
          base: branchName(context.base, 'context.base'),
          body: context.body || undefined,
          draft: Boolean(context.draft)
        }
      };

    case 'repo.contents.write': {
      const path = repositoryPath(context.path);
      const content = required(context.content_base64, 'context.content_base64');
      return {
        method: 'PUT',
        path: `${root}/contents/${encodedPath(path)}`,
        body: {
          message: required(context.message, 'context.message'),
          content,
          sha: context.sha || undefined,
          branch: context.branch ? branchName(context.branch) : undefined
        }
      };
    }

    default:
      throw providerError('unsupported_action', `GitHub action ${request.action} has no provider operation mapping`);
  }
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const clone = structuredClone(body);
  for (const key of ['token', 'access_token', 'refresh_token', 'authorization']) {
    if (key in clone) clone[key] = '[redacted]';
  }
  return clone;
}

function normalizeIssueList(request, body) {
  if (!Array.isArray(body)) {
    throw providerError('github_issue_list_invalid', 'GitHub issue.list response must be an array');
  }

  const issues = body.map((issue) => ({
    number: issueNumber(issue?.number),
    title: typeof issue?.title === 'string' ? issue.title : null,
    is_pull_request: Boolean(issue?.pull_request)
  }));

  const marker = request.context?.fixture_marker;
  if (typeof marker !== 'string' || marker.trim() === '') {
    return { issues, selected_issue_number: null, selected_issue_title: null, selected_issue_match_count: 0, selected_issue_marker: null };
  }

  const matches = body
    .map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => !issue?.pull_request && typeof issue?.body === 'string' && issue.body.includes(marker));

  const selected = matches.length === 1 ? issues[matches[0].index] : null;
  return {
    issues,
    selected_issue_number: selected?.number || null,
    selected_issue_title: selected?.title || null,
    selected_issue_match_count: matches.length,
    selected_issue_marker: marker
  };
}

function normalizeGitRef(request, body) {
  const expectedBranch = branchName(request.context?.branch);
  const ref = typeof body?.ref === 'string' ? body.ref : null;
  const expectedRef = `refs/heads/${expectedBranch}`;
  if (ref !== expectedRef) {
    throw providerError('github_git_ref_invalid', `GitHub ${request.action} response did not match requested branch`);
  }
  return {
    branch: expectedBranch,
    ref,
    sha: gitSha(body?.object?.sha, 'provider git ref sha')
  };
}

function normalizePullRequest(request, body) {
  const number = issueNumber(body?.number);
  const head = typeof body?.head?.ref === 'string'
    ? branchName(body.head.ref, 'provider pull request head')
    : branchName(request.context?.head, 'context.head');
  const base = typeof body?.base?.ref === 'string'
    ? branchName(body.base.ref, 'provider pull request base')
    : branchName(request.context?.base, 'context.base');
  if (head !== branchName(request.context?.head, 'context.head') || base !== branchName(request.context?.base, 'context.base')) {
    throw providerError('github_pull_request_invalid', 'GitHub pull request response did not match requested head/base');
  }
  return {
    pull_request_number: number,
    html_url: body?.html_url || null,
    head,
    base,
    draft: Boolean(body?.draft)
  };
}

function normalizedOutput(request, response, body) {
  const common = {
    provider: 'github',
    status: response.status,
    ok: response.ok,
    request_id: response.headers?.get?.('x-github-request-id') || null
  };

  if (request.action === 'issue.list') {
    return { ...common, ...normalizeIssueList(request, body) };
  }

  if (request.action === 'issue.comment') {
    return {
      ...common,
      comment_id: body?.id || null,
      html_url: body?.html_url || null,
      issue_number: issueNumber(request.context?.issue_number)
    };
  }

  if (request.action === 'git.ref.read' || request.action === 'git.ref.create') {
    return { ...common, ...normalizeGitRef(request, body) };
  }

  if (request.action === 'pull_request.create') {
    return { ...common, ...normalizePullRequest(request, body) };
  }

  return { ...common, body: sanitizeBody(body) };
}

/**
 * Reviewed authority extractor for an issue selected by the normalized
 * issue.list mapping using the request's root-bound fixture_marker.
 *
 * The extractor returns a selector only. TaskLease resolves the issue number
 * from the evidence-bound output after verifying the ALLOW receipt.
 */
export function githubIssueListSelectedNumberAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'issue.list') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'GitHub issue-number authority extractor only accepts github:issue.list receipts'
    );
  }
  if (output?.provider !== 'github' || output?.selected_issue_match_count !== 1) {
    throw providerError(
      'trusted_extractor_output_invalid',
      'normalized GitHub output must contain exactly one selected issue'
    );
  }
  issueNumber(output.selected_issue_number);
  if (typeof output.selected_issue_marker !== 'string' || output.selected_issue_marker.trim() === '') {
    throw providerError('trusted_extractor_output_invalid', 'normalized GitHub output is missing the selection marker');
  }

  return {
    extractor_id: 'github.issue.list.selected-number.v1',
    selector: 'output.selected_issue_number'
  };
}

/**
 * Reviewed extractor for the exact commit SHA returned by a guarded Git ref read.
 */
export function githubGitRefShaAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'git.ref.read') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'GitHub ref SHA authority extractor only accepts github:git.ref.read receipts'
    );
  }
  if (output?.provider !== 'github') {
    throw providerError('trusted_extractor_output_invalid', 'normalized GitHub ref output is required');
  }
  gitSha(output.sha, 'normalized GitHub ref sha');
  branchName(output.branch, 'normalized GitHub ref branch');
  return {
    extractor_id: 'github.git.ref.sha.v1',
    selector: 'output.sha'
  };
}

/**
 * Reviewed extractor for the exact PR number created by a guarded GitHub request.
 */
export function githubPullRequestCreateNumberAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'pull_request.create') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'GitHub PR-number authority extractor only accepts github:pull_request.create receipts'
    );
  }
  if (output?.provider !== 'github') {
    throw providerError('trusted_extractor_output_invalid', 'normalized GitHub pull request output is required');
  }
  issueNumber(output.pull_request_number);
  branchName(output.head, 'normalized GitHub pull request head');
  branchName(output.base, 'normalized GitHub pull request base');
  return {
    extractor_id: 'github.pull-request.create.number.v1',
    selector: 'output.pull_request_number'
  };
}

export function createGitHubProviderAdapter({ broker, fetchImpl = globalThis.fetch, baseUrl = 'https://api.github.com' } = {}) {
  if (!broker) throw new Error('credential broker is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const adapter = brokeredProviderAdapter({
    kind: 'github-rest',
    services: ['github'],
    broker,
    async execute({ request, credential }) {
      const operation = buildOperation(request);
      const token = typeof credential === 'string' ? credential : credential?.access_token;
      if (!token) throw new Error('GitHub credential does not contain an access token');

      const response = await fetchImpl(`${baseUrl}${operation.path}`, {
        method: operation.method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'nullsquare-agent-authority/0.4'
        },
        body: operation.body ? JSON.stringify(operation.body) : undefined
      });

      const text = await response.text();
      let body = text;
      if (text) {
        try { body = JSON.parse(text); } catch { /* preserve text */ }
      }

      if (!response.ok) {
        const output = {
          provider: 'github',
          status: response.status,
          ok: false,
          body: sanitizeBody(body),
          request_id: response.headers?.get?.('x-github-request-id') || null
        };
        const error = providerError('provider_error', `GitHub API ${response.status}`);
        error.provider_output = output;
        throw error;
      }

      return normalizedOutput(request, response, body);
    }
  });

  adapter.validateRequest = (request) => buildOperation(request);
  adapter.isMutation = (request) => MUTATING_ACTIONS.has(request?.action);
  adapter.authorityExtractor = (request, kind = 'opaque') => {
    if (
      request?.service === 'github' &&
      request?.action === 'issue.list' &&
      kind === 'github.issue.number' &&
      typeof request?.context?.fixture_marker === 'string' &&
      request.context.fixture_marker.trim() !== ''
    ) {
      return githubIssueListSelectedNumberAuthorityExtractor;
    }
    if (request?.service === 'github' && request?.action === 'git.ref.read' && kind === 'github.git.sha') {
      return githubGitRefShaAuthorityExtractor;
    }
    if (request?.service === 'github' && request?.action === 'pull_request.create' && kind === 'github.pull_request.number') {
      return githubPullRequestCreateNumberAuthorityExtractor;
    }
    return null;
  };
  return adapter;
}
