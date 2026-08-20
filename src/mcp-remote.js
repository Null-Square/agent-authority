import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { MissionMcpGateway } from './mcp-gateway.js';

export class RemoteMcpUpstream {
  constructor({ url, name = 'agent-authority-upstream', fetchImpl } = {}) {
    if (!url) throw new Error('upstream MCP URL is required');
    this.url = new URL(url);
    this.name = name;
    this.fetchImpl = fetchImpl;
    this.client = null;
    this.connecting = null;
  }

  async ensureClient() {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const client = new Client(
        { name: this.name, version: '0.3.0' },
        { versionNegotiation: { mode: 'auto' } }
      );
      const transport = new StreamableHTTPClientTransport(
        this.url,
        this.fetchImpl ? { fetch: this.fetchImpl } : undefined
      );
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async listTools(params = undefined) {
    return (await this.ensureClient()).listTools(params);
  }

  async callTool(params) {
    return (await this.ensureClient()).callTool(params);
  }

  async close() {
    const client = this.client;
    this.client = null;
    if (client) await client.close();
  }
}

export function createMcpGatewayHandler({
  mission,
  runtime,
  upstream,
  upstreamUrl,
  service = 'mcp:upstream',
  readOnly = true
} = {}) {
  const resolvedUpstream = upstream || new RemoteMcpUpstream({ url: upstreamUrl });
  const gateway = new MissionMcpGateway({
    mission,
    runtime,
    upstream: resolvedUpstream,
    service,
    readOnly
  });

  const handler = createMcpHandler(() => {
    const server = new McpServer(
      {
        name: 'agent-authority-gateway',
        version: '0.3.0',
        description: 'Mission-aware policy gateway for MCP tools'
      },
      { capabilities: { tools: {} } }
    );

    server.server.setRequestHandler('tools/list', async (request) => {
      return gateway.listTools(request.params);
    });

    server.server.setRequestHandler('tools/call', async (request) => {
      return gateway.callTool(request.params);
    });

    return server;
  });

  return {
    handler,
    gateway,
    upstream: resolvedUpstream,
    async close() {
      await handler.close();
      if (typeof resolvedUpstream.close === 'function') await resolvedUpstream.close();
    }
  };
}
