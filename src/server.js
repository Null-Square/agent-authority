import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRuntimeEnvironment } from './runtime-env.js';
import { writeReceipt } from './storage.js';

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
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function persistReceipt(config, output) {
  if (output?.receipt) writeReceipt(config.paths.receipts, output.receipt);
  return output;
}

export function createAgentAuthorityServer({ home, host, port } = {}) {
  const env = createRuntimeEnvironment({ home });
  const bindHost = host || process.env.AGENT_AUTHORITY_HOST || env.config.server.host || '127.0.0.1';
  const bindPort = Number(port || process.env.AGENT_AUTHORITY_PORT || env.config.server.port || 8787);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${bindHost}:${bindPort}`}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, { ok: true, service: 'agent-authority', version: '0.2.0', principal_id: env.config.principal_id });
      }

      if (req.method === 'GET' && url.pathname === '/v1/connections') {
        const principalId = url.searchParams.get('principal_id') || env.config.principal_id;
        if (principalId !== env.config.principal_id) return send(res, 403, { error: 'principal mismatch' });
        return send(res, 200, { connections: env.broker.listConnections(principalId) });
      }

      if (req.method === 'POST' && url.pathname === '/v1/evaluate') {
        const { mission, request } = await readJson(req);
        return send(res, 200, persistReceipt(env.config, env.runtime.evaluate(mission, request)));
      }

      if (req.method === 'POST' && url.pathname === '/v1/prepare') {
        const { mission, request } = await readJson(req);
        return send(res, 200, persistReceipt(env.config, await env.runtime.prepare(mission, request)));
      }

      if (req.method === 'POST' && url.pathname === '/v1/execute') {
        const { mission, request } = await readJson(req);
        const result = persistReceipt(env.config, await env.runtime.execute(mission, request));
        const status = result.result?.code === 'connection_required' ? 409 : 200;
        return send(res, status, result);
      }

      if (req.method === 'POST' && url.pathname === '/v1/revoke') {
        const { mission_id, reason } = await readJson(req);
        if (!mission_id) return send(res, 400, { error: 'mission_id is required' });
        return send(res, 200, { mission_id, ...env.runtime.revoke(mission_id, reason) });
      }

      return send(res, 404, { error: 'not found' });
    } catch (error) {
      if (error?.code === 'provider_error' && error.provider_output) {
        return send(res, 502, { error: error.message, provider: error.provider_output });
      }
      const status = error?.code === 'payload_too_large' ? 413 : 400;
      return send(res, status, { error: error.message, code: error.code || 'bad_request' });
    }
  });

  return { server, env, host: bindHost, port: bindPort };
}

export function startServer(options = {}) {
  const instance = createAgentAuthorityServer(options);
  instance.server.listen(instance.port, instance.host, () => {
    console.log(`Agent Authority listening on http://${instance.host}:${instance.port}`);
    console.log(`Principal: ${instance.env.config.principal_id}`);
  });
  return instance;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
