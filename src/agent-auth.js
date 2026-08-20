import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ISSUER = 'agent-authority';
const AUDIENCE = 'agent-authority';

function b64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function decodeJson(segment, label) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    const error = new Error(`invalid ${label}`);
    error.code = 'invalid_agent_token';
    throw error;
  }
}

function sign(key, signingInput) {
  return createHmac('sha256', key).update(signingInput).digest('base64url');
}

function tokenError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseTtl(value, fallback = 3600) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) return Number(value);
  const match = String(value).trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) throw new Error('TTL must be seconds or a value such as 30m, 2h, or 1d');
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return amount * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit]);
}

export function createAgentToken({
  key,
  principal_id,
  agent_id,
  mission_id = null,
  capabilities = ['evaluate', 'prepare', 'execute', 'approval.read'],
  ttl_seconds = 3600,
  now = Date.now()
}) {
  if (!key || Buffer.byteLength(key) < 32) throw new Error('agent signing key must contain at least 32 bytes');
  if (!principal_id) throw new Error('principal_id is required');
  if (!agent_id) throw new Error('agent_id is required');
  const ttl = Number(ttl_seconds);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 86400) throw new Error('agent token TTL must be between 1 and 86400 seconds');

  const issued = Math.floor(now / 1000);
  const header = { alg: 'HS256', typ: 'AAUTH' };
  const payload = {
    v: 1,
    iss: ISSUER,
    aud: AUDIENCE,
    sub: agent_id,
    principal_id,
    mission_id,
    capabilities: [...new Set(capabilities)],
    iat: issued,
    exp: issued + ttl,
    jti: randomUUID()
  };

  const encodedHeader = b64url(header);
  const encodedPayload = b64url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${sign(key, signingInput)}`;
}

export function decodeAgentToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw tokenError('invalid_agent_token', 'agent token must contain three segments');
  return { header: decodeJson(parts[0], 'agent token header'), payload: decodeJson(parts[1], 'agent token payload') };
}

export function verifyAgentToken(token, {
  key,
  principal_id,
  mission = null,
  mission_id = null,
  capability = null,
  now = Date.now()
} = {}) {
  if (!key) throw new Error('agent signing key is required');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw tokenError('invalid_agent_token', 'missing or malformed agent bearer token');
  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const header = decodeJson(encodedHeader, 'agent token header');
  const payload = decodeJson(encodedPayload, 'agent token payload');
  if (header.alg !== 'HS256' || header.typ !== 'AAUTH') throw tokenError('invalid_agent_token', 'unsupported agent token format');

  const expected = sign(key, `${encodedHeader}.${encodedPayload}`);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(providedSignature);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw tokenError('invalid_agent_token', 'agent token signature is invalid');
  }

  const current = Math.floor(now / 1000);
  if (payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.v !== 1) throw tokenError('invalid_agent_token', 'agent token issuer, audience, or version is invalid');
  if (!payload.sub || !payload.principal_id || !payload.exp) throw tokenError('invalid_agent_token', 'agent token claims are incomplete');
  if (current >= Number(payload.exp)) throw tokenError('agent_token_expired', 'agent token has expired');
  if (Number(payload.iat) > current + 60) throw tokenError('invalid_agent_token', 'agent token was issued in the future');
  if (principal_id && payload.principal_id !== principal_id) throw tokenError('principal_mismatch', 'agent token principal does not match this authority instance');

  const expectedMissionId = mission?.mission_id || mission_id;
  if (payload.mission_id && expectedMissionId && payload.mission_id !== expectedMissionId) {
    throw tokenError('mission_binding_mismatch', 'agent token is bound to a different mission');
  }
  if (mission) {
    if (mission.principal?.id !== payload.principal_id) throw tokenError('principal_mismatch', 'mission principal does not match agent token');
    if (mission.agent?.id !== payload.sub) throw tokenError('agent_identity_mismatch', 'mission agent does not match authenticated agent instance');
  }

  if (capability) {
    const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : [];
    if (!capabilities.includes('*') && !capabilities.includes(capability)) {
      throw tokenError('agent_capability_denied', `agent token does not permit ${capability}`);
    }
  }
  return payload;
}

export function bearerToken(headers = {}) {
  const value = typeof headers.get === 'function' ? headers.get('authorization') : headers.authorization;
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw tokenError('missing_agent_token', 'Authorization: Bearer <agent-token> is required');
  return match[1].trim();
}
