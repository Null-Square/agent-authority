import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AuthorityRuntime } from '../src/index.js';
import { createMcpGatewayHandler } from '../src/mcp-remote.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:mcp-wire-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:mcp-client' },
    objective: 'Read public repository metadata through an MCP gateway',
    resources: [
      {
        service: 'mcp:test',
        allow: ['tool.repo_info'],
        deny: []
      }
    ]
  };
}

function fakeUpstream() {
  const calls = [];
  return {
    calls,
    async listTools() {
      return {
        tools: [
          {
            name: 'repo_info',
            description: 'Read repository metadata',
            annotations: { readOnlyHint: true },
            inputSchema: {
              type: 'object',
              properties: { repository: { type: 'string' } },
              required: ['repository']
            }
          },
          {
            name: 'delete_repo',
            description: 'Delete a repository',
            annotations: { readOnlyHint: false, destructiveHint: true },
            inputSchema: { type: 'object' }
          }
        ]
      };
    },
    async callTool(params) {
      calls.push(params);
      return { content: [{ type: 'text', text: `repo:${params.arguments.repository}` }] };
    },
    async close() {}
  };
}

test('official MCP v2 client sees only mission-authorized read-only tools and can call them', async () => {
  const upstream = fakeUpstream();
  const gateway = createMcpGatewayHandler({
    mission: mission(),
    runtime: new AuthorityRuntime(),
    upstream,
    service: 'mcp:test'
  });

  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => gateway.handler.fetch(new Request(url, init))
  });
  const client = new Client(
    { name: 'agent-authority-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), ['repo_info']);

    const result = await client.callTool({
      name: 'repo_info',
      arguments: { repository: 'Null-Square/agent-authority' }
    });
    assert.equal(result.isError, undefined);
    assert.equal(upstream.calls.length, 1);
    assert.equal(result.content[0].text, 'repo:Null-Square/agent-authority');
  } finally {
    await client.close();
    await gateway.close();
  }
});
