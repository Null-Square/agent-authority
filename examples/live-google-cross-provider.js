import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import {
  gmailThreadSenderAuthorityExtractor,
  gmailThreadSenderEmail
} from '../src/providers/google.js';
import { createTaskLease } from '../src/task-lease.js';

const token = process.env.GOOGLE_ACCESS_TOKEN;
const threadId = process.env.AA_GOOGLE_GMAIL_THREAD_ID;
const calendarId = process.env.AA_GOOGLE_CALENDAR_ID || 'primary';
const expectedSender = process.env.AA_GOOGLE_EXPECTED_SENDER?.trim().toLowerCase() || null;

if (!token) throw new Error('GOOGLE_ACCESS_TOKEN is required for live Google validation');
if (!threadId) throw new Error('AA_GOOGLE_GMAIL_THREAD_ID is required for live Google validation');

const now = Date.now();
const startTime = new Date(now + 10 * 60_000).toISOString();
const endTime = new Date(now + 25 * 60_000).toISOString();
const marker = `Agent Authority live Google validation ${new Date(now).toISOString()}`;

const mission = {
  version: '0.1',
  mission_id: `mission:live-google-cross-provider:${now}`,
  principal: { id: 'user:google-validation' },
  agent: { id: 'agent:google-cross-provider-validation' },
  objective: 'Read one authorized Gmail thread and create one Calendar event only for the sender discovered from that thread',
  resources: [
    {
      service: 'gmail',
      allow: ['thread.read'],
      deny: ['message.send', 'message.delete', 'thread.delete'],
      constraints: { thread_id: [threadId] }
    },
    {
      service: 'calendar',
      allow: ['event.create'],
      deny: ['event.delete', 'calendar.delete'],
      constraints: { calendar_id: [calendarId] }
    }
  ],
  constraints: { expires_at: new Date(now + 15 * 60_000).toISOString() }
};

const lease = createTaskLease({
  mission,
  request: 'Schedule one temporary validation event with the sender in the approved Gmail thread',
  roots: [
    {
      fact_id: 'fact:gmail-thread',
      kind: 'gmail.thread',
      value: threadId,
      source: 'validation-task'
    },
    {
      fact_id: 'fact:calendar',
      kind: 'google.calendar',
      value: calendarId,
      source: 'validation-task'
    }
  ],
  bindings: [
    {
      service: 'gmail',
      action: 'thread.read',
      context_field: 'thread_id',
      fact_id: 'fact:gmail-thread'
    },
    {
      service: 'calendar',
      action: 'event.create',
      context_field: 'calendar_id',
      fact_id: 'fact:calendar'
    },
    {
      service: 'calendar',
      action: 'event.create',
      context_field: 'attendee_email',
      fact_id: 'fact:sender-email'
    }
  ],
  expires_at: new Date(now + 10 * 60_000).toISOString()
});

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
const providerHeaders = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'user-agent': 'agent-authority-live-google-validation/0.4'
};

let providerReadCalls = 0;
let providerMutationCalls = 0;
let cleanupCalls = 0;
let createdEventId = null;

async function googleResponse(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...providerHeaders, ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    throw new Error(`Google API ${response.status}: ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function readAuthorizedThread() {
  return guard.run(
    {
      service: 'gmail',
      action: 'thread.read',
      context: { thread_id: threadId }
    },
    async () => {
      providerReadCalls += 1;
      const query = new URLSearchParams({ format: 'metadata' });
      query.append('metadataHeaders', 'From');
      const thread = await googleResponse(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${query}`
      );
      const sender = gmailThreadSenderEmail(thread);
      return {
        provider: 'gmail',
        thread_id: thread.id,
        sender_email: sender.email,
        sender_raw: sender.raw,
        sender_message_id: sender.message_id,
        message_count: Array.isArray(thread.messages) ? thread.messages.length : 0
      };
    }
  );
}

