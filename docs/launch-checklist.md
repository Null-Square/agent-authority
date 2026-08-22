# Developer-preview launch checklist

Agent Authority should not be announced as a production-ready security product. The first public release is a developer preview, and the announcement is gated on executable evidence.

## Required evidence

- [x] Task Lease cannot exceed its mission ceiling.
- [x] Derived authority requires same-lease provenance, a parent lineage, and an extraction selector.
- [x] A real GitHub resource can be discovered dynamically and become derived task authority.
- [x] A real GitHub mutation can execute against that derived resource.
- [x] An unrelated mutation is blocked before the provider call.
- [x] Task completion blocks later provider calls even while the underlying credential remains available.
- [x] Current Vercel AI SDK `ToolLoopAgent` executes protected tools through Agent Authority.
- [x] Unmapped executable AI SDK tools fail closed.
- [x] The packed npm artifact installs in a clean consumer project using only public exports.
- [x] Optional framework integrations do not become production dependencies of the core package.
- [ ] Release-candidate CI and CodeQL are green on the exact commit to be published.
- [ ] npm registry publication is verified from a clean install.

## Claims we can make

For execution paths that are actually placed behind Agent Authority, the runtime can enforce task-bound resource constraints immediately before a side effect, including resources derived from authorized earlier execution.

## Claims we must not make

- Agent Authority is not a complete sandbox for an agent that also has an unguarded route to the same provider.
- Recorded derivation provenance is not yet cryptographic proof that a provider response contained the extracted value.
- The project is not production-ready and has not yet proven durable multi-process Task Lease state.
- Task-scoped agent authorization as a research concept was not invented by NullSquare.
