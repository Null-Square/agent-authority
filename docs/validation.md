# Validate Agent Authority

The v0.5 validation target is deliberately practical:

> **A developer should be able to keep an existing agent framework, tools, SDKs, and credentials while Agent Authority prevents a protected tool from executing outside the human-approved task.**

This is a product-layer validation, not a claim of production readiness.

## The primary proof: protect existing tools

Agent Authority now wraps ordinary tool objects at their `execute()` boundary.

```text
model / agent framework
        |
        v
   protected tool
        |
        v
   Agent Authority
      Task Lease
        |
   ALLOW / DENY / STEP-UP
        |
        v
 original tool.execute()
        |
        v
 provider / SDK / API
```

If the decision is `DENY` or `REQUIRE_APPROVAL`, the original `execute()` callback is never invoked.

The framework does not need to understand Agent Authority.

## 1. Install and run the core checks

Requirements: Node.js 20+.

```bash
npm install
npm test
npm run demo:task-lease
```

The Task Lease demo proves:

1. one authorized read succeeds;
2. a concrete resource is derived from that authorized execution;
3. a later side effect may use exactly that derived resource;
4. a different concrete resource becomes `authority_delta_required`;
5. completing the task removes the task authority.

## 2. Validate inside a real agent framework

Run:

```bash
npm run demo:vercel-ai
```

This uses the real Vercel AI SDK `ToolLoopAgent`, `tool()`, and `MockLanguageModelV3` APIs.

The important property is that the **model chooses the tool calls**. The demo is not a hand-written sequence pretending to be an agent.

### Authorized flow

```text
ToolLoopAgent
   |
   | model selects
   v
readThread(thread:91)
   |
   v
Agent Authority -> ALLOW
   |
   v
provider effect executes once
   |
   v
output.sender = customer@example.com
   |
   v
derived task authority
   |
   | model selects
   v
createMeeting(customer@example.com)
   |
   v
Agent Authority -> ALLOW
   |
   v
calendar effect executes once
```

### Adversarial flow

The mock model deliberately selects:

```text
createMeeting(attacker@example.com)
```

Expected result:

```text
Agent Authority -> authority_delta_required
calendar provider effects -> 0
```

The model can choose the wrong effect. The provider still must not receive it.

This exact demonstration is a dedicated GitHub Actions job named `framework-validation`.

## 3. Validate against a real external provider

Run:

```bash
npm run demo:live-github
```

The script uses the real public GitHub REST API.

Its Task Lease permits exactly:

```text
Null-Square/agent-authority
```

The first request is allowed and reaches `api.github.com`.

The script then tries:

```text
octocat/Hello-World
```

That second resource is outside the Task Lease. Agent Authority returns an authority delta before `fetch()` executes.

The pass condition is exactly one outbound GitHub call.

The CI version of this proof has recorded:

```text
ALLOW -> live GitHub returned Null-Square/agent-authority
Outbound GitHub calls: 1
STEP-UP -> octocat/Hello-World is outside task authority
PASS -> unrelated repository was blocked before fetch()
```

No GitHub credential is required. If `GITHUB_TOKEN` is supplied locally, the demo uses it without printing it.

## 4. Network-boundary test

The automated suite also includes a local HTTP provider with deliberately broad credentials.

The provider counts actual network requests rather than trusting an in-process callback counter.

The test verifies:

```text
allowed task resource
    -> authenticated HTTP request reaches provider

unrelated resource
    -> Agent Authority blocks
    -> zero additional provider requests

task completed
    -> previously allowed resource blocked
    -> zero additional provider requests
```

This demonstrates the distinction between **standing provider connectivity** and **temporary task authority**.

## 5. Fail-closed tool mapping

`protectTools()` expects every protected tool to have an authority mapping.

```js
const tools = protectTools(existingTools, {
  lease,
  runtime,
  mappings: {
    readThread: {
      service: 'gmail',
      action: 'thread.read',
      context: ({ input }) => ({ thread: input.threadId })
    },
    createMeeting: {
      service: 'calendar',
      action: 'event.create',
      context: ({ input }) => ({ attendee: input.attendee })
    }
  }
});
```

If `existingTools` contains another tool with no mapping, setup fails instead of silently exposing an unprotected execution path.

`allowUnmapped: true` exists only for tools intentionally outside the authority boundary, such as pure local calculations. Using it broadens the trusted application boundary and should be explicit.

## 6. Derived-authority replay behavior

Agents often repeat reads. Repeating the same trusted derivation should not break a normal tool loop.

v0.5 therefore treats an identical derived fact as idempotent:

```text
fact:sender = customer@example.com
        +
same derivation again
        -> no-op
```

But a later attempt to change that established fact is rejected:

```text
fact:sender = customer@example.com
        +
new value = attacker@example.com
        -> derived_fact_conflict
```

The existing task authority remains unchanged.

## 7. MCP interoperability remains secondary

Agent Authority still includes an MCP v2 gateway and wire-level MCP tests. MCP is one transport around the same authority runtime, not the product identity.

For the MCP validation path:

```bash
npm run demo:mcp-upstream
```

Then, in another terminal:

```bash
aauth mcp proxy \
  --upstream http://127.0.0.1:8791/mcp \
  --mission examples/missions/chatgpt-web-validation.json \
  --service mcp:validation-upstream
```

The gateway must allow the mission-authorized read and reject unrelated resources or write-capable tools before they reach upstream.

## Automated validation matrix

PR validation currently includes:

- Node 20 tests;
- Node 22 tests;
- coverage;
- syntax checks;
- npm package dry-run;
- Task Lease demo;
- Vercel AI SDK `framework-validation`;
- live GitHub API validation;
- CodeQL.

## What these proofs establish

They support these claims:

1. Agent Authority can sit around existing tool execution without replacing the framework.
2. The framework/model can choose the tool call; authorization still happens immediately before the effect.
3. Protected unauthorized effects do not invoke the provider callback.
4. A protected request for an unrelated resource does not silently inherit authority.
5. Authority discovered during an authorized task can constrain a later tool call.
6. Repeated identical derivation is safe and idempotent; conflicting derivation is rejected.
7. The same repository still supports non-framework and MCP enforcement paths.

## What these proofs do **not** establish

They do not prove that Agent Authority can intercept arbitrary alternate execution paths.

If the same agent also receives any of the following outside the protected boundary:

- a raw provider credential;
- an unwrapped provider client;
- unrestricted shell access;
- unrestricted browser automation;
- another unprotected tool to the same service;

then it may bypass `protectTools()` entirely.

Agent Authority protects the execution paths placed behind it. Stronger isolation requires brokered credentials, sandboxing, or host-level integration.

The v0.5 derived-value extractor is also still trusted application code. Agent Authority records the source receipt, selector, parent facts, and lineage, but does not yet cryptographically prove that the mapped value came from the provider response.

## Current pass/fail criterion

v0.5 passes only if all of these are true:

- a normal existing tool can be wrapped without changing its public schema/description;
- allowed tool effects execute exactly once;
- denied or step-up effects execute zero times;
- unmapped tools fail closed by default;
- a real `ToolLoopAgent` can complete the intended multi-tool task;
- the same framework can choose an unrelated effect and Agent Authority blocks it before provider execution;
- a real GitHub API request succeeds for the authorized repository while an unrelated repository causes no second outbound request;
- CI, coverage, packaging, and CodeQL remain green.

The next validation milestone is **not another framework**. It is a real two-service workflow where an authorized read from service A derives the concrete resource allowed for a side effect in service B.
