import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthorityRuntime } from '../src/index.js';
import { createTaskLease } from '../src/task-lease.js';
import { protectTool, protectTools } from '../src/protect-tools.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:protect-tools',
    principal: { id: 'user:test' },
    agent: { id: 'agent:test' },
    objective: 'Handle one demo request',
    resources: [
      {
        service: 'gmail',
        allow: ['thread.read'],
        deny: ['email.delete'],
        constraints: { thread: ['thread:91'] }
      },
      {
        service: 'calendar',
        allow: ['event.create'],
        deny: ['event.delete'],
        constraints: {}
      }
    ],
    constraints: {}
  };
}

function taskLease() {
  return createTaskLease({
    mission: mission(),
    request: 'Handle demo thread 91',
    roots: [{ fact_id: 'fact:thread', kind: 'gmail.thread', value: 'thread:91' }],
    bindings: [{
      service: 'calendar',
      action: 'event.create',
      context_field: 'attendee',
      fact_id: 'fact:sender'
    }]
  });
}

function protectedReadTool(lease, execute) {
  return protectTool({ execute }, {
    service: 'gmail',
    action: 'thread.read',
    context: ({ input }) => ({ thread: input.threadId }),
    derive: [{
      fact_id: 'fact:sender',
      kind: 'email.address',
      from: ['fact:thread'],
      selector: 'output.sender',
      value: ({ output }) => output.sender
    }]
  }, {
    lease,
    runtime: new AuthorityRuntime()
  });
}

test('protectTool preserves tool shape and executes allowed effect once', async () => {
  let calls = 0;
  const tool = {
    description: 'Read one email thread',
    inputSchema: { marker: true },
    execute: async ({ threadId }) => {
      calls += 1;
      return { threadId, sender: 'customer@example.com' };
    }
  };

  const wrapped = protectTool(tool, {
    service: 'gmail',
    action: 'thread.read',
    context: ({ input }) => ({ thread: input.threadId })
  }, {
    lease: taskLease(),
    runtime: new AuthorityRuntime()
  });

  assert.equal(wrapped.description, tool.description);
  assert.equal(wrapped.inputSchema, tool.inputSchema);
  assert.notEqual(wrapped.execute, tool.execute);

  const output = await wrapped.execute({ threadId: 'thread:91' });
  assert.equal(output.sender, 'customer@example.com');
  assert.equal(calls, 1);
});

test('blocked tool input never reaches original execute callback', async () => {
  let calls = 0;
  const wrapped = protectTool({
    execute: async () => { calls += 1; return 'should-not-run'; }
  }, {
    service: 'gmail',
    action: 'thread.read',
    context: ({ input }) => ({ thread: input.threadId })
  }, {
    lease: taskLease(),
    runtime: new AuthorityRuntime()
  });

  await assert.rejects(
    () => wrapped.execute({ threadId: 'thread:other' }),
    (error) => error.code === 'resource_constraint_mismatch'
  );
  assert.equal(calls, 0);
});

test('protected read can derive authority used by a later protected tool', async () => {
  const lease = taskLease();
  const runtime = new AuthorityRuntime();
  let calendarCalls = 0;

  const tools = protectTools({
    readThread: {
      description: 'Read thread',
      execute: async () => ({ sender: 'customer@example.com' })
    },
    createMeeting: {
      description: 'Create meeting',
      execute: async ({ attendee }) => {
        calendarCalls += 1;
        return { eventId: 'event:1', attendee };
      }
    }
  }, {
    lease,
    runtime,
    mappings: {
      readThread: {
        service: 'gmail',
        action: 'thread.read',
        context: ({ input }) => ({ thread: input.threadId }),
        derive: [{
          fact_id: 'fact:sender',
          kind: 'email.address',
          from: ['fact:thread'],
          selector: 'output.sender',
          value: ({ output }) => output.sender
        }]
      },
      createMeeting: {
        service: 'calendar',
        action: 'event.create',
        context: ({ input }) => ({ attendee: input.attendee })
      }
    }
  });

  await tools.readThread.execute({ threadId: 'thread:91' });
  assert.equal(lease.fact('fact:sender').value, 'customer@example.com');

  const allowed = await tools.createMeeting.execute({ attendee: 'customer@example.com' });
  assert.equal(allowed.eventId, 'event:1');
  assert.equal(calendarCalls, 1);

  await assert.rejects(
    () => tools.createMeeting.execute({ attendee: 'attacker@example.com' }),
    (error) => error.code === 'authority_delta_required'
  );
  assert.equal(calendarCalls, 1);
});

test('repeating the same authorized read reuses identical derived authority', async () => {
  const lease = taskLease();
  let reads = 0;
  const wrapped = protectedReadTool(lease, async () => {
    reads += 1;
    return { sender: 'customer@example.com' };
  });

  await wrapped.execute({ threadId: 'thread:91' });
  const first = lease.fact('fact:sender');
  await wrapped.execute({ threadId: 'thread:91' });
  const second = lease.fact('fact:sender');

  assert.equal(reads, 2);
  assert.equal(second.value, 'customer@example.com');
  assert.equal(second.created_at, first.created_at);
  assert.equal(second.provenance.receipt_id, first.provenance.receipt_id);
});

test('a repeated read cannot silently change an established derived fact', async () => {
  const lease = taskLease();
  let sender = 'customer@example.com';
  const wrapped = protectedReadTool(lease, async () => ({ sender }));

  await wrapped.execute({ threadId: 'thread:91' });
  sender = 'attacker@example.com';

  await assert.rejects(
    () => wrapped.execute({ threadId: 'thread:91' }),
    (error) => error.code === 'derived_fact_conflict'
  );
  assert.equal(lease.fact('fact:sender').value, 'customer@example.com');
});

test('protectTools fails closed when a tool has no authority mapping', () => {
  assert.throws(
    () => protectTools({ read: { execute: async () => null } }, {
      lease: taskLease(),
      runtime: new AuthorityRuntime(),
      mappings: {}
    }),
    /missing Agent Authority mapping for tool read/
  );
});

test('protectTools rejects mappings for unknown tools', () => {
  assert.throws(
    () => protectTools({ read: { execute: async () => null } }, {
      lease: taskLease(),
      runtime: new AuthorityRuntime(),
      mappings: {
        read: { service: 'gmail', action: 'thread.read' },
        typo: { service: 'gmail', action: 'thread.read' }
      }
    }),
    /authority mapping references unknown tool typo/
  );
});

test('allowUnmapped is explicit and preserves intentionally unprotected local tools', () => {
  const calculator = { execute: async ({ a, b }) => a + b };
  const protectedSet = protectTools({ calculator }, {
    lease: taskLease(),
    runtime: new AuthorityRuntime(),
    mappings: {},
    allowUnmapped: true
  });

  assert.equal(protectedSet.calculator, calculator);
});
