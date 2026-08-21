# Agent Authority Roadmap

The project is intentionally implementation-first. We want to discover the smallest interoperable authority layer through real agent-harness integrations before declaring a protocol standard.

## M0 — Public bootstrap

- [x] mission manifest concept
- [x] allow / deny / require-approval policy outcomes
- [x] expiry, budgets, delegation depth
- [x] subagent attenuation guard
- [x] mission revocation
- [x] action receipts
- [x] adapter abstraction
- [x] local HTTP sidecar
- [x] runnable demo and tests
- [x] public architecture and contribution docs

## M1 — Real agent integrations

- [x] add hosted-harness connector bridge mode for platforms that keep OAuth credentials internal
- [x] dogfood one mission across real GitHub + Gmail harness-managed connectors without exposing provider credentials to Agent Authority
- [ ] integrate one coding-agent/tool-middleware harness with non-bypassable connector middleware
- [ ] integrate one MCP client through an authority proxy
- [ ] integrate one connector-style SaaS tool through a reusable platform adapter
- [ ] define an interoperability fixture suite
- [x] build CLI mission validation/evaluation and local mission loader

Success criterion: the same mission semantics govern actions from at least three different harness styles, with at least one integration enforcing the grant outside model-controlled code.

## M2 — Credential isolation

- [ ] OAuth/OIDC adapter with real short-lived token flow
- [x] encrypted local credential vault for development/pre-alpha use
- [ ] OS keychain/KMS-backed production vault backend
- [ ] API-key vault reference adapter
- [ ] cloud temporary-credential adapter
- [ ] CLI child-process credential injection
- [x] threat tests for identity substitution, approval replay, request substitution and duplicate mutation execution
- [ ] broader secret-exfiltration and confused-deputy threat suite

Success criterion: an agent can execute authorized actions without receiving the long-lived root credential in its model context.

## M3 — Human approvals + identity

- [x] durable approval request format
- [x] terminal approval administration commands
- [x] short-lived signed agent-instance tokens
- [ ] web/mobile approval prototype
- [ ] platform-native agent runtime identity binding
- [ ] signed mission-manifest experiment
- [ ] signed receipt experiment

## M4 — MCP and legacy compatibility

- [ ] production-grade MCP authority proxy
- [ ] OAuth discovery/token-exchange mapping
- [ ] browser/session broker threat model
- [ ] isolated legacy-browser proof of concept
- [ ] service capability discovery experiment

## M5 — Delegated agent networks

- [ ] recursive child missions
- [ ] cryptographically verifiable delegation chain
- [ ] durable revocation propagation
- [ ] cross-agent receipt lineage
- [ ] multi-agent concurrency and budget accounting

## M6 — Open specification candidate

Only after interoperability evidence:

- [ ] formalize mission schema
- [ ] formalize capability naming/discovery
- [ ] formalize approval and receipt objects
- [ ] map cleanly to OAuth, MCP authorization, workload identity, and emerging agent-auth standards
- [ ] publish independent implementation test vectors
- [ ] evaluate appropriate standards venue

## Research questions

We actively want competing proposals for token format, capability vocabulary, agent identity, approval portability, receipt logging, browser isolation, and mapping mission context into existing/future OAuth authorization mechanisms.
