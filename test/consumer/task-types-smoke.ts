import {
  createTask,
  type AuthorityRelation,
  type SemanticRequest,
  type TaskExecution
} from '@nullsquare/agent-authority/task';

const relation: AuthorityRelation = 'oneOf';

const task = createTask({
  principal: 'user:typescript-smoke',
  agent: 'agent:typescript-smoke',
  request: 'Post only to approved channels',
  permissions: {
    slack: { allow: ['message.send'], constraints: {} }
  },
  authority: {
    channels: { kind: 'slack.channel-set', value: ['general', 'random'] }
  },
  bindings: [
    {
      service: 'slack',
      action: 'message.send',
      field: 'channel',
      authority: 'channels',
      relation
    }
  ]
});

const request: SemanticRequest = {
  service: 'slack',
  action: 'message.send',
  context: { channel: 'general', body: 'hello' }
};

async function run(): Promise<TaskExecution<{ ok: true }>> {
  return task.run(request, async () => ({ ok: true as const }));
}

void run;

const maxRelation: AuthorityRelation = 'max';
task.bind({
  service: 'slack',
  action: 'message.send',
  field: 'sequence',
  authority: 'sequenceMax',
  relation: maxRelation
});

const explanation = task.explain({
  decision: 'require_approval',
  code: 'authority_delta_required'
});

const summary: string = explanation.summary;
void summary;
