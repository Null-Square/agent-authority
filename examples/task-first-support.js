import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import { gmailThreadSenderAuthorityExtractor } from '../src/providers/google.js';
import { createTask } from '../src/task.js';

const threadId = 'thread:demo-91';
const calendarId = 'primary';

const task = createTask({
  principal: 'user:demo',
  agent: 'agent:support-demo',
  request: 'Handle the customer request in this email thread and schedule the requested meeting',
  permissions: {
    gmail: {
      allow: ['thread.read'],
      deny: ['email.delete'],
      constraints: { thread_id: [threadId] }
    },
    calendar: {
      allow: ['event.create'],
      deny: ['event.delete'],
      constraints: { calendar_id: [calendarId] }
    }
  },
  authority: {
    originThread: { kind: 'gmail.thread', value: threadId },
    calendar: { kind: 'calendar.id', value: calendarId }
  },
  bindings: [
    { service: 'gmail', action: 'thread.read', field: 'thread_id', authority: 'originThread' },
    { service: 'calendar', action: 'event.create', field: 'calendar_id', authority: 'calendar' }
  ]
});

let gmailReads = 0;
let calendarMutations = 0;

console.log('Task: Handle one customer email and schedule only the meeting justified by that thread');
console.log('1. Read the exact task-authorized Gmail thread');
const read = await task.run({
  service: 'gmail',
  action: 'thread.read',
  context: { thread_id: threadId }
}, async () => {
  gmailReads += 1;
  // Replace with the existing Gmail adapter/SDK call. This shape matches the
  // normalized output produced by createGoogleProviderAdapter().
  return {
    provider: 'gmail',
    sender_email: 'customer@example.com',
    thread_id: threadId,
    message_count: 1
  };
});
console.log(`   ALLOW -> sender discovered: ${read.output.sender_email}`);

const customer = task.authorityFrom(read, {
  name: 'customerEmail',
  kind: 'email.address',
  from: 'originThread',
  extractor: gmailThreadSenderAuthorityExtractor
});

task.bind({
  service: 'calendar',
  action: 'event.create',
  field: 'attendee_email',
  authority: 'customerEmail'
});
console.log(`2. Authority follows the guarded Gmail result -> ${customer.value}`);

const meetingContext = {
  calendar_id: calendarId,
  attendee_email: customer.value,
  start_time: '2030-01-15T10:00:00Z',
  end_time: '2030-01-15T10:30:00Z'
};

const meeting = await task.run({
  service: 'calendar',
  action: 'event.create',
  context: meetingContext
}, async () => {
  calendarMutations += 1;
  return { provider: 'calendar', event_id: 'event:customer-demo' };
});
console.log(`3. ALLOW -> Calendar event ${meeting.output.event_id} for ${customer.value}`);

try {
  await task.run({
    service: 'calendar',
    action: 'event.create',
    context: { ...meetingContext, attendee_email: 'other@example.com' }
  }, async () => {
    calendarMutations += 1;
    return { event_id: 'must-not-exist' };
  });
  throw new Error('unrelated attendee unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
    throw error;
  }
  console.log('4. STEP-UP -> unrelated attendee blocked before Calendar mutation');
  console.log(`   ${task.explain(error).summary}`);
}

if (calendarMutations !== 1) {
  throw new Error(`expected exactly one Calendar mutation, got ${calendarMutations}`);
}

task.complete('customer request handled');
try {
  await task.run({
    service: 'calendar',
    action: 'event.create',
    context: meetingContext
  }, async () => {
    calendarMutations += 1;
    return { event_id: 'must-not-run-after-completion' };
  });
  throw new Error('post-completion Calendar mutation unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityDeniedError) || error.code !== 'task_lease_completed') throw error;
  console.log('5. DENY -> task completion removed the meeting authority');
}

console.log(`Provider-shaped callbacks: gmail_reads=${gmailReads}, calendar_mutations=${calendarMutations}`);
console.log('PASS -> one authorized email established exactly one downstream Calendar attendee');
