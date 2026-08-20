# Validate Agent Authority in 5 minutes

The goal of this validation is deliberately narrow:

> A real MCP host should only be able to call the tool + resource allowed by a human mission, while the upstream provider/tool remains unaware of Agent Authority.

This is a product-layer test, not a benchmark and not a claim of production readiness.

## What this proves

The repository includes:

- an Agent Authority MCP gateway (`aauth mcp proxy`)
- a tiny validation upstream with one real read-only GitHub metadata tool
- one fake write-capable tool that must never pass the gateway in read-only mode
- a canonical mission restricted to `Null-Square/agent-authority`
- wire-level tests using the official MCP v2 client SDK

The path is:

```text
MCP host
  -> Agent Authority
       -> mission policy
            -> allowed read-only tool
                 -> validation MCP upstream
                      -> public GitHub API
```

## 1. Install and initialize

```bash
npm install
npm link

aauth setup --principal user:local
aauth doctor
```

## 2. Run the tiny validation upstream

Terminal A:

```bash
npm run demo:mcp-upstream
```

It listens on `http://127.0.0.1:8791/mcp` and advertises two tools:

- `github_repo_metadata` — explicitly read-only; reads public GitHub repository metadata
- `dangerous_demo_write` — harmless fake mutation used only to prove the gateway blocks write-capable tools

## 3. Put Agent Authority in front of it

Terminal B:

```bash
aauth mcp proxy \
  --upstream http://127.0.0.1:8791/mcp \
  --mission examples/missions/chatgpt-web-validation.json \
  --service mcp:validation-upstream
```

The gateway listens on `http://127.0.0.1:8790/mcp`.

It intentionally binds loopback only and refuses a public bind in this release.

## Expected behavior

A client connected to the Agent Authority gateway should:

1. see `github_repo_metadata`
2. not see the fake write-capable tool in read-only mode
3. succeed for:

```json
{
  "name": "github_repo_metadata",
  "arguments": {
    "repository": "Null-Square/agent-authority"
  }
}
```

4. be denied if it changes the repository to another value
5. be denied if it tries to call the write-capable tool directly even if it knows the upstream tool name

The key property is #5: hiding a tool is UX; enforcing `tools/call` is the security boundary.

## Automated proof

Run:

```bash
npm test
```

The MCP tests cover the gateway policy directly and use the official MCP v2 client against the actual Agent Authority handler. No external provider credentials are required.

## ChatGPT / hosted OpenAI validation

ChatGPT cannot connect directly to a localhost MCP server. OpenAI supports Secure MCP Tunnel for connecting local/private MCP servers to supported OpenAI products without exposing the server publicly.

Use the official `openai/tunnel-client` quickstart (`tunnel-client help quickstart`) and point the tunnel at:

```text
http://127.0.0.1:8790/mcp
```

Then configure the resulting tunnel-backed MCP endpoint/app in the supported OpenAI product.

Product/plan availability for custom MCP apps changes over time; if the ChatGPT workspace does not expose custom MCP app creation, the same tunnel endpoint can be validated from another supported OpenAI surface or any MCP v2 client. Do not weaken Agent Authority security merely to work around a UI/plan limitation.

## Pass/fail criterion

The validation passes only if all of these are true:

- the host discovers the authorized read-only tool
- the authorized repository read succeeds
- an out-of-mission repository is rejected before reaching the upstream tool
- a write-capable tool is rejected before reaching the upstream tool
- changing the host does not require changing the mission semantics

If those conditions hold from ChatGPT and from at least one non-OpenAI MCP client, we have useful validation that Agent Authority is the policy layer rather than an OpenAI-specific connector.
