import { randomUUID } from 'node:crypto';

function key(principalId, service, accountId = 'default') {
  return `${principalId}\u0000${service}\u0000${accountId}`;
}

export class AccountConnectionRegistry {
  constructor() {
    this.connections = new Map();
  }

  connect({ principal_id, service, account_id = 'default', auth_kind, credential_ref, scopes = [], metadata = {} }) {
    if (!principal_id) throw new Error('principal_id is required');
    if (!service) throw new Error('service is required');
    if (!auth_kind) throw new Error('auth_kind is required');
    if (!credential_ref) throw new Error('credential_ref is required');

    const connection = {
      connection_id: `connection:${randomUUID()}`,
      principal_id,
      service,
      account_id,
      auth_kind,
      credential_ref,
      scopes: [...new Set(scopes)],
      metadata,
      status: 'active',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.connections.set(key(principal_id, service, account_id), connection);
    return { ...connection };
  }

  get({ principal_id, service, account_id = 'default' }) {
    const connection = this.connections.get(key(principal_id, service, account_id));
    return connection ? { ...connection } : null;
  }

  list(principal_id) {
    return [...this.connections.values()]
      .filter((connection) => !principal_id || connection.principal_id === principal_id)
      .map((connection) => ({ ...connection }));
  }

  disconnect({ principal_id, service, account_id = 'default' }) {
    const current = this.connections.get(key(principal_id, service, account_id));
    if (!current) return null;
    const connection = {
      ...current,
      status: 'revoked',
      updated_at: new Date().toISOString()
    };
    this.connections.set(key(principal_id, service, account_id), connection);
    return { ...connection };
  }
}

/**
 * Development/test secret store only. Production deployments MUST replace this
 * with an encrypted OS keychain, HSM/KMS-backed vault, or remote secrets service.
 */
export class InMemorySecretStore {
  constructor() {
    this.secrets = new Map();
  }

  put(value) {
    const ref = `secret:${randomUUID()}`;
    this.secrets.set(ref, value);
    return ref;
  }

  get(ref) {
    if (!this.secrets.has(ref)) throw new Error('credential secret is unavailable');
    return this.secrets.get(ref);
  }

  delete(ref) {
    return this.secrets.delete(ref);
  }
}

export class CredentialBroker {
  constructor({ connections = new AccountConnectionRegistry(), secrets = new InMemorySecretStore() } = {}) {
    this.connections = connections;
    this.secrets = secrets;
  }

  connect({ principal_id, service, account_id = 'default', auth_kind, credential, scopes = [], metadata = {} }) {
    if (credential === undefined || credential === null) throw new Error('credential is required');

    const previous = this.connections.get({ principal_id, service, account_id });
    const credential_ref = this.secrets.put(credential);
    let connection;

    try {
      connection = this.connections.connect({
        principal_id,
        service,
        account_id,
        auth_kind,
        credential_ref,
        scopes,
        metadata
      });
    } catch (error) {
      this.secrets.delete(credential_ref);
      throw error;
    }

    if (previous?.credential_ref && previous.credential_ref !== credential_ref) {
      this.secrets.delete(previous.credential_ref);
    }
    return connection;
  }

  getConnection({ principal_id, service, account_id = 'default' }) {
    return this.connections.get({ principal_id, service, account_id });
  }

  listConnections(principal_id) {
    return this.connections.list(principal_id).map(({ credential_ref, ...safe }) => safe);
  }

  resolveInternal({ principal_id, service, account_id = 'default' }) {
    const connection = this.connections.get({ principal_id, service, account_id });
    if (!connection || connection.status !== 'active') {
      const error = new Error(`no active ${service} connection for this principal`);
      error.code = 'connection_required';
      throw error;
    }

    return {
      connection,
      credential: this.secrets.get(connection.credential_ref)
    };
  }

  disconnect({ principal_id, service, account_id = 'default' }) {
    const current = this.connections.get({ principal_id, service, account_id });
    if (!current) return null;
    this.secrets.delete(current.credential_ref);
    const connection = this.connections.disconnect({ principal_id, service, account_id });
    if (!connection) return null;
    const { credential_ref, ...safe } = connection;
    return safe;
  }
}

export function brokeredProviderAdapter({ kind, services, broker, execute, prepare }) {
  if (!kind) throw new Error('adapter kind is required');
  if (!Array.isArray(services) || services.length === 0) throw new Error('adapter services are required');
  if (!broker) throw new Error('credential broker is required');
  if (typeof execute !== 'function') throw new Error('adapter execute function is required');

  const supports = (service) => services.some((pattern) => {
    if (pattern === '*' || pattern === service) return true;
    return pattern.endsWith('*') && service.startsWith(pattern.slice(0, -1));
  });

  return {
    kind,
    supports,
    async prepare({ mission, request }) {
      const connection = broker.getConnection({
        principal_id: mission.principal.id,
        service: request.service,
        account_id: request.account_id || 'default'
      });

      if (!connection || connection.status !== 'active') {
        return {
          kind,
          service: request.service,
          action: request.action,
          connection_required: true
        };
      }

      return prepare
        ? prepare({ mission, request, connection })
        : {
            kind,
            service: request.service,
            action: request.action,
            connection_id: connection.connection_id,
            account_id: connection.account_id,
            scopes: connection.scopes
          };
    },
    async execute({ mission, request }) {
      const { connection, credential } = broker.resolveInternal({
        principal_id: mission.principal.id,
        service: request.service,
        account_id: request.account_id || 'default'
      });

      return execute({ mission, request, connection, credential });
    }
  };
}
