# Security Policy

Agent Authority sits on a security-critical boundary. Please treat vulnerabilities that could bypass policy, expand delegated authority, leak credentials, forge approvals/receipts, defeat revocation, or cross mission boundaries as sensitive.

## Reporting

For non-sensitive hardening ideas, open a GitHub issue.

For exploitable vulnerabilities, please use GitHub's private vulnerability reporting / Security Advisory flow when available rather than publishing exploit details in a public issue.

Do not include real credentials, OAuth tokens, passwords, cookies, customer data, or production secrets in reports, tests, screenshots, logs, or reproductions.

## Current security status

The repository is an early executable MVP, not yet a production credential broker. Current adapter descriptors do **not** perform real OAuth token exchange, secret-vault access, browser-session isolation, or cryptographic mission signing. Those gaps are intentional and documented.

## Security invariants

- deny overrides allow
- unknown capabilities fail closed
- child authority must not exceed parent authority
- revocation must stop subsequent actions
- credentials should remain outside model context
- approval must happen before credential dispatch
- receipts must be attributable to a mission, principal, agent, and action

Security review contributions are especially welcome.
