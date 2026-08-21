import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import { MissionMcpGateway, contextFromToolArguments } from '../src/mcp-gateway.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:mcp-test',
    principal: { id: 'user:test' },
    agent: { id: 'agent:web-test' },
    objective: 'Read approved repository information through MCP',
    resources: [
      {
        service: 'mcp:github',
        allow: ['tool.get_file', 'tool.list_issues'],
        deny: ['tool.delete*'],
        constraints: { repository: ['Null-Square/*'] }
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
          { name: 'get_file', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } },
          { name: 'list_issues', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } },
          { name: 'delete_repo', annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: { type: 'object' } },
          { name: 'mystery_tool', inputSchema: { type: 'object' } }
        ]
      };
    },
    async callTool(params) {
      calls.push(params);
      return { content: [{ type: 'text', text: `called:${params.name}` }] };
    }
  };
}

test('context mapper exposes top-level scalar tool arguments for mission constraints', () => {
  assert.deepEqual(contextFromToolArguments('get_file', {
    repository: 'Null-Square/agent-authority',
    path: 'README.md',
    nested: { ignored: true },
    list: ['ignored']
  }), {
    tool_name: 'get_file',
    repository: 'Null-Square/agent-authority',
    path: 'README.md'
  });
});

test('tools/list hides denied, unknown and non-read-only tools by default', async () => {
  const upstream = fakeUpstream();
  const gateway = new MissionMcpGateway({
    mission: mission(),
    runtime: new AuthorityRuntime(),
    upstream,
    service: 'mcp:github'
  });

  const listed = await gateway.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ['get_file', 'list_issues']);
});

test('authorized read-only MCP tool reaches upstream and gets authority metadata', async () => {
  const upstream = fakeUpstream();
  const gateway = new MissionMcpGateway({
    mission: mission(),
    runtime: new AuthorityRuntime(),
    upstream,
    service: 'mcp:github'
  });

  const result = await gateway.callTool({
    name: 'get_file',
    arguments: { repository: 'Null-Square/agent-authority', path: 'README.md' }
  });

  assert.equal(result.isError, undefined);
  assert.equal(upstream.calls.length, 1);
  assert.equal(result._meta['io.nullsquare.agent-authority/decision'], 'allow');
  assert.match(result._meta['io.nullsquare.agent-authority/receipt_hash'], /^[a-f0-9]{64}$/);
});

test('resource mismatch is denied before upstream execution', async () => {
  const upstream = fakeUpstream();
  const gateway = new MissionMcpGateway({
    mission: mission(),
    runtime: new AuthorityRuntime(),
    upstream,
    service: 'mcp:github'
  });

  const result = await gateway.callTool({
    name: 'get_file',
    arguments: { repository: 'OtherOrg/private', path: 'secret.txt' }
  });

  assert.equal(result.isError, true);
  assert.equal(result._meta['io.nullsquare.agent-authority/code'], 'resource_constraint_mismatch');
  assert.equal(upstream.calls.length, 0);
});

test('direct call to a non-read-only tool is blocked even if upstream exposes it', async () => {
  const upstream = fakeUpstream();
  const m = mission();
  m.resources[0].allow.push('tool.delete_repo');
  const gateway = new MissionMcpGateway({
    mission: m,
    runtime: new AuthorityRuntime(),
    upstream,
    service: 'mcp:github'
  });

  const result = await gateway.callTool({
    name: 'delete_repo',
    arguments: { repository: 'Null-Square/agent-authority' }
  });

  assert.equal(result.isError, true);
  assert.equal(result._meta['io.nullsquare.agent-authority/code'], 'mcp_write_disabled');
  assert.equal(upstream.calls.length, 0);
});

test('mission revocation blocks subsequent MCP calls', async () => {
  const upstream = fakeUpstream();
  const runtime = new AuthorityRuntime();
  const m = mission();
  const gateway = new MissionMcpGateway({ mission: m, runtime, upstream, service: 'mcp:github' });
  runtime.revoke(m.mission_id, 'test kill switch');

  const result = await gateway.callTool({
    name: 'list_issues',
    arguments: { repository: 'Null-Square/agent-authority' }
  });

  assert.equal(result.isError, true);
  assert.equal(result._meta['io.nullsquare.agent-authority/code'], 'mission_revoked');
  assert.equal(upstream.calls.length, 0);
});
