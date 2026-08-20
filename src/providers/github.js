import { brokeredProviderAdapter } from '../connections.js';

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function repoParts(context = {}) {
  const repository = required(context.repository, 'context.repository');
  const [owner, repo, ...extra] = String(repository).split('/');
  if (!owner || !repo || extra.length) throw new Error('context.repository must be owner/repo');
  return { owner, repo };
}

function encodedPath(path) {
  return String(path)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function buildOperation(request) {
  const context = request.context || {};
  const { owner, repo } = repoParts(context);
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  switch (request.action) {
    case 'repo.read':
      return { method: 'GET', path: root };

    case 'repo.contents.read': {
      const path = required(context.path, 'context.path');
      const query = context.ref ? `?ref=${encodeURIComponent(context.ref)}` : '';
      return { method: 'GET', path: `${root}/contents/${encodedPath(path)}${query}` };
    }

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

    case 'pull_request.create':
      return {
        method: 'POST',
        path: `${root}/pulls`,
        body: {
          title: required(context.title, 'context.title'),
          head: required(context.head, 'context.head'),
          base: required(context.base, 'context.base'),
          body: context.body || undefined,
          draft: Boolean(context.draft)
        }
      };

    case 'repo.contents.write': {
      const path = required(context.path, 'context.path');
      const content = required(context.content_base64, 'context.content_base64');
      return {
        method: 'PUT',
        path: `${root}/contents/${encodedPath(path)}`,
        body: {
          message: required(context.message, 'context.message'),
          content,
          sha: context.sha || undefined,
          branch: context.branch || undefined
        }
      };
    }

    default: {
      const error = new Error(`GitHub action ${request.action} has no provider operation mapping`);
      error.code = 'unsupported_action';
      throw error;
    }
  }
}

const SECRET_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'client_secret',
  'password',
  'secret'
]);

function sanitizeBody(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeBody(item, seen));
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  const clone = {};
  for (const [key, child] of Object.entries(value)) {
    clone[key] = SECRET_KEYS.has(String(key).toLowerCase())
      ? '[redacted]'
      : sanitizeBody(child, seen);
  }
  return clone;
}

export function createGitHubProviderAdapter({ broker, fetchImpl = globalThis.fetch, baseUrl = 'https://api.github.com' } = {}) {
  if (!broker) throw new Error('credential broker is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  return brokeredProviderAdapter({
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
          'user-agent': 'nullsquare-agent-authority/0.1'
        },
        body: operation.body ? JSON.stringify(operation.body) : undefined
      });

      const text = await response.text();
      let body = text;
      if (text) {
        try { body = JSON.parse(text); } catch { /* preserve text */ }
      }

      const output = {
        provider: 'github',
        status: response.status,
        ok: response.ok,
        body: sanitizeBody(body),
        request_id: response.headers?.get?.('x-github-request-id') || null
      };

      if (!response.ok) {
        const error = new Error(`GitHub API ${response.status}`);
        error.code = 'provider_error';
        error.provider_output = output;
        throw error;
      }

      return output;
    }
  });
}
