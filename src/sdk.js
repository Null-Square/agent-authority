export class AgentAuthorityClient {
  constructor({ baseUrl = 'http://127.0.0.1:8787', token = null, tokenProvider = null, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
  }

  async currentToken() {
    if (typeof this.tokenProvider === 'function') return this.tokenProvider();
    return this.token;
  }

  async request(path, { method = 'POST', payload, authenticated = true } = {}) {
    const headers = {};
    if (payload !== undefined) headers['content-type'] = 'application/json';
    if (authenticated) {
      const token = await this.currentToken();
      if (!token) throw new Error('Agent Authority client requires an agent-instance token');
      headers.authorization = `Bearer ${token}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });

    const text = await response.text();
    let body = text;
    if (text) {
      try { body = JSON.parse(text); } catch { /* preserve text */ }
    }

    if (!response.ok) {
      const error = new Error(`Agent Authority ${response.status}: ${typeof body === 'string' ? body : body?.error || 'request failed'}`);
      error.status = response.status;
      error.response = body;
      throw error;
    }
    return body;
  }

  health() {
    return this.request('/health', { method: 'GET', authenticated: false });
  }

  discover() {
    return this.request('/.well-known/agent-authority', { method: 'GET', authenticated: false });
  }

  evaluate(mission, request) {
    return this.request('/v1/evaluate', { payload: { mission, request } });
  }

  prepare(mission, request) {
    return this.request('/v1/prepare', { payload: { mission, request } });
  }

  execute(mission, request) {
    return this.request('/v1/execute', { payload: { mission, request } });
  }

  approval(approval_id) {
    return this.request(`/v1/approvals/${encodeURIComponent(approval_id)}`, { method: 'GET' });
  }

  revoke(mission_id, reason) {
    return this.request('/v1/revoke', { payload: { mission_id, reason } });
  }

  listConnections() {
    return this.request('/v1/connections', { method: 'GET' });
  }
}
