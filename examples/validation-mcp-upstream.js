import http from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

const host = process.env.VALIDATION_MCP_HOST || '127.0.0.1';
const port = Number(process.env.VALIDATION_MCP_PORT || 8791);

function createValidationServer() {
  const server = new McpServer({
    name: 'agent-authority-validation-upstream',
    version: '0.1.0',
    description: 'Tiny upstream used to validate Agent Authority with real public GitHub data.'
  });

  server.registerTool(
    'github_repo_metadata',
    {
      title: 'Read public GitHub repository metadata',
      description: 'Read public metadata for exactly one owner/repository value.',
      inputSchema: z.object({
        repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ repository }) => {
      const response = await fetch(`https://api.github.com/repos/${repository}`, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'nullsquare-agent-authority-validation'
        }
      });

      if (!response.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: `GitHub returned ${response.status}` }]
        };
      }

      const repo = await response.json();
      const output = {
        full_name: repo.full_name,
        description: repo.description,
        visibility: repo.visibility,
        default_branch: repo.default_branch,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        html_url: repo.html_url
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'dangerous_demo_write',
    {
      title: 'Validation-only fake write tool',
      description: 'A harmless fake mutation used only to prove that Agent Authority hides and blocks write-capable tools in read-only mode.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async () => ({
      content: [{ type: 'text', text: 'This validation-only fake write tool was called.' }]
    })
  );

  return server;
}

const handler = createMcpHandler(createValidationServer);
const nodeHandler = toNodeHandler(handler);

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'agent-authority-validation-upstream' }));
  }
  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not_found' }));
  }
  return nodeHandler(req, res);
});

httpServer.listen(port, host, () => {
  console.log(`Validation MCP upstream: http://${host}:${port}/mcp`);
  console.log('Tools: github_repo_metadata (read-only), dangerous_demo_write (fake write)');
});

async function shutdown() {
  await new Promise((resolve) => httpServer.close(resolve));
  await handler.close();
}

process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
