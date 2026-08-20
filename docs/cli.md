# Agent Authority CLI

The CLI is the user-facing control surface for the local Agent Authority runtime.

## Install from source

```bash
git clone https://github.com/Null-Square/agent-authority.git
cd agent-authority
npm install
npm link
```

This exposes both `agent-authority` and the short alias `aauth`.

## First-time setup

```bash
agent-authority setup
agent-authority doctor
agent-authority status
```

By default Agent Authority stores local state under:

```text
~/.agent-authority/
  config.json
  missions/
  state/
    connections.json
    revocations.json
    usage.json
  vault/
    master.key
    secrets.enc.json
  receipts/
```

Override the location with `AGENT_AUTHORITY_HOME` or `--home PATH`.

## Connect GitHub

The current native GitHub onboarding path accepts credentials only over stdin so secrets do not appear in shell history:

```bash
printf %s "$GITHUB_TOKEN" | agent-authority connect github --token-stdin
```

The CLI verifies the credential against GitHub by default, discovers the account login and stores the credential encrypted in the local vault. Use `--no-verify` only for offline development.

Browser/device OAuth is the next onboarding milestone; manual tokens are intentionally an interim developer path rather than the final UX.

List safe connection metadata:

```bash
agent-authority connections
```

Disconnect and delete the locally stored credential:

```bash
agent-authority disconnect github --account ACCOUNT_ID
```

## Run the authority daemon

```bash
agent-authority serve
```

Default bind address:

```text
127.0.0.1:8787
```

Override with:

```bash
agent-authority serve --host 127.0.0.1 --port 8787
```

or `AGENT_AUTHORITY_HOST` / `AGENT_AUTHORITY_PORT`.

The loopback default is intentional. Do not expose the local daemon publicly without an authenticated transport layer in front of it.

## Mission commands

Validate a mission:

```bash
agent-authority mission validate examples/mission.json
```

Evaluate an action locally without executing it:

```bash
agent-authority mission evaluate examples/mission.json \
  --service github \
  --action repo.read \
  --repository Null-Square/agent-authority
```

The command exits non-zero for denied actions, which makes it useful in scripts and CI.

## Operational commands

```bash
agent-authority status
agent-authority doctor
agent-authority --version
agent-authority --help
```

`doctor` checks the config, local encrypted vault, connection state and whether the configured daemon uses the safe loopback default.

## Config principles

- no credentials in `config.json`
- no credentials in mission manifests
- no credential command-line flags
- provider credentials remain behind the broker
- connection metadata is safe to show to agents; secret references are not
- revocations and cumulative budget usage persist across daemon restarts
- action receipts are written under `receipts/`

## Current security boundary

The local encrypted file vault uses AES-256-GCM and restrictive file permissions. Its master key is local to the same user account, so it protects against accidental plaintext exposure but is **not** a replacement for an OS keychain, hardware-backed key store, KMS/HSM, or remote enterprise vault. Production hardening will add pluggable key-store backends.
