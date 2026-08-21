import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRuntimeEnvironment } from './runtime-env.js';
import { writeReceipt } from './storage.js';
import { bearerToken, verifyAgentToken } from './agent-auth.js';

async function readJson(req, maxBytes = 1024 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('request body too large');
      error.code = 'payload_too_large';
      throw error;
    }
  }
  return body ? JSON.parse(body) : {};
}

function send(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(body);
}

function persistReceipt(config, output) {
  if (output?.receipt) writeReceipt(config.paths.receipts, output.receipt);
  return output;
}

function authenticate(req, env, options = {}) {
  const token = bearerToken(req.headers);
  return verifyAgentToken(token, {
    key: env.agentAuthKey,
    principal_id: env.config.principal_id,
    ...options
  });
}

function authStatus(error) {
  if (['missing_agent_token', 'invalid_agent_token', 'agent_token_expired'].includes(error?.code)) return 401;
  if (['principal_mismatch', 'mission_binding_mismatch', 'agent_identity_mismatch', 'agent_capability_denied'].includes(error?.code)) return 403;
  return null;
}

export function createAgentAuthorityServer({ home, host, port } = {}) {
  const env = createRuntimeEnvironment({ home });
  const bindHost = host ?? process.env.AGENT_AUTHORITY_HOST ?? env.config.server.host ?? '127.0.0.1';
  const bindPort = Number(port ?? process.env.AGENT_AUTHORITY_PORT ?? env.config.server.port ?? 8787);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${bindHost}:${bindPort}`}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, { ok: true, service: 'agent-authority', version: '0.3.0' });
      }

      if (req.method === 'GET' && url.pathname === '/.well-known/agent-authority') {
        return send(res, 200, {
          service: 'agent-authority',
          version: '0.3.0',
          api_version: 'v1',
          authorization: { scheme: 'Bearer', token_type: 'agent-instance', mission_binding: true },
          endpoints: {
            evaluate: '/v1/evaluate',
            prepare: '/v1/prepare',
            execute: '/v1/execute',
            approval: '/v1/approvals/{approval_id}'
          }
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/connections') {
        authenticate(req, env, { capability: 'connections.read' });
        return send(res, 200, { connections: env.broker.listConnections(env.config.principal_id) });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/approvals/')) {
        const approvalId = decodeURIComponent(url.pathname.slice('/v1/approvals/'.length));
        const approval = env.approvals.get(approvalId);
        if (!approval) return send(res, 404, { error: 'approval not found' });
        const claims = authenticate(req, env, { capability: 'approval.read', mission_id: approval.mission_id });
        if (claims.sub !== approval.agent_id) return send(res, 403, { error: 'approval belongs to another agent', code: 'agent_identity_mismatch' });
        return send(res, 200, { approval });
      }

      if (req.method === 'POST' && url.pathname === '/v1/evaluate') {
        const { mission, request } = await readJson(req);
        authenticate(req, env, { capability: 'evaluate', mission });
        return send(res, 200, persistReceipt(env.config, env.runtime.evaluate(mission, request)));
      }

      if (req.method === 'POST' && url.pathname === '/v1/prepare') {
        const { mission, request } = await readJson(req);
        authenticate(req, env, { capability: 'prepare', mission });
        return send(res, 200, persistReceipt(env.config, await env.runtime.prepare(mission, request)));
      }

      if (req.method === 'POST' && url.pathname === '/v1/execute') {
        const { mission, request } = await readJson(req);
        authenticate(req, env, { capability: 'execute', mission });
        const result = persistReceipt(env.config, await env.runtime.execute(mission, request));
        const status = result.result?.code === 'connection_required' ? 409 : 200;
        return send(res, status, result);
      }

      if (req.method === 'POST' && url.pathname === '/v1/revoke') {
        const { mission_id, reason } = await readJson(req);
        if (!mission_id) return send(res, 400, { error: 'mission_id is required' });
        authenticate(req, env, { capability: 'mission.revoke', mission_id });
        return send(res, 200, { mission_id, ...env.runtime.revoke(mission_id, reason) });
      }

      return send(res, 404, { error: 'not found' });
    } catch (error) {
      if (error?.code === 'provider_error' && error.provider_output) {
        return send(res, 502, { error: error.message, provider: error.provider_output });
      }
      const authenticationStatus = authStatus(error);
      if (authenticationStatus) return send(res, authenticationStatus, { error: error.message, code: error.code });
      const status = error?.code === 'payload_too_large' ? 413 : 400;
      return send(res, status, { error: error.message, code: error.code || 'bad_request' });
    }
  });

  return { server, env, host: bindHost, port: bindPort };
}

export function startServer(options = {}) {
  const instance = createAgentAuthorityServer(options);
  instance.server.listen(instance.port, instance.host, () => {
    const address = instance.server.address();
    const actualPort = typeof address === 'object' && address ? address.port : instance.port;
    console.log(`Agent Authority listening on http://${instance.host}:${actualPort}`);
    console.log('API authentication: signed agent-instance bearer tokens required');
  });
  return instance;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
