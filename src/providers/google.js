import { brokeredProviderAdapter } from '../connections.js';

const MUTATING_ACTIONS = new Set(['event.create', 'event.delete']);
const SEND_UPDATES = new Set(['all', 'externalOnly', 'none']);

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fromHeader(message) {
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers)) return null;
  const header = headers.find((item) => String(item?.name || '').toLowerCase() === 'from');
  return typeof header?.value === 'string' ? header.value : null;
}

export function extractEmailAddress(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? match[1].trim().toLowerCase() : null;
}

export function gmailThreadSenderEmail(thread) {
  const messages = thread?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw providerError('gmail_thread_empty', 'Gmail thread does not contain any messages');
  }

  for (const message of messages) {
    const raw = fromHeader(message);
    const email = extractEmailAddress(raw);
    if (email) return { email, raw, message_id: message.id || null };
  }

  throw providerError('gmail_sender_missing', 'Gmail thread does not contain a usable From header');
}

/**
 * Trusted authority-extraction contract for the normalized Gmail thread output.
 *
 * The extractor chooses the authority-relevant selector only. It never returns
 * the value itself; TaskLease resolves output.sender_email after verifying the
 * guard's execution evidence. This prevents host code from substituting another
 * email while retaining the original Gmail receipt/evidence chain.
 */
export function gmailThreadSenderAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'gmail' || receipt?.action !== 'thread.read') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'Gmail sender authority extractor only accepts gmail:thread.read receipts'
    );
  }

  const normalized = extractEmailAddress(output?.sender_email);
  if (!normalized || normalized !== String(output.sender_email).trim().toLowerCase()) {
    throw providerError(
      'trusted_extractor_output_invalid',
      'normalized Gmail output does not contain a canonical sender_email'
    );
  }

  return {
    extractor_id: 'google.gmail.thread.sender-email.v1',
    selector: 'output.sender_email'
  };
}

function validateSendUpdates(value) {
  const normalized = value || 'none';
  if (!SEND_UPDATES.has(normalized)) {
    throw providerError('invalid_send_updates', 'context.send_updates must be all, externalOnly, or none');
  }
  return normalized;
}

function buildOperation(request, {
  gmailBaseUrl = 'https://gmail.googleapis.com',
  calendarBaseUrl = 'https://www.googleapis.com/calendar/v3'
} = {}) {
  const context = request?.context || {};

  if (request?.service === 'gmail' && request?.action === 'thread.read') {
    const threadId = required(context.thread_id, 'context.thread_id');
    const query = new URLSearchParams({ format: 'metadata' });
    query.append('metadataHeaders', 'From');
    return {
      method: 'GET',
      url: `${gmailBaseUrl}/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${query}`
    };
  }

  if (request?.service === 'calendar' && request?.action === 'event.create') {
    const calendarId = context.calendar_id || 'primary';
    const attendeeEmail = required(context.attendee_email, 'context.attendee_email');
    const startTime = required(context.start_time, 'context.start_time');
    const endTime = required(context.end_time, 'context.end_time');
    const sendUpdates = validateSendUpdates(context.send_updates);

    return {
      method: 'POST',
      url: `${calendarBaseUrl}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`,
      body: {
        summary: context.summary || 'Agent Authority task event',
        description: context.description || undefined,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
        attendees: [{ email: attendeeEmail }],
        transparency: context.transparency || undefined,
        visibility: context.visibility || undefined
      }
    };
  }

  if (request?.service === 'calendar' && request?.action === 'event.delete') {
    const calendarId = context.calendar_id || 'primary';
    const eventId = required(context.event_id, 'context.event_id');
    const sendUpdates = validateSendUpdates(context.send_updates);
    return {
      method: 'DELETE',
      url: `${calendarBaseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`
    };
  }

  throw providerError(
    'unsupported_action',
    `Google action ${request?.service || 'unknown'}:${request?.action || 'unknown'} has no provider operation mapping`
  );
}

function accessToken(credential) {
  const token = typeof credential === 'string' ? credential : credential?.access_token;
  if (!token) throw providerError('credential_invalid', 'Google credential does not contain an access token');
  return token;
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function normalizedOutput(request, response, body) {
  const common = {
    provider: request.service,
    status: response.status,
    ok: response.ok,
    request_id: response.headers?.get?.('x-request-id') || null
  };

  if (request.service === 'gmail' && request.action === 'thread.read') {
    const sender = gmailThreadSenderEmail(body);
    return {
      ...common,
      thread_id: body?.id || request.context?.thread_id || null,
      message_count: Array.isArray(body?.messages) ? body.messages.length : 0,
      sender_email: sender.email,
      sender_raw: sender.raw,
      sender_message_id: sender.message_id
    };
  }

  if (request.service === 'calendar' && request.action === 'event.create') {
    return {
      ...common,
      event_id: body?.id || null,
      html_link: body?.htmlLink || null,
      attendees: Array.isArray(body?.attendees)
        ? body.attendees.map((item) => item?.email).filter(Boolean)
        : []
    };
  }

  if (request.service === 'calendar' && request.action === 'event.delete') {
    return { ...common, deleted: response.ok };
  }

  return { ...common, body };
}

export function createGoogleProviderAdapter({
  broker,
  fetchImpl = globalThis.fetch,
  gmailBaseUrl = 'https://gmail.googleapis.com',
  calendarBaseUrl = 'https://www.googleapis.com/calendar/v3'
} = {}) {
  if (!broker) throw new Error('credential broker is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');

  const operationFor = (request) => buildOperation(request, { gmailBaseUrl, calendarBaseUrl });

  const adapter = brokeredProviderAdapter({
    kind: 'google-rest',
    services: ['gmail', 'calendar'],
    broker,
    async execute({ request, credential }) {
      const operation = operationFor(request);
      const response = await fetchImpl(operation.url, {
        method: operation.method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken(credential)}`,
          'content-type': 'application/json',
          'user-agent': 'nullsquare-agent-authority/0.4'
        },
        body: operation.body ? JSON.stringify(operation.body) : undefined
      });

      const body = await responseBody(response);
      const output = normalizedOutput(request, response, body);

      if (!response.ok) {
        const error = providerError('provider_error', `${request.service} API ${response.status}`);
        error.provider_output = output;
        throw error;
      }

      return output;
    }
  });

  adapter.validateRequest = (request) => operationFor(request);
  adapter.isMutation = (request) => MUTATING_ACTIONS.has(request?.action);
  adapter.authorityExtractor = (request, kind = 'email.address') => {
    if (request?.service === 'gmail' && request?.action === 'thread.read' && kind === 'email.address') {
      return gmailThreadSenderAuthorityExtractor;
    }
    return null;
  };
  return adapter;
}
