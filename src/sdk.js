export class AgentAuthorityClient {
  constructor({ baseUrl = 'http://127.0.0.1:8787' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path, payload) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Agent Authority ${response.status}: ${await response.text()}`);
    return response.json();
  }

  evaluate(mission, request) {
    return this.request('/v1/evaluate', { mission, request });
  }

  prepare(mission, request) {
    return this.request('/v1/prepare', { mission, request });
  }

  revoke(mission_id, reason) {
    return this.request('/v1/revoke', { mission_id, reason });
  }
}
