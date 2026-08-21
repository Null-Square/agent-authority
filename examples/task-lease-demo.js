import { AuthorityRuntime } from '../src/index.js';
import { createTaskLeaseGuard } from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';

const mission = {
  version: '0.1',
  mission_id: 'mission:handle-demo-request',
  principal: { id: 'user:demo' },
  agent: { id: 'agent:ops-demo' },
  objective: 'Handle one demo inquiry',
  resources: [
    {
      service: 'gmail',
      allow: ['thread.read'],
      deny: ['email.delete'],
      constraints: { thread: ['thread:demo-91'] }
    },
    {
      service: 'calendar',
      allow: ['event.create'],
      deny: ['event.delete'],
      constraints: {}
    }
  ],
  constraints: { expires_at: '2099-01-01T00:00:00Z' }
};

const lease = createTaskLease({
  mission,
  request: 'Handle the demo request in thread:demo-91',
  roots: [
    { fact_id: 'fact:origin-thread', kind: 'gmail.thread', value: 'thread:demo-91' }
  ],
  bindings: [
    {
      service: 'calendar',
      action: 'event.create',
      context_field: 'attendee',
      fact_id: 'fact:requester-email'
    }
  ]
});

const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });

console.log('1. Read only the task-authorized Gmail thread');
const read = await guard.run({
  service: 'gmail',
  action: 'thread.read',
  context: { thread: 'thread:demo-91' }
}, async () => ({
  sender: 'customer@example.com',
  subject: 'Can we book a demo next week?'
}));
console.log(`   ALLOW -> sender discovered: ${read.output.sender}`);

console.log('2. Bind discovered sender to future calendar authority');
lease.derive({
  fact_id: 'fact:requester-email',
  kind: 'email.address',
  value: read.output.sender,
  from: ['fact:origin-thread'],
  receipt: read.receipt,
  selector: 'output.sender'
});
console.log('   derived fact -> fact:requester-email');

console.log('3. Create a meeting only with that derived attendee');
const meeting = await guard.run({
  service: 'calendar',
  action: 'event.create',
  context: { attendee: 'customer@example.com' }
}, async () => ({ event_id: 'event:724' }));
console.log(`   ALLOW -> ${meeting.output.event_id}`);

console.log('4. Try the same calendar capability for an unrelated person');
try {
  await guard.run({
    service: 'calendar',
    action: 'event.create',
    context: { attendee: 'other@example.com' }
  }, async () => ({ event_id: 'should-never-exist' }));
} catch (error) {
  console.log(`   ${error.result.decision.toUpperCase()} -> ${error.code}`);
  console.log('   side effect did not run');
}

console.log('5. Complete the task');
lease.complete('demo request handled');
try {
  await guard.run({
    service: 'gmail',
    action: 'thread.read',
    context: { thread: 'thread:demo-91' }
  }, async () => ({ sender: 'should-not-run@example.com' }));
} catch (error) {
  console.log(`   ${error.result.decision.toUpperCase()} -> ${error.code}`);
}
