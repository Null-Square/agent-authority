const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function postForm(fetchImpl, url, values) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'nullsquare-agent-authority/0.1'
    },
    body: new URLSearchParams(values).toString()
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error_description || body?.error || `GitHub OAuth HTTP ${response.status}`);
    error.code = body?.error || 'github_oauth_http_error';
    throw error;
  }
  return body;
}

export async function requestGitHubDeviceCode({ clientId, scopes = [], fetchImpl = globalThis.fetch } = {}) {
  required(clientId, 'clientId');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const values = { client_id: clientId };
  if (scopes.length) values.scope = [...new Set(scopes)].join(' ');
  const body = await postForm(fetchImpl, DEVICE_CODE_URL, values);

  return {
    device_code: required(body.device_code, 'GitHub device_code'),
    user_code: required(body.user_code, 'GitHub user_code'),
    verification_uri: required(body.verification_uri, 'GitHub verification_uri'),
    expires_in: Number(body.expires_in || 900),
    interval: Math.max(1, Number(body.interval || 5))
  };
}

export async function pollGitHubDeviceToken({
  clientId,
  deviceCode,
  interval = 5,
  expiresIn = 900,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now()
} = {}) {
  required(clientId, 'clientId');
  required(deviceCode, 'deviceCode');
  const startedAt = now();
  const deadline = startedAt + Number(expiresIn) * 1000;
  let pollInterval = Math.max(1, Number(interval));

  while (now() < deadline) {
    const body = await postForm(fetchImpl, ACCESS_TOKEN_URL, {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });

    if (body.access_token) {
      return {
        access_token: body.access_token,
        token_type: body.token_type || 'bearer',
        scope: body.scope || ''
      };
    }

    if (body.error === 'authorization_pending') {
      await sleep(pollInterval * 1000);
      continue;
    }
    if (body.error === 'slow_down') {
      pollInterval += 5;
      await sleep(pollInterval * 1000);
      continue;
    }

    const error = new Error(body.error_description || body.error || 'GitHub device authorization failed');
    error.code = body.error || 'github_device_authorization_failed';
    throw error;
  }

  const error = new Error('GitHub device authorization expired');
  error.code = 'expired_token';
  throw error;
}

export async function verifyGitHubIdentity({ accessToken, fetchImpl = globalThis.fetch } = {}) {
  required(accessToken, 'accessToken');
  const response = await fetchImpl(USER_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'nullsquare-agent-authority/0.1'
    }
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.message || `GitHub identity verification failed with ${response.status}`);
    error.code = 'github_identity_verification_failed';
    throw error;
  }
  return {
    id: body.id,
    login: required(body.login, 'GitHub login'),
    name: body.name || null,
    avatar_url: body.avatar_url || null
  };
}

/**
 * Interactive local/headless bootstrap. The caller is responsible for showing
 * verification_uri + user_code to the human. No GitHub token is returned.
 * Once authorized, the token is stored directly behind the CredentialBroker.
 */
export async function connectGitHubWithDeviceFlow({
  broker,
  principalId,
  accountId = 'default',
  clientId,
  scopes = [],
  fetchImpl = globalThis.fetch,
  sleep,
  now,
  onVerification
} = {}) {
  required(broker, 'broker');
  required(principalId, 'principalId');

  const device = await requestGitHubDeviceCode({ clientId, scopes, fetchImpl });
  if (onVerification) {
    await onVerification({
      verification_uri: device.verification_uri,
      user_code: device.user_code,
      expires_in: device.expires_in
    });
  }

  const token = await pollGitHubDeviceToken({
    clientId,
    deviceCode: device.device_code,
    interval: device.interval,
    expiresIn: device.expires_in,
    fetchImpl,
    sleep,
    now
  });
  const identity = await verifyGitHubIdentity({ accessToken: token.access_token, fetchImpl });
  const grantedScopes = token.scope ? token.scope.split(',').map((item) => item.trim()).filter(Boolean) : scopes;

  broker.connect({
    principal_id: principalId,
    service: 'github',
    account_id: accountId,
    auth_kind: 'github-device-oauth',
    credential: { access_token: token.access_token, token_type: token.token_type },
    scopes: grantedScopes,
    metadata: { provider_user_id: identity.id, login: identity.login, name: identity.name, avatar_url: identity.avatar_url }
  });

  const connection = broker.listConnections(principalId)
    .find((item) => item.service === 'github' && item.account_id === accountId);

  return { connection, identity };
}
