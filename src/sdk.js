export class AgentAuthorityClient {
  constructor({ baseUrl = 'http://127.0.0.1:8787' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path, { method = 'POST', payload } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
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

  evaluate(mission, request) {
    return this.request('/v1/evaluate', { payload: { mission, request } });
  }

  prepare(mission, request) {
    return this.request('/v1/prepare', { payload: { mission, request } });
  }

  execute(mission, request) {
    return this.request('/v1/execute', { payload: { mission, request } });
  }

  revoke(mission_id, reason) {
    return this.request('/v1/revoke', { payload: { mission_id, reason } });
  }

  listConnections(principal_id) {
    const query = new URLSearchParams({ principal_id });
    return this.request(`/v1/connections?${query}`, { method: 'GET' });
  }
}
