import { dirname, join } from 'node:path';
import { AdapterRegistry, descriptorAdapter } from './index.js';
import { CredentialBroker } from './connections.js';
import { ExecutingAuthorityRuntime } from './execution.js';
import { createGitHubProviderAdapter } from './providers/github.js';
import { JsonFileApprovalStore } from './approvals.js';
import { JsonFileExecutionGuard } from './idempotency.js';
import { readOrCreateSecretKey } from './keys.js';
import {
  EncryptedFileSecretStore,
  JsonFileConnectionRegistry,
  JsonFileRevocationStore,
  JsonFileUsageLedger,
  loadConfig
} from './storage.js';

export function createRuntimeEnvironment({ home } = {}) {
  const config = loadConfig({ home });
  const connections = new JsonFileConnectionRegistry(config.paths.connections);
  const secrets = new EncryptedFileSecretStore({ path: config.paths.secrets, keyPath: config.paths.master_key });
  const broker = new CredentialBroker({ connections, secrets });
  const revocations = new JsonFileRevocationStore(config.paths.revocations);
  const usage = new JsonFileUsageLedger(config.paths.usage);
  const stateDir = dirname(config.paths.connections);
  const vaultDir = dirname(config.paths.master_key);
  const approvals = new JsonFileApprovalStore(join(stateDir, 'approvals.json'));
  const executions = new JsonFileExecutionGuard(join(stateDir, 'executions.json'));
  const agentAuthKeyPath = join(vaultDir, 'agent-auth.key');
  const agentAuthKey = readOrCreateSecretKey(agentAuthKeyPath);

  const adapters = new AdapterRegistry()
    .register(createGitHubProviderAdapter({ broker }))
    .register(descriptorAdapter('oauth', ['google', 'slack', 'microsoft']))
    .register(descriptorAdapter('mcp', ['mcp:*']))
    .register(descriptorAdapter('api-key', ['cloudflare', 'apollo']))
    .register(descriptorAdapter('cli', ['cli:*']));

  const runtime = new ExecutingAuthorityRuntime({ adapters, revocations, usage, approvals, executions });
  return {
    config,
    connections,
    secrets,
    broker,
    revocations,
    usage,
    approvals,
    executions,
    adapters,
    runtime,
    agentAuthKey,
    agentAuthKeyPath
  };
}
