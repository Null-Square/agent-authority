import http from 'node:http';
import { AdapterRegistry, descriptorAdapter } from './index.js';
import { CredentialBroker } from './connections.js';
import { ExecutingAuthorityRuntime } from './execution.js';
import { createGitHubProviderAdapter } from './providers/github.js';

const host = process.env.AGENT_AUTHORITY_HOST || '127.0.0.1';
const port = Number(process.env.AGENT_AUTHORITY_PORT || 8787);

const broker = new CredentialBroker();

// Development bridge only: lets a developer prove the no-secret-in-model
// execution path before the browser OAuth connection flow lands. Production
// deployments should use a durable encrypted vault and provider OAuth flow.
if (process.env.AGENT_AUTHORITY_GITHUB_TOKEN) {
  broker.connect({
    principal_id: process.env.AGENT_AUTHORITY_PRINCIPAL_ID || 'user:local',
    service: 'github',
    account_id: process.env.AGENT_AUTHORITY_GITHUB_ACCOUNT || 'default',
    auth_kind: 'environment-development-token',
    credential: { access_token: process.env.AGENT_AUTHORITY_GITHUB_TOKEN },
    scopes: []
  });
}

const adapters = new AdapterRegistry()
  .register(createGitHubProviderAdapter({ broker }))
  .register(descriptorAdapter('oauth', ['google', 'slack', 'microsoft']))
  .register(descriptorAdapter('mcp', ['mcp:*']))
  .register(descriptorAdapter('api-key', ['cloudflare', 'apollo']))
  .register(descriptorAdapter('cli', ['cli:*']));

const runtime = new ExecutingAuthorityRuntime({ adapters });

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function urlFor(req) {
  return new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = urlFor(req);

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'agent-authority', version: '0.1.0' });
    }

    if (req.method === 'GET' && url.pathname === '/v1/connections') {
      const principalId = url.searchParams.get('principal_id');
      if (!principalId) return send(res, 400, { error: 'principal_id is required' });
      return send(res, 200, { connections: broker.listConnections(principalId) });
    }

    if (req.method === 'POST' && url.pathname === '/v1/evaluate') {
      const { mission, request } = await readJson(req);
      return send(res, 200, runtime.evaluate(mission, request));
    }

    if (req.method === 'POST' && url.pathname === '/v1/prepare') {
      const { mission, request } = await readJson(req);
      return send(res, 200, await runtime.prepare(mission, request));
    }

    if (req.method === 'POST' && url.pathname === '/v1/execute') {
      const { mission, request } = await readJson(req);
      const output = await runtime.execute(mission, request);
      const status = output.result?.code === 'connection_required' ? 409 : 200;
      return send(res, status, output);
    }

    if (req.method === 'POST' && url.pathname === '/v1/revoke') {
      const { mission_id, reason } = await readJson(req);
      if (!mission_id) return send(res, 400, { error: 'mission_id is required' });
      return send(res, 200, { mission_id, ...runtime.revoke(mission_id, reason) });
    }

    return send(res, 404, { error: 'not found' });
  } catch (error) {
    if (error?.code === 'provider_error' && error.provider_output) {
      return send(res, 502, { error: error.message, provider: error.provider_output });
    }
    return send(res, 400, { error: error.message, code: error.code || 'bad_request' });
  }
});

server.listen(port, host, () => {
  console.log(`Agent Authority listening on http://${host}:${port}`);
});
