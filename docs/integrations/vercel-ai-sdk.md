# Vercel AI SDK integration

Agent Authority can protect existing Vercel AI SDK tools without replacing `ToolLoopAgent`, changing the model provider, or moving credentials into Agent Authority.

The integration wraps each executable AI SDK tool at its `execute(input, options)` boundary. The tool keeps its existing description, input schema, approval metadata, and execution implementation.

```text
ToolLoopAgent
     |
     | model selects tool
     v
AI SDK tool.execute(input)
     |
     v
Agent Authority Task Lease
     |
 ALLOW / DENY / STEP-UP
     |
     v
existing tool effect / provider SDK
```

## Install

```bash
npm install @nullsquare/agent-authority ai
```

Current AI SDK 7 requires Node.js 22+. Agent Authority itself remains Node.js 20+ and does not depend on `ai` at runtime.

## Wrap existing tools

Start with normal AI SDK tools:

```js
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';

const tools = {
  commentIssue: tool({
    description: 'Comment on a GitHub issue',
    inputSchema: z.object({
      repository: z.string(),
      issue_number: z.number(),
      body: z.string()
    }),
    execute: ({ repository, issue_number, body }) =>
      github.issues.createComment({
        owner: repository.split('/')[0],
        repo: repository.split('/')[1],
        issue_number,
        body
      })
  })
};
```

Create a Task Lease and guard as usual, then wrap the tools:

```js
import { AuthorityRuntime } from '@nullsquare/agent-authority';
import { createTaskLeaseGuard } from '@nullsquare/agent-authority/guard';
import { protectAiSdkTools } from '@nullsquare/agent-authority/integrations/ai-sdk';

const guard = createTaskLeaseGuard({
  lease,
  runtime: new AuthorityRuntime()
});

const protectedTools = protectAiSdkTools({
  tools,
  guard,
  requests: {
    commentIssue: ({ repository, issue_number }) => ({
      service: 'github',
      action: 'issue.comment',
      context: { repository, issue_number }
    })
  }
});

const agent = new ToolLoopAgent({
  model,
  tools: protectedTools
});
```

The rest of the AI SDK application remains unchanged.

## Fail-closed behavior

Every tool with an `execute` function must have an authority request mapper.

If a developer forgets to map an executable tool, Agent Authority replaces its execution path with a failure:

```text
ai_sdk_tool_unmapped
```

The original tool effect is not called.

Tools without an `execute` function are preserved because AI SDK does not automatically execute them in-process.

## Resource expansion

Suppose the Task Lease binds `issue_number` to issue `9`.

The model may call:

```json
{
  "repository": "Null-Square/agent-authority",
  "issue_number": 9,
  "body": "hello"
}
```

and the existing tool effect can run.

If the model changes only the issue number:

```json
{
  "repository": "Null-Square/agent-authority",
  "issue_number": 1,
  "body": "hello"
}
```

Agent Authority returns `authority_delta_required` before the tool's original `execute` function is invoked.

## What CI proves

The repository has a dedicated Node 22 integration job using the current `ai@7` package, the real `ToolLoopAgent`, the real `tool()` helper, and AI SDK's deterministic mock language model.

It proves:

1. `ToolLoopAgent` selects and automatically executes a protected tool through Agent Authority.
2. The authorized effect executes exactly once.
3. A different task resource executes zero effects.
4. An executable tool without a request mapping executes zero effects.

No model API key is needed for this validation.

## Security boundary

This wrapper protects the tool execution path that is actually passed to the agent. It cannot protect a separate provider client or unwrapped tool that the agent can reach through another path.

```text
GOOD

ToolLoopAgent -> protectedTools -> Agent Authority -> provider

BYPASSABLE

ToolLoopAgent -> protectedTools -> Agent Authority -> provider
       \
        -> separate unwrapped provider/tool path
```

Use the wrapper as the only executable path for the protected capability.
