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

- [ ] integrate one coding-agent/tool-middleware harness
- [ ] integrate one MCP client through an authority proxy
- [ ] integrate one connector-style SaaS tool
- [ ] define an interoperability fixture suite
- [ ] build a CLI `evaluate` command and local mission loader

Success criterion: the same mission semantics govern actions from at least three different harness styles.

## M2 — Credential isolation

- [ ] OAuth/OIDC adapter with real short-lived token flow
- [ ] API-key vault reference adapter
- [ ] cloud temporary-credential adapter
- [ ] CLI child-process credential injection
- [ ] threat tests for secret exfiltration and confused-deputy attacks

Success criterion: an agent can execute authorized actions without receiving the long-lived root credential in its model context.

## M3 — Human approvals + identity

- [ ] portable approval request format
- [ ] terminal approval UI
- [ ] web/mobile approval prototype
- [ ] agent runtime identity binding experiment
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
