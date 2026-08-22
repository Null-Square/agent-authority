import http from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpGatewayHandler } from './mcp-remote.js';

function isLoopback(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function hostnameFromHostHeader(value = '') {
  if (value.startsWith('[')) return value.slice(1, value.indexOf(']'));
  return value.split(':')[0];
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

/**
 * Start the first safe Agent Authority MCP proxy surface.
 *
 * v0.3 intentionally binds loopback only and defaults to read-only MCP tools.
 * Remote web hosts should reach it through a trusted tunnel. Public binding is
 * deferred until OAuth protected-resource mode is implemented.
 */
export function createMcpProxyServer({
  mission,
  lease,
  runtime,
  upstream,
  upstreamUrl,
  service = 'mcp:upstream',
  host = '127.0.0.1',
  port = 8790
} = {}) {
  if (!isLoopback(host)) {
    throw new Error('public MCP binding is not supported yet; bind loopback and use a trusted MCP tunnel');
  }

  const gateway = createMcpGatewayHandler({
    mission,
    lease,
    runtime,
    upstream,
    upstreamUrl,
    service,
    readOnly: true
  });
  const nodeHandler = toNodeHandler(gateway.handler);

  const server = http.createServer(async (req, res) => {
    try {
      const requestHost = hostnameFromHostHeader(req.headers.host || '');
      if (requestHost && !isLoopback(requestHost)) {
        return sendJson(res, 403, { error: 'host_not_allowed' });
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'agent-authority-mcp-gateway',
          mode: 'read-only',
          authority: lease ? 'task-lease' : 'mission',
          upstream: upstreamUrl || 'injected'
        });
      }
      if (url.pathname !== '/mcp') return sendJson(res, 404, { error: 'not_found' });
      return nodeHandler(req, res);
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  });

  return {
    server,
    gateway,
    host,
    port: Number(port),
    async close() {
      await new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => error ? reject(error) : resolve());
      });
      await gateway.close();
    }
  };
}

export async function startMcpProxyServer(options = {}) {
  const instance = createMcpProxyServer(options);
  await new Promise((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(instance.port, instance.host, () => {
      instance.server.off('error', reject);
      resolve();
    });
  });
  return instance;
}
