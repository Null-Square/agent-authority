import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { hashObject } from './index.js';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function unb64url(input) {
  return Buffer.from(input, 'base64url');
}

function sign(key, body) {
  return createHmac('sha256', key).update(body).digest();
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function grantRequestFingerprint(mission, request) {
  return hashObject({
    mission_id: mission.mission_id,
    principal_id: mission.principal.id,
    agent_id: mission.agent.id,
    request
  });
}

/**
 * Issue a short-lived execution grant for a harness-managed connector.
 *
 * This mode is for environments where the harness already owns the provider
 * connection (for example ChatGPT connectors, an IDE's GitHub integration, or
 * an enterprise agent platform). Agent Authority never receives the provider
 * OAuth token. Instead, trusted connector middleware verifies this grant before
 * allowing the exact service/action/request to execute.
 */
export function issueHarnessActionGrant({ key, mission, request, ttl_seconds = 30, now = Date.now() }) {
  if (!key) throw new Error('harness grant signing key is required');
  if (!mission?.mission_id || !mission?.principal?.id || !mission?.agent?.id) throw new Error('valid mission is required');
  if (!request?.service || !request?.action) throw new Error('request.service and request.action are required');
  if (!Number.isFinite(Number(ttl_seconds)) || Number(ttl_seconds) <= 0 || Number(ttl_seconds) > 300) {
    throw new Error('ttl_seconds must be between 1 and 300');
  }

  const issued = Math.floor(now / 1000);
  const claims = {
    v: 1,
    typ: 'agent-authority-harness-grant',
    grant_id: `grant:${randomUUID()}`,
    principal_id: mission.principal.id,
    agent_id: mission.agent.id,
    mission_id: mission.mission_id,
    service: request.service,
    action: request.action,
    request_hash: grantRequestFingerprint(mission, request),
    iat: issued,
    exp: issued + Number(ttl_seconds)
  };

  const body = b64url(JSON.stringify(claims));
  const signature = b64url(sign(key, body));
  return { token: `${body}.${signature}`, claims };
}

export function verifyHarnessActionGrant(token, { key, mission, request, now = Date.now() } = {}) {
  if (!key) throw new Error('harness grant signing key is required');
  if (!token || typeof token !== 'string') throw new Error('harness action grant is required');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) throw new Error('invalid harness action grant format');

  const expected = sign(key, body);
  const actual = unb64url(signature);
  if (!safeEqual(expected, actual)) {
    const error = new Error('invalid harness action grant signature');
    error.code = 'grant_signature_invalid';
    throw error;
  }

  let claims;
  try { claims = JSON.parse(unb64url(body).toString('utf8')); }
  catch {
    const error = new Error('invalid harness action grant payload');
    error.code = 'grant_payload_invalid';
    throw error;
  }

  if (claims.typ !== 'agent-authority-harness-grant' || claims.v !== 1) {
    const error = new Error('unsupported harness action grant');
    error.code = 'grant_type_invalid';
    throw error;
  }
  if (Math.floor(now / 1000) >= Number(claims.exp)) {
    const error = new Error('harness action grant expired');
    error.code = 'grant_expired';
    throw error;
  }

  if (mission) {
    if (claims.principal_id !== mission.principal?.id) throw Object.assign(new Error('grant principal mismatch'), { code: 'grant_principal_mismatch' });
    if (claims.agent_id !== mission.agent?.id) throw Object.assign(new Error('grant agent mismatch'), { code: 'grant_agent_mismatch' });
    if (claims.mission_id !== mission.mission_id) throw Object.assign(new Error('grant mission mismatch'), { code: 'grant_mission_mismatch' });
  }
  if (request) {
    if (claims.service !== request.service || claims.action !== request.action) {
      throw Object.assign(new Error('grant action mismatch'), { code: 'grant_action_mismatch' });
    }
    if (!mission) throw new Error('mission is required when verifying an exact request');
    const fingerprint = grantRequestFingerprint(mission, request);
    if (claims.request_hash !== fingerprint) {
      throw Object.assign(new Error('grant request mismatch'), { code: 'grant_request_mismatch' });
    }
  }

  return claims;
}

/**
 * Small helper intended for harness/plugin authors. A connector wrapper calls
 * this immediately before the provider connector. The wrapper, not the model,
 * must own this verification boundary.
 */
export function createHarnessConnectorGate({ key }) {
  return {
    verify({ grant, mission, request }) {
      return verifyHarnessActionGrant(grant, { key, mission, request });
    }
  };
}
