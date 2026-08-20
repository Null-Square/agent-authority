import http from 'node:http';
import { AdapterRegistry, AuthorityRuntime, descriptorAdapter } from './index.js';

const host = process.env.AGENT_AUTHORITY_HOST || '127.0.0.1';
const port = Number(process.env.AGENT_AUTHORITY_PORT || 8787);

const adapters = new AdapterRegistry()
  .register(descriptorAdapter('oauth', ['github', 'google', 'slack']))
  .register(descriptorAdapter('mcp', ['mcp:*']))
  .register(descriptorAdapter('api-key', ['cloudflare', 'apollo']))
  .register(descriptorAdapter('cli', ['cli:*']));

const runtime = new AuthorityRuntime({ adapters });

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, service: 'agent-authority', version: '0.1.0' });
    }

    if (req.method === 'POST' && req.url === '/v1/evaluate') {
      const { mission, request } = await readJson(req);
      return send(res, 200, runtime.evaluate(mission, request));
    }

    if (req.method === 'POST' && req.url === '/v1/prepare') {
      const { mission, request } = await readJson(req);
      return send(res, 200, await runtime.prepare(mission, request));
    }

    if (req.method === 'POST' && req.url === '/v1/revoke') {
      const { mission_id, reason } = await readJson(req);
      if (!mission_id) return send(res, 400, { error: 'mission_id is required' });
      return send(res, 200, { mission_id, ...runtime.revoke(mission_id, reason) });
    }

    return send(res, 404, { error: 'not found' });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Agent Authority listening on http://${host}:${port}`);
});
