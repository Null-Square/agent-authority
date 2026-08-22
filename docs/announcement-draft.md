# Announcement draft — hold until registry verification

NullSquare is open-sourcing **Agent Authority**, an experimental runtime for task-bounded AI agent side effects.

AI agents often inherit account permissions much broader than the task a user approved. Agent Authority keeps the existing identity, OAuth, SDK, MCP server, or agent framework, but places a Task Lease immediately before consequential effects.

A Task Lease can follow resources discovered through authorized execution without silently broadening to unrelated resources. In the public validation suite, Agent Authority discovers a live GitHub issue, derives that issue number as task authority, performs one real comment mutation, blocks a different issue before the provider call, then blocks the previously authorized issue after the task completes.

The developer preview also includes a Vercel AI SDK integration that wraps ordinary `ToolLoopAgent` tools at their existing `execute` boundary.

**Give your agent a task, not your account.**

This is a developer preview, not a claim that NullSquare invented task-scoped authorization and not a production-ready security control. The repository documents the current trust assumptions and bypass boundaries explicitly.