async function createCalendarEvent(attendeeEmail, suffix) {
  const request = {
    service: 'calendar',
    action: 'event.create',
    context: {
      calendar_id: calendarId,
      attendee_email: attendeeEmail,
      start_time: startTime,
      end_time: endTime,
      summary: `${marker} — ${suffix}`,
      transparency: 'transparent',
      visibility: 'private',
      send_updates: 'none'
    }
  };

  return guard.run(request, async () => {
    providerMutationCalls += 1;
    const event = await googleResponse(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: request.context.summary,
          description: 'Temporary event created by the Agent Authority live Gmail → Calendar validation. Cleanup deletes it after the proof.',
          start: { dateTime: startTime },
          end: { dateTime: endTime },
          attendees: [{ email: attendeeEmail }],
          transparency: 'transparent',
          visibility: 'private'
        })
      }
    );
    return { event_id: event.id, html_link: event.htmlLink || null };
  });
}

async function cleanupEvent(eventId) {
  cleanupCalls += 1;
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: 'DELETE', headers: providerHeaders }
  );
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`Google Calendar cleanup ${response.status}: ${body.slice(0, 300)}`);
  }
}

try {
  console.log(`Task root Gmail thread: ${threadId}`);
  console.log(`Task root Calendar: ${calendarId}`);
  console.log('1. Read the approved Gmail thread through the Task Lease');
  const discovered = await readAuthorizedThread();
  console.log(`   ALLOW -> Gmail returned sender ${discovered.output.sender_email}`);

  if (expectedSender && discovered.output.sender_email !== expectedSender) {
    throw new Error(`expected sender ${expectedSender}, got ${discovered.output.sender_email}`);
  }

  const senderFact = lease.deriveFromEvidence({
    fact_id: 'fact:sender-email',
    kind: 'email.address',
    from: ['fact:gmail-thread'],
    receipt: discovered.receipt,
    evidence: discovered.evidence,
    output: discovered.output,
    extractor: gmailThreadSenderAuthorityExtractor
  });
  console.log(`2. Evidence-verified authority -> Calendar attendee ${senderFact.value}`);

  const allowed = await createCalendarEvent(senderFact.value, 'authorized');
  createdEventId = allowed.output.event_id;
  console.log(`3. ALLOW -> real Calendar event mutation executed (${createdEventId})`);

  try {
    await createCalendarEvent('blocked@example.invalid', 'must-never-run');
    throw new Error('unrelated attendee mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
      throw error;
    }
    console.log('4. STEP-UP -> unrelated attendee blocked before Calendar provider mutation');
  }

  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one task-side Calendar mutation before completion, got ${providerMutationCalls}`);
  }

  lease.complete('live Gmail to Calendar validation complete');
  try {
    await createCalendarEvent(senderFact.value, 'must-not-run-after-completion');
    throw new Error('post-completion Calendar mutation unexpectedly executed');
  } catch (error) {
    if (!(error instanceof AuthorityDeniedError) || error.code !== 'task_lease_completed') {
      throw error;
    }
    console.log('5. DENY -> post-completion Calendar mutation blocked');
  }

  if (providerReadCalls !== 1) {
    throw new Error(`expected exactly one Gmail provider read, got ${providerReadCalls}`);
  }
  if (providerMutationCalls !== 1) {
    throw new Error(`expected exactly one Calendar provider mutation after blocked attempts, got ${providerMutationCalls}`);
  }

  console.log('PASS -> a sender discovered from real Gmail became evidence-verified exact authority for one real Calendar mutation');
  console.log('PASS -> unrelated and post-completion attempts caused zero additional Calendar provider mutations');
} finally {
  if (createdEventId) {
    await cleanupEvent(createdEventId);
    console.log(`Cleanup -> deleted temporary Calendar event ${createdEventId} outside the agent authority proof`);
  }
  console.log(`Provider calls observed before cleanup: gmail_reads=${providerReadCalls}, calendar_task_mutations=${providerMutationCalls}`);
  console.log(`Harness cleanup calls: ${cleanupCalls}`);
}
