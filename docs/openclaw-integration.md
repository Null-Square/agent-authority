# OpenClaw Integration Blueprint

Agent Authority should integrate with OpenClaw as a **tool/service authority layer**, not as a replacement agent harness.

## Why

OpenClaw's agent harness abstraction owns execution of an agent turn. Agent Authority owns a different concern: whether a human-authorized agent may perform a sensitive external action and which connected credential may be used to perform it.

## Recommended v1

```text
OpenClaw agent/runtime
      |
      | proposed sensitive action
      v
Agent Authority OpenClaw tool/plugin
      |
      v
Agent Authority sidecar
      |
      +-- mission policy
      +-- resource constraints
      +-- approval
      +-- account connection
      +-- credential broker
      +-- receipt
      |
      v
provider adapter / MCP / connector
      |
      v
external service
```

### Installation shape

1. User installs Agent Authority once on the OpenClaw host or points OpenClaw to a hosted Agent Authority endpoint.
2. User connects GitHub/Google/etc. once to Agent Authority.
3. OpenClaw installs/enables a small trusted Agent Authority plugin.
4. The plugin exposes authority-aware tools or wraps sensitive tool execution.
5. Codex, Claude Code, ACP agents, or embedded OpenClaw runtimes can all reuse the same connected accounts.

## v1 plugin responsibilities

The OpenClaw plugin should remain intentionally thin:

- resolve the current Agent Authority endpoint
- attach the current mission id / agent session identity
- translate OpenClaw tool calls into normalized service/action/context requests
- call `/v1/execute`
- surface `deny` and `require_approval` outcomes cleanly
- return sanitized provider output

It should **not** store OAuth refresh tokens, duplicate the connection registry, or implement provider-specific credentials itself.

## Example mapping

```text
OpenClaw tool: github_read_file
repository: Null-Square/agent-authority
path: src/index.js

=>

service: github
action: repo.contents.read
context.repository: Null-Square/agent-authority
params.path: src/index.js
```

The authority runtime then checks mission policy and repository constraints before the GitHub adapter is allowed to use the connected credential.

## Native Codex vs ACP

The integration should work identically whether OpenClaw is using its native Codex harness or an external ACP harness such as Claude Code. Harness identity is metadata supplied to Agent Authority; it is not where the provider credentials live.

```text
OpenClaw native Codex ----\
                          \
OpenClaw Claude ACP --------> Agent Authority ----> GitHub
                          /
OpenClaw Gemini ACP ------/
```

This is an important interoperability proof: switching harnesses must not require reconnecting GitHub.

## Security properties

- Provider secrets never enter the LLM prompt or OpenClaw transcript.
- A denied tool call causes no provider dispatch.
- Mission resource constraints bind access to the intended repo/account/project.
- Revocation applies across all OpenClaw harnesses using the mission.
- Provider responses are sanitized before returning to the model.

## Future deeper integration

If OpenClaw exposes a stable trusted pre-tool execution/policy hook, Agent Authority can integrate there so existing tools are governed transparently. This should remain a plugin integration over the same sidecar/control-plane API rather than moving the authority database or credential vault into the harness.
